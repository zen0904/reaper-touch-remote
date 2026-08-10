-- REAPER Touch Remote authoritative bridge
-- Install through Actions > Show action list > ReaScript: Load, then run once per REAPER session.

local sep = package.config:sub(1, 1)
local bridge_dir = reaper.GetResourcePath() .. sep .. "REAPER Touch Remote"
local state_file = bridge_dir .. sep .. "state.json"
local temp_file = bridge_dir .. sep .. "state.json.tmp"
local command_file = bridge_dir .. sep .. "commands.tsv"
local command_offset = 0
local last_write = 0
local selected_track_guid = nil
local selected_fx_index = nil

local function shell_quote(value) return "'" .. value:gsub("'", "'\\''") .. "'" end
os.execute("mkdir -p " .. shell_quote(bridge_dir))
local reset = io.open(command_file, "w") if reset then reset:close() end

local function escape(value)
  return tostring(value or ""):gsub("\\", "\\\\"):gsub('"', '\\"'):gsub("\b", "\\b"):gsub("\f", "\\f"):gsub("\n", "\\n"):gsub("\r", "\\r"):gsub("\t", "\\t")
end
local function json_string(value) return '"' .. escape(value) .. '"' end
local function bool(value) return value and "true" or "false" end
local function number(value) value=tonumber(value) or 0; if value ~= value or value == math.huge or value == -math.huge then return "0" end return string.format("%.8g", value) end

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

local function apply_command(line)
  local id, action, target, value = line:match("^([^\t]*)\t([^\t]*)\t([^\t]*)\t?(.*)$")
  if not action then return end
  if action == "set_track_volume" then local track=find_track(target); if track then reaper.CSurf_OnVolumeChange(track, tonumber(value) or 0, false) end
  elseif action == "set_track_pan" then local track=find_track(target); if track then reaper.CSurf_OnPanChange(track, tonumber(value) or 0, false) end
  elseif action == "set_track_mute" then local track=find_track(target); if track then reaper.SetMediaTrackInfo_Value(track,"B_MUTE",tonumber(value)==1 and 1 or 0) end
  elseif action == "set_track_solo" then local track=find_track(target); if track then reaper.SetMediaTrackInfo_Value(track,"I_SOLO",tonumber(value)==1 and 2 or 0) end
  elseif action == "select_track" then local track=find_track(target); if track then reaper.SetOnlyTrackSelected(track); reaper.Main_OnCommand(40913,0) end
  elseif action == "set_fx_bypass" then local guid,fx=split_target(target); local track=find_track(guid); if track and fx then reaper.TrackFX_SetEnabled(track,fx,tonumber(value)~=1) end
  elseif action == "set_fx_param" then local guid,fx,param=split_param_target(target); local track=find_track(guid); if track and fx and param then reaper.TrackFX_SetParamNormalized(track,fx,param,math.max(0,math.min(1,tonumber(value) or 0))) end
  elseif action == "open_fx" then local guid,fx=split_target(target); local track=find_track(guid); if track and fx then selected_track_guid=guid;selected_fx_index=fx;reaper.SetOnlyTrackSelected(track) end
  elseif action == "close_fx" then selected_track_guid=nil;selected_fx_index=nil end
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
    values[#values+1]='{"index":'..i..',"id":'..json_string(guid)..',"name":'..json_string(name)..',"enabled":'..bool(reaper.TrackFX_GetEnabled(track,i))..'}'
  end
  return "["..table.concat(values,",").."]"
end
local function track_json(track,index)
  local _,name=reaper.GetTrackName(track)
  local left=reaper.Track_GetPeakInfo(track,0); local right=reaper.Track_GetPeakInfo(track,1)
  local left_db=left>0 and 20*math.log(left,10) or -100; local right_db=right>0 and 20*math.log(right,10) or -100
  return '{"id":'..json_string(reaper.GetTrackGUID(track))..',"number":'..(index+1)..',"name":'..json_string(name)..',"volume":'..number(reaper.GetMediaTrackInfo_Value(track,"D_VOL"))..',"pan":'..number(reaper.GetMediaTrackInfo_Value(track,"D_PAN"))..',"mute":'..bool(reaper.GetMediaTrackInfo_Value(track,"B_MUTE")>0.5)..',"solo":'..bool(reaper.GetMediaTrackInfo_Value(track,"I_SOLO")>0)..',"selected":'..bool(reaper.IsTrackSelected(track))..',"meter":['..number(left_db)..','..number(right_db)..'],"fx":'..fx_json(track)..'}'
end
local function selected_fx_json()
  if not selected_track_guid or selected_fx_index == nil then return "null" end
  local track=find_track(selected_track_guid)
  if not track or selected_fx_index >= reaper.TrackFX_GetCount(track) then return "null" end
  local _,fx_name=reaper.TrackFX_GetFXName(track,selected_fx_index,"")
  local params={}
  for i=0,reaper.TrackFX_GetNumParams(track,selected_fx_index)-1 do
    local _,name=reaper.TrackFX_GetParamName(track,selected_fx_index,i,"")
    local _,formatted=reaper.TrackFX_GetFormattedParamValue(track,selected_fx_index,i,"")
    local _,step,small_step,large_step,is_toggle=reaper.TrackFX_GetParameterStepSizes(track,selected_fx_index,i)
    local _,min_value,max_value=reaper.TrackFX_GetParamEx(track,selected_fx_index,i)
    local span=(max_value or 1)-(min_value or 0)
    if span > 0 then step=(step or 0)/span;small_step=(small_step or 0)/span;large_step=(large_step or 0)/span end
    params[#params+1]='{"index":'..i..',"name":'..json_string(name)..',"value":'..number(reaper.TrackFX_GetParamNormalized(track,selected_fx_index,i))..',"formatted":'..json_string(formatted)..',"step":'..number(step)..',"smallStep":'..number(small_step)..',"largeStep":'..number(large_step)..',"toggle":'..bool(is_toggle)..'}'
  end
  return '{"trackId":'..json_string(selected_track_guid)..',"fxIndex":'..selected_fx_index..',"name":'..json_string(fx_name)..',"parameters":['..table.concat(params,",")..']}'
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
reaper.atexit(function() os.remove(state_file) end)
loop()
