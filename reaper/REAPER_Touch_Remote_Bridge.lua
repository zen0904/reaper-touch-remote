-- REAPER Touch Remote authoritative bridge
-- Install through Actions > Show action list > ReaScript: Load, then run once per REAPER session.

local sep = package.config:sub(1, 1)
local bridge_dir = reaper.GetResourcePath() .. sep .. "REAPER Touch Remote"
local state_file = bridge_dir .. sep .. "state.json"
local temp_file = bridge_dir .. sep .. "state.json.tmp"
local command_file = bridge_dir .. sep .. "commands.tsv"
local installed_fx_file = bridge_dir .. sep .. "installed-fx.json"
local command_offset = 0
local last_write = 0
local selected_track_guid = nil
local selected_fx_index = nil
local native_track_guid = nil
local native_fx_index = nil
local parameter_choice_cache = {}
local probe_slots = {}
local next_probe_slot = 0

local function shell_quote(value) return "'" .. value:gsub("'", "'\\''") .. "'" end
os.execute("mkdir -p " .. shell_quote(bridge_dir))
local reset = io.open(command_file, "w") if reset then reset:close() end

local function escape(value)
  return tostring(value or ""):gsub("\\", "\\\\"):gsub('"', '\\"'):gsub("\b", "\\b"):gsub("\f", "\\f"):gsub("\n", "\\n"):gsub("\r", "\\r"):gsub("\t", "\\t")
end
local function json_string(value) return '"' .. escape(value) .. '"' end
local function bool(value) return value and "true" or "false" end
local function number(value) value=tonumber(value) or 0; if value ~= value or value == math.huge or value == -math.huge then return "0" end return string.format("%.8g", value) end
local function format_param_normalized(track,fx,param,value)
  -- Older REAPER Lua bindings require an explicit output-buffer string, while
  -- newer releases expose the same API with four arguments. Support both and
  -- treat unsupported vendor formatting as an empty label instead of aborting
  -- the continuously running bridge.
  local ok,retval,label=pcall(reaper.TrackFX_FormatParamValueNormalized,track,fx,param,value,"")
  if not ok then ok,retval,label=pcall(reaper.TrackFX_FormatParamValueNormalized,track,fx,param,value) end
  if not ok or not retval then return "" end
  return label or ""
end

local probe_source=[=[desc:RTR Spectrum Probe
slider1:0<0,255,1>Probe slot
options:gmem=RTR_SPECTRUM

@init
fft_size=1024;
fft_pos=0;
peak_l=0;
peak_r=0;

@slider
gbase=floor(slider1)*80;

@sample
peak_l=max(peak_l,abs(spl0));
peak_r=max(peak_r,abs(spl1));
fftbuf[fft_pos*2]=(spl0+spl1)*0.5;
fftbuf[fft_pos*2+1]=0;
fft_pos+=1;
fft_pos>=fft_size ? (
  fft_pos=0;
  i=0;
  loop(fft_size,
    fftbuf[i*2]*=0.5-0.5*cos(2*$pi*i/(fft_size-1));
    i+=1;
  );
  fft(fftbuf,fft_size);
  fft_permute(fftbuf,fft_size);
  band=0;
  loop(64,
    f0=20*pow(1000,band/64);
    f1=20*pow(1000,(band+1)/64);
    b0=min(fft_size/2-1,max(1,floor(f0*fft_size/srate)));
    b1=min(fft_size/2-1,max(b0,floor(f1*fft_size/srate)));
    bin=b0;
    mag=0;
    count=b1-b0+1;
    loop(count,
      re=fftbuf[bin*2];
      im=fftbuf[bin*2+1];
      mag+=sqrt(re*re+im*im);
      bin+=1;
    );
    db=20*log(max(0.000000001,mag/count/fft_size))/log(10);
    gmem[gbase+4+band]=min(1,max(0,(db+100)/100));
    band+=1;
  );
  gmem[gbase+1]=min(1,peak_l);
  gmem[gbase+2]=min(1,peak_r);
  gmem[gbase+3]=srate;
  gmem[gbase]+=1;
  peak_l=0;
  peak_r=0;
);
]=]

