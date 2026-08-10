const $ = (selector) => document.querySelector(selector);
const els = { mixer:$("#mixer"), project:$("#project"), connection:$("#connection"), bank:$("#bankLabel"), settings:$("#settings"), host:$("#host"), port:$("#port"), pluginView:$("#pluginView"), panel:$("#parameterPanel"), surface:$("#pluginSurface") };
const settings = JSON.parse(localStorage.getItem("rtr.connection") || "null") || { host:location.hostname, port:location.port || "47830", auto:true };
// The origin that successfully served the app is the best authority after DHCP/network changes.
// Without this, a remembered WebSocket host can keep targeting yesterday's IP while the UI
// itself loads from today's IP, leaving a plausible-looking but disconnected mixer.
if (location.hostname && settings.host !== location.hostname) {
  settings.host = location.hostname;
  settings.port = location.port || "47830";
  localStorage.setItem("rtr.connection", JSON.stringify(settings));
}
let socket, heartbeat, reconnectTimer, state, bank=0, bankSize=8, latency=0, activeFX=null;
const pointers = new Map();

function connect() {
  clearTimeout(reconnectTimer); clearInterval(heartbeat);
  setConnection("connecting", "Connecting");
  socket?.close();
  socket = new WebSocket(`ws://${settings.host}:${settings.port}/ws`);
  socket.onopen = () => { setConnection("online", "REAPER"); socket.send(JSON.stringify({type:"hello",protocol:1})); heartbeat=setInterval(()=>socket.send(JSON.stringify({type:"heartbeat",at:Date.now()})),2000); };
  socket.onmessage = ({data}) => handle(JSON.parse(data));
  socket.onclose = () => { setConnection("offline", "Disconnected"); clearInterval(heartbeat); if(settings.auto) reconnectTimer=setTimeout(connect,1500); };
  socket.onerror = () => socket.close();
}
function handle(message) {
  if(message.type==="snapshot") { state=message.state; if(activeFX)renderPluginParameters();else render(); }
  if(message.type==="state_update" && state) { for(const item of message.changes.meters||[]){const track=state.tracks.find(t=>t.id===item.id);if(track)track.meter=item.meter;} renderMeters(); }
  if(message.type==="heartbeat") { latency=Math.max(0,Math.round((Date.now()-message.echo)/2));setConnection("online",`REAPER · ${latency} ms`); }
}
function command(action,target,value="") { if(socket?.readyState!==WebSocket.OPEN)return;const id=globalThis.crypto?.randomUUID?.()||`cmd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;socket.send(JSON.stringify({type:"command",id,action,target,value})); }
function render(){
  els.project.textContent=state.project.name||"Untitled"; bankSize=innerWidth<900?6:8; document.documentElement.style.setProperty("--bank-size",bankSize); const count=Math.max(1,Math.ceil(state.tracks.length/bankSize));bank=Math.min(bank,count-1);els.bank.textContent=`${bank+1} / ${count}`;
  els.mixer.replaceChildren(...state.tracks.slice(bank*bankSize,(bank+1)*bankSize).map(trackStrip)); renderMeters();
}
function trackStrip(track){
  const strip=document.createElement("article");strip.className=`strip ${track.selected?"selected":""}`;strip.dataset.id=track.id;
  strip.innerHTML=`<button class="track-head"><b>TRACK ${track.number}</b><span></span></button><div class="fader-zone"><div class="meter"><i class="meter-fill"></i></div><div class="rail"></div><div class="cap"></div><div class="db"></div></div><div class="pan-wrap"><label>PAN</label><input class="pan" type="range" min="-1" max="1" step="0.01"><div class="pan-value"></div></div><div class="buttons"><button class="mute">MUTE</button><button class="solo">SOLO</button></div><div class="fx-list"></div>`;
  strip.querySelector(".track-head span").textContent=track.name||`Track ${track.number}`;strip.querySelector(".track-head").onpointerup=()=>command("select_track",track.id);
  const zone=strip.querySelector(".fader-zone");zone.style.setProperty("--value",volumeToUnit(track.volume));zone.querySelector(".db").textContent=formatDB(track.volume);bindFader(zone,track.id);
  const pan=strip.querySelector(".pan");pan.value=track.pan;strip.querySelector(".pan-value").textContent=formatPan(track.pan);bindPan(pan,track.id,strip.querySelector(".pan-value"));
  bindButton(strip.querySelector(".mute"),()=>command("set_track_mute",track.id,track.mute?0:1),track.mute);bindButton(strip.querySelector(".solo"),()=>command("set_track_solo",track.id,track.solo?0:1),track.solo);
  const list=strip.querySelector(".fx-list"); for(const fx of track.fx){const row=document.createElement("div");row.className="fx";row.setAttribute("role","button");row.innerHTML=`<span></span><button class="bypass ${fx.enabled?"":"off"}" aria-label="Toggle bypass">${fx.enabled?"ON":"OFF"}</button>`;row.querySelector("span").textContent=fx.name;row.onpointerup=e=>{if(e.target.classList.contains("bypass"))return;openPlugin(track,fx)};bindButton(row.querySelector(".bypass"),()=>command("set_fx_bypass",`${track.id}|${fx.index}`,fx.enabled?1:0));list.append(row)}
  return strip;
}
function bindFader(zone,id){const reset=()=>{const unity=volumeToUnit(1);zone.style.setProperty("--value",unity);zone.querySelector(".db").textContent="+0.0 dB";command("set_track_volume",id,1)};const gesture=twoFingerDoubleTap(reset);const update=e=>{const r=zone.getBoundingClientRect();const unit=Math.max(0,Math.min(1,(r.bottom-22-e.clientY)/(r.height-54)));zone.style.setProperty("--value",unit);zone.querySelector(".db").textContent=formatDB(unitToVolume(unit));command("set_track_volume",id,unitToVolume(unit))};zone.onpointerdown=e=>{e.preventDefault();zone.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{kind:"fader",id});gesture.down(e);update(e)};zone.onpointermove=e=>{gesture.move(e);if(pointers.get(e.pointerId)?.id===id)update(e)};const end=e=>{gesture.up(e);pointers.delete(e.pointerId)};zone.onpointerup=end;zone.onpointercancel=e=>{gesture.cancel(e);pointers.delete(e.pointerId)};zone.onlostpointercapture=e=>{if(pointers.has(e.pointerId)){gesture.cancel(e);pointers.delete(e.pointerId)}}}
function bindPan(input,id,label){const reset=()=>{input.value=0;label.textContent="C";command("set_track_pan",id,0)};const gesture=twoFingerDoubleTap(reset);input.onpointerdown=e=>{input.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{kind:"pan",id});gesture.down(e)};input.onpointermove=e=>gesture.move(e);input.oninput=()=>{label.textContent=formatPan(+input.value);command("set_track_pan",id,input.value)};input.onpointerup=e=>{gesture.up(e);pointers.delete(e.pointerId)};input.onpointercancel=e=>{gesture.cancel(e);pointers.delete(e.pointerId)};input.onlostpointercapture=e=>{if(pointers.has(e.pointerId)){gesture.cancel(e);pointers.delete(e.pointerId)}}}
function twoFingerDoubleTap(onReset){
  const active=new Map();let chord=null,lastChordAt=0;
  const maxMove=18,maxChordMs=280,maxDoubleMs=520;
  return {
    down(e){active.set(e.pointerId,{x:e.clientX,y:e.clientY,moved:false});if(active.size===2)chord={ids:new Set(active.keys()),started:performance.now(),valid:true}},
    move(e){const point=active.get(e.pointerId);if(!point)return;if(Math.hypot(e.clientX-point.x,e.clientY-point.y)>maxMove){point.moved=true;if(chord)chord.valid=false}},
    up(e){
      if(chord?.ids.has(e.pointerId)){const point=active.get(e.pointerId);if(point?.moved)chord.valid=false;chord.ids.delete(e.pointerId)}
      active.delete(e.pointerId);
      if(chord&&chord.ids.size===0){const now=performance.now();if(chord.valid&&now-chord.started<=maxChordMs){if(now-lastChordAt<=maxDoubleMs){lastChordAt=0;onReset()}else lastChordAt=now}else lastChordAt=0;chord=null}
    },
    cancel(e){active.delete(e.pointerId);chord=null;lastChordAt=0}
  }
}
function bindButton(button,callback,active=false){button.classList.toggle("active",active);button.onpointerdown=e=>{e.preventDefault();button.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{kind:"button",button});button.classList.add("pressed")};button.onpointerup=e=>{if(pointers.get(e.pointerId)?.button===button)callback();pointers.delete(e.pointerId);button.classList.remove("pressed")};button.onpointercancel=button.onlostpointercapture=e=>{pointers.delete(e.pointerId);button.classList.remove("pressed")}}
function renderMeters(){if(!state)return;document.querySelectorAll(".strip").forEach(strip=>{const track=state.tracks.find(t=>t.id===strip.dataset.id);if(track){const peak=Math.max(...(track.meter||[-100]));strip.querySelector(".meter-fill").style.height=`${Math.max(0,Math.min(100,(peak+60)/60*100))}%`}})}
function openPlugin(track,fx){activeFX={trackId:track.id,fxIndex:fx.index,name:fx.name,enabled:fx.enabled};command("open_fx",`${track.id}|${fx.index}`);$("#pluginTrack").textContent=track.name;$("#pluginName").textContent=fx.name;els.panel.dataset.key="";els.panel.innerHTML='<div class="plugin-message">Loading real parameters from REAPER…</div>';els.pluginView.hidden=false}
function closePlugin(){command("close_fx",activeFX?`${activeFX.trackId}|${activeFX.fxIndex}`:"");activeFX=null;els.panel.dataset.key="";els.pluginView.hidden=true;render()}
function adjacentPlugin(delta){if(!activeFX||!state)return;const track=state.tracks.find(item=>item.id===activeFX.trackId);if(!track)return;const position=track.fx.findIndex(fx=>fx.index===activeFX.fxIndex);const next=track.fx[position+delta];if(next)openPlugin(track,next)}
function renderPluginParameters(){
  const selected=state?.selectedFx;if(!activeFX||!selected||selected.trackId!==activeFX.trackId||selected.fxIndex!==activeFX.fxIndex)return;
  const key=`${selected.trackId}|${selected.fxIndex}`;$("#pluginName").textContent=selected.name;
  if(els.panel.dataset.key===key){for(const param of selected.parameters){const input=els.panel.querySelector(`[data-param="${param.index}"]`);if(input&&!pointers.has(`fx:${param.index}`)){input.value=param.value;input.closest(".parameter").querySelector("output").textContent=param.formatted||`${Math.round(param.value*100)}%`}}return}
  els.panel.dataset.key=key;els.panel.replaceChildren(...selected.parameters.map(param=>{
    const control=document.createElement("div");control.className="parameter";control.innerHTML='<label></label><input type="range" min="0" max="1" step="0.0001"><output></output>';control.querySelector("label").textContent=param.name||`Parameter ${param.index+1}`;const input=control.querySelector("input");input.dataset.param=param.index;input.value=param.value;control.querySelector("output").textContent=param.formatted||`${Math.round(param.value*100)}%`;input.onpointerdown=e=>{input.setPointerCapture(e.pointerId);pointers.set(`fx:${param.index}`,e.pointerId)};input.oninput=()=>{control.querySelector("output").textContent=`${Math.round(input.value*100)}%`;command("set_fx_param",`${selected.trackId}|${selected.fxIndex}|${param.index}`,input.value)};const end=()=>pointers.delete(`fx:${param.index}`);input.onpointerup=end;input.onpointercancel=end;input.onlostpointercapture=end;return control
  }))
}
function setConnection(status,text){els.connection.className=`connection ${status}`;els.connection.querySelector("span").textContent=text}
function volumeToUnit(v){if(v<=0)return 0;const db=20*Math.log10(v);return Math.max(0,Math.min(1,(db+60)/72))}function unitToVolume(u){return u<=0?0:10**((-60+u*72)/20)}function formatDB(v){if(v<=0)return"-∞ dB";const db=20*Math.log10(v);return`${db>=0?"+":""}${db.toFixed(1)} dB`}function formatPan(v){return Math.abs(v)<.01?"C":v<0?`L${Math.round(-v*100)}`:`R${Math.round(v*100)}`}
$("#bankPrev").onclick=()=>{bank=Math.max(0,bank-1);render()};$("#bankNext").onclick=()=>{if(state){bank=Math.min(Math.ceil(state.tracks.length/bankSize)-1,bank+1);render()}};els.connection.onclick=()=>{els.host.value=settings.host;els.port.value=settings.port;$("#auto").checked=settings.auto;$("#details").textContent=`Current: ${settings.host}:${settings.port}`;els.settings.showModal()};$("#saveConnection").onclick=()=>{settings.host=els.host.value.trim();settings.port=els.port.value;settings.auto=$("#auto").checked;localStorage.setItem("rtr.connection",JSON.stringify(settings));connect()};$("#pluginBack").onclick=closePlugin;$("#pluginPrev").onclick=()=>adjacentPlugin(-1);$("#pluginNext").onclick=()=>adjacentPlugin(1);$("#pluginBypass").onclick=()=>activeFX&&command("set_fx_bypass",`${activeFX.trackId}|${activeFX.fxIndex}`,activeFX.enabled?1:0);$("#wake").onclick=async()=>{try{window.wakeLock=await navigator.wakeLock.request("screen");$("#wake").textContent="AWAKE"}catch{$("#wake").textContent="WAKE FAILED"}};
document.addEventListener("contextmenu",e=>{if(!e.target.closest("input"))e.preventDefault()});document.addEventListener("gesturestart",e=>e.preventDefault(),{passive:false});window.addEventListener("resize",()=>state&&render());if("serviceWorker" in navigator)navigator.serviceWorker.register("/service-worker.js");connect();