local function install_spectrum_probe()
  local effects_dir=reaper.GetResourcePath()..sep.."Effects";os.execute("mkdir -p "..shell_quote(effects_dir));local path=effects_dir..sep.."RTR_Spectrum_Probe.jsfx";local existing=io.open(path,"r");local current=existing and existing:read("*a") or nil;if existing then existing:close() end;if current~=probe_source then local file=io.open(path,"w");if file then file:write(probe_source);file:close() end end;if reaper.EnumInstalledFX then reaper.EnumInstalledFX(-1) end
end

local function write_installed_fx()
  if not reaper.EnumInstalledFX then return end
  local entries={};local index=0
  while true do local ok,name,ident=reaper.EnumInstalledFX(index);if not ok then break end;if not name:find("RTR Spectrum Probe",1,true) then entries[#entries+1]='{"name":'..json_string(name)..',"ident":'..json_string(ident)..'}' end;index=index+1 end
  local file=io.open(installed_fx_file..".tmp","w");if not file then return end;file:write("["..table.concat(entries,",").."]");file:flush();file:close();os.rename(installed_fx_file..".tmp",installed_fx_file)
end
install_spectrum_probe()
write_installed_fx()
reaper.gmem_attach("RTR_SPECTRUM")

local function find_track(guid)
  for i = 0, reaper.CountTracks(0) - 1 do local track = reaper.GetTrack(0, i) if reaper.GetTrackGUID(track) == guid then return track end end
end
local function split_target(target)
  local track_guid, fx = target:match("^(.-)|(%-?%d+)$")
  return track_guid, tonumber(fx)
end
local function split_param_target(target)
  local track_guid, fx, param = target:match("^(.-)|(%-?%d+)|(%-?%d+)$")
  return track_guid, tonumber(fx), tonumber(param)
end
local function probe_slot(guid) if probe_slots[guid]==nil then probe_slots[guid]=next_probe_slot;next_probe_slot=(next_probe_slot+1)%256 end return probe_slots[guid] end
local function find_probe(track) for i=0,reaper.TrackFX_GetCount(track)-1 do local _,name=reaper.TrackFX_GetFXName(track,i,"");if name:find("RTR Spectrum Probe",1,true) then return i end end return -1 end
local function find_fx_guid(track,guid) for i=0,reaper.TrackFX_GetCount(track)-1 do if reaper.TrackFX_GetFXGUID(track,i)==guid then return i end end return -1 end
local function remove_probes(except_track) for track_index=0,reaper.CountTracks(0)-1 do local track=reaper.GetTrack(0,track_index);if track~=except_track then local probe=find_probe(track);while probe>=0 do reaper.TrackFX_Delete(track,probe);probe=find_probe(track) end end end end
local function ensure_probe(track,guid,selected_fx) local selected_guid=reaper.TrackFX_GetFXGUID(track,selected_fx);local probe=find_probe(track);if probe<0 then probe=reaper.TrackFX_AddByName(track,"JS: RTR Spectrum Probe",false,-1000-selected_fx);if probe<0 then probe=reaper.TrackFX_AddByName(track,"JS: RTR_Spectrum_Probe",false,-1000-selected_fx) end elseif selected_guid then local current=find_fx_guid(track,selected_guid);if probe~=current-1 then local destination=current-(probe<current and 1 or 0);reaper.TrackFX_CopyToTrack(track,probe,track,math.max(0,destination),true);probe=find_probe(track) end end;if probe>=0 then reaper.TrackFX_SetParam(track,probe,0,probe_slot(guid));reaper.TrackFX_SetEnabled(track,probe,true) end;return selected_guid and find_fx_guid(track,selected_guid) or selected_fx end
remove_probes()

local function close_native_fx()
  if native_track_guid and native_fx_index ~= nil then
    local track=find_track(native_track_guid)
    if track then reaper.TrackFX_Show(track,native_fx_index,2) end
  end
  native_track_guid=nil
  native_fx_index=nil
end

local function apply_command(line)
  local id, action, target, value = line:match("^([^\t]*)\t([^\t]*)\t([^\t]*)\t?(.*)$")
  if not action then return end
  if action == "set_track_volume" then local track=find_track(target); if track then reaper.CSurf_OnVolumeChange(track, tonumber(value) or 0, false) end
  elseif action == "set_track_pan" then local track=find_track(target); if track then reaper.CSurf_OnPanChange(track, tonumber(value) or 0, false) end
  elseif action == "set_track_mute" then local track=find_track(target); if track then reaper.SetMediaTrackInfo_Value(track,"B_MUTE",tonumber(value)==1 and 1 or 0) end
  elseif action == "set_track_solo" then local track=find_track(target); if track then reaper.SetMediaTrackInfo_Value(track,"I_SOLO",tonumber(value)==1 and 2 or 0) end
  elseif action == "select_track" then local track=find_track(target); if track then reaper.SetOnlyTrackSelected(track); reaper.Main_OnCommand(40913,0) end
  elseif action == "rename_track" then local track=find_track(target); if track and value~="" then reaper.GetSetMediaTrackInfo_String(track,"P_NAME",value,true) end
  elseif action == "add_fx" then local track=find_track(target); if track and value~="" then local fx=reaper.TrackFX_AddByName(track,value,false,-1);if fx>=0 then selected_track_guid=target;selected_fx_index=fx;reaper.SetOnlyTrackSelected(track);reaper.TrackList_AdjustWindows(false);reaper.UpdateArrange() end end
  elseif action == "set_fx_bypass" then local guid,fx=split_target(target); local track=find_track(guid); if track and fx then reaper.TrackFX_SetEnabled(track,fx,tonumber(value)~=1) end
  elseif action == "set_fx_param" then local guid,fx,param=split_param_target(target); local track=find_track(guid); if track and fx and param then reaper.TrackFX_SetParamNormalized(track,fx,param,math.max(0,math.min(1,tonumber(value) or 0))) end
  elseif action == "open_fx" then local guid,fx=split_target(target); local track=find_track(guid); if track and fx then remove_probes(track);local adjusted=ensure_probe(track,guid,fx);selected_track_guid=guid;selected_fx_index=adjusted>=0 and adjusted or fx;reaper.SetOnlyTrackSelected(track) end
  elseif action == "open_native_fx" then local guid,fx=split_target(target); local track=find_track(guid); if track and fx then close_native_fx();native_track_guid=guid;native_fx_index=fx;reaper.TrackFX_Show(track,fx,3) end
  elseif action == "close_native_fx" then close_native_fx()
  elseif action == "close_fx" then close_native_fx();remove_probes();selected_track_guid=nil;selected_fx_index=nil end
end

local function read_commands()
  local file = io.open(command_file, "r") if not file then return end
  file:seek("set", command_offset)
  while true do local line=file:read("*l"); if not line then break end; apply_command(line) end
  command_offset=file:seek() or command_offset; file:close()
end

local function fx_json(track)
  local values={}
  for i=0,reaper.TrackFX_GetCount(track)-1 do
    local _,name=reaper.TrackFX_GetFXName(track,i,"")
    local guid=reaper.TrackFX_GetFXGUID(track,i) or tostring(i)
    if not name:find("RTR Spectrum Probe",1,true) then values[#values+1]='{"index":'..i..',"id":'..json_string(guid)..',"name":'..json_string(name)..',"enabled":'..bool(reaper.TrackFX_GetEnabled(track,i))..'}' end
  end
  return "["..table.concat(values,",").."]"
end
local function signal_json(guid) if guid~=selected_track_guid then return "null" end;local base=probe_slot(guid)*80;local bins={};for i=0,63 do bins[#bins+1]=number(reaper.gmem_read(base+4+i)) end;return '{"seq":'..number(reaper.gmem_read(base))..',"left":'..number(reaper.gmem_read(base+1))..',"right":'..number(reaper.gmem_read(base+2))..',"sampleRate":'..number(reaper.gmem_read(base+3))..',"spectrum":['..table.concat(bins,",")..']}' end
local function track_json(track,index)
  local _,name=reaper.GetTrackName(track)
  local left=reaper.Track_GetPeakInfo(track,0); local right=reaper.Track_GetPeakInfo(track,1)
  local left_db=left>0 and 20*math.log(left,10) or -100; local right_db=right>0 and 20*math.log(right,10) or -100
  local guid=reaper.GetTrackGUID(track)
  return '{"id":'..json_string(guid)..',"number":'..(index+1)..',"name":'..json_string(name)..',"volume":'..number(reaper.GetMediaTrackInfo_Value(track,"D_VOL"))..',"pan":'..number(reaper.GetMediaTrackInfo_Value(track,"D_PAN"))..',"mute":'..bool(reaper.GetMediaTrackInfo_Value(track,"B_MUTE")>0.5)..',"solo":'..bool(reaper.GetMediaTrackInfo_Value(track,"I_SOLO")>0)..',"selected":'..bool(reaper.IsTrackSelected(track))..',"meter":['..number(left_db)..','..number(right_db)..'],"signal":'..signal_json(guid)..',"fx":'..fx_json(track)..'}'
end
local function selected_fx_json()
  if not selected_track_guid or selected_fx_index == nil then return "null" end
  local track=find_track(selected_track_guid)
  if not track or selected_fx_index >= reaper.TrackFX_GetCount(track) then return "null" end
  local _,fx_name=reaper.TrackFX_GetFXName(track,selected_fx_index,"")
  local fx_guid=reaper.TrackFX_GetFXGUID(track,selected_fx_index) or selected_track_guid.."|"..selected_fx_index
  local params={}
  for i=0,reaper.TrackFX_GetNumParams(track,selected_fx_index)-1 do
    local _,name=reaper.TrackFX_GetParamName(track,selected_fx_index,i,"")
    local _,formatted=reaper.TrackFX_GetFormattedParamValue(track,selected_fx_index,i,"")
    local _,step,small_step,large_step,is_toggle=reaper.TrackFX_GetParameterStepSizes(track,selected_fx_index,i)
    local _,min_value,max_value=reaper.TrackFX_GetParamEx(track,selected_fx_index,i)
    local span=(max_value or 1)-(min_value or 0)
    if span > 0 then step=(step or 0)/span;small_step=(small_step or 0)/span;large_step=(large_step or 0)/span end
    local cache_key=fx_guid.."|"..i;local choices_json=parameter_choice_cache[cache_key]
    if not choices_json then local choices={};local choice_count=step and step>0 and math.floor(1/step+0.5) or 0;if not is_toggle and choice_count>=2 and choice_count<=32 then for choice=0,choice_count do local value=math.min(1,choice*step);local label=format_param_normalized(track,selected_fx_index,i,value);choices[#choices+1]='{"value":'..number(value)..',"label":'..json_string(label~="" and label or math.floor(value*100+0.5).."%")..'}' end end;choices_json="["..table.concat(choices,",").."]";parameter_choice_cache[cache_key]=choices_json end
    params[#params+1]='{"index":'..i..',"name":'..json_string(name)..',"value":'..number(reaper.TrackFX_GetParamNormalized(track,selected_fx_index,i))..',"formatted":'..json_string(formatted)..',"step":'..number(step)..',"smallStep":'..number(small_step)..',"largeStep":'..number(large_step)..',"toggle":'..bool(is_toggle)..',"choices":'..choices_json..'}'
  end
  return '{"trackId":'..json_string(selected_track_guid)..',"fxIndex":'..selected_fx_index..',"id":'..json_string(fx_guid)..',"name":'..json_string(fx_name)..',"parameters":['..table.concat(params,",")..']}'
end
local function write_state()
  local _,project_path=reaper.EnumProjects(-1,""); local name=project_path:match("([^/\\]+)%.rpp$") or "Untitled"
  local tracks={}; for i=0,reaper.CountTracks(0)-1 do tracks[#tracks+1]=track_json(reaper.GetTrack(0,i),i) end
  local payload='{"project":{"name":'..json_string(name)..',"path":'..json_string(project_path)..',"changeCount":'..reaper.GetProjectStateChangeCount(0)..'},"tracks":['..table.concat(tracks,",")..'],"selectedFx":'..selected_fx_json()..',"timestamp":'..number(reaper.time_precise())..'}'
  local file=io.open(temp_file,"w"); if not file then return end; file:write(payload); file:flush(); file:close(); os.rename(temp_file,state_file)
end
local function loop()
  read_commands(); local now=reaper.time_precise(); if now-last_write>=0.04 then write_state();last_write=now end; reaper.defer(loop)
end
reaper.atexit(function() close_native_fx();remove_probes();os.remove(state_file) end)
loop()
