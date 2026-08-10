const $ = (selector) => document.querySelector(selector);
const els = { mixer:$("#mixer"), project:$("#project"), connection:$("#connection"), bank:$("#bankLabel"), settings:$("#settings"), host:$("#host"), port:$("#port"), pluginView:$("#pluginView"), stream:$("#pluginStream"), surface:$("#pluginSurface") };
const settings = JSON.parse(localStorage.getItem("rtr.connection") || "null") || { host:location.hostname, port:location.port || "47830", auto:true };
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
  if(message.type==="snapshot") { state=message.state; render(); }
  if(message.type==="state_update" && state) { for(const item of message.changes.meters||[]){const track=state.tracks.find(t=>t.id===item.id);if(track)track.meter=item.meter;} renderMeters(); }
  if(message.type==="heartbeat") { latency=Math.max(0,Math.round((Date.now()-message.echo)/2));setConnection("online",`REAPER · ${latency} ms`); }
}
function command(action,target,value="") { if(socket?.readyState!==WebSocket.OPEN)return;socket.send(JSON.stringify({type:"command",id:crypto.randomUUID(),action,target,value})); }
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
  const list=strip.querySelector(".fx-list"); for(const fx of track.fx){const row=document.createElement("button");row.className="fx";row.innerHTML=`<span></span><button class="bypass ${fx.enabled?"":"off"}" aria-label="Toggle bypass">${fx.enabled?"ON":"OFF"}</button>`;row.querySelector("span").textContent=fx.name;row.onpointerup=e=>{if(e.target.classList.contains("bypass"))return;openPlugin(track,fx)};bindButton(row.querySelector(".bypass"),()=>command("set_fx_bypass",`${track.id}|${fx.index}`,fx.enabled?1:0));list.append(row)}
  return strip;
}
function bindFader(zone,id){const update=e=>{const r=zone.getBoundingClientRect();const unit=Math.max(0,Math.min(1,(r.bottom-22-e.clientY)/(r.height-54)));zone.style.setProperty("--value",unit);zone.querySelector(".db").textContent=formatDB(unitToVolume(unit));command("set_track_volume",id,unitToVolume(unit))};zone.onpointerdown=e=>{e.preventDefault();zone.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{kind:"fader",id});update(e)};zone.onpointermove=e=>{if(pointers.get(e.pointerId)?.id===id)update(e)};const end=e=>pointers.delete(e.pointerId);zone.onpointerup=end;zone.onpointercancel=end;zone.onlostpointercapture=end}
function bindPan(input,id,label){input.onpointerdown=e=>{input.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{kind:"pan",id})};input.oninput=()=>{label.textContent=formatPan(+input.value);command("set_track_pan",id,input.value)};const end=e=>pointers.delete(e.pointerId);input.onpointerup=end;input.onpointercancel=end;input.onlostpointercapture=end}
function bindButton(button,callback,active=false){button.classList.toggle("active",active);button.onpointerdown=e=>{e.preventDefault();button.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{kind:"button",button});button.classList.add("pressed")};button.onpointerup=e=>{if(pointers.get(e.pointerId)?.button===button)callback();pointers.delete(e.pointerId);button.classList.remove("pressed")};button.onpointercancel=button.onlostpointercapture=e=>{pointers.delete(e.pointerId);button.classList.remove("pressed")}}
function renderMeters(){if(!state)return;document.querySelectorAll(".strip").forEach(strip=>{const track=state.tracks.find(t=>t.id===strip.dataset.id);if(track){const peak=Math.max(...(track.meter||[-100]));strip.querySelector(".meter-fill").style.height=`${Math.max(0,Math.min(100,(peak+60)/60*100))}%`}})}
function openPlugin(track,fx){activeFX={track,fx};command("open_fx",`${track.id}|${fx.index}`);$("#pluginTrack").textContent=track.name;$("#pluginName").textContent=fx.name;els.pluginView.hidden=false;els.stream.src=`http://${settings.host}:${settings.port}/capture/stream.mjpeg?t=${Date.now()}`}
function closePlugin(){command("close_fx",activeFX?`${activeFX.track.id}|${activeFX.fx.index}`:"");activeFX=null;els.stream.removeAttribute("src");els.pluginView.hidden=true}
function adjacentPlugin(delta){if(!activeFX)return;const list=activeFX.track.fx;const position=list.findIndex(fx=>fx.index===activeFX.fx.index);const next=list[position+delta];if(next)openPlugin(activeFX.track,next)}
function pluginPointer(action,e){if(!activeFX)return;const image=els.stream.getBoundingClientRect();const x=(e.clientX-image.left)/image.width,y=(e.clientY-image.top)/image.height;if(x<0||x>1||y<0||y>1)return;fetch(`http://${settings.host}:${settings.port}/capture/input`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,pointerId:e.pointerId,x,y})}).catch(()=>{})}
els.surface.onpointerdown=e=>{e.preventDefault();els.surface.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{kind:"plugin"});pluginPointer("down",e)};els.surface.onpointermove=e=>{if(pointers.get(e.pointerId)?.kind==="plugin")pluginPointer("move",e)};els.surface.onpointerup=e=>{pluginPointer("up",e);pointers.delete(e.pointerId)};els.surface.onpointercancel=els.surface.onlostpointercapture=e=>pointers.delete(e.pointerId);
function setConnection(status,text){els.connection.className=`connection ${status}`;els.connection.querySelector("span").textContent=text}
function volumeToUnit(v){if(v<=0)return 0;const db=20*Math.log10(v);return Math.max(0,Math.min(1,(db+60)/72))}function unitToVolume(u){return u<=0?0:10**((-60+u*72)/20)}function formatDB(v){if(v<=0)return"-∞ dB";const db=20*Math.log10(v);return`${db>=0?"+":""}${db.toFixed(1)} dB`}function formatPan(v){return Math.abs(v)<.01?"C":v<0?`L${Math.round(-v*100)}`:`R${Math.round(v*100)}`}
$("#bankPrev").onclick=()=>{bank=Math.max(0,bank-1);render()};$("#bankNext").onclick=()=>{if(state){bank=Math.min(Math.ceil(state.tracks.length/bankSize)-1,bank+1);render()}};els.connection.onclick=()=>{els.host.value=settings.host;els.port.value=settings.port;$("#auto").checked=settings.auto;$("#details").textContent=`Current: ${settings.host}:${settings.port}`;els.settings.showModal()};$("#saveConnection").onclick=()=>{settings.host=els.host.value.trim();settings.port=els.port.value;settings.auto=$("#auto").checked;localStorage.setItem("rtr.connection",JSON.stringify(settings));connect()};$("#pluginBack").onclick=closePlugin;$("#pluginPrev").onclick=()=>adjacentPlugin(-1);$("#pluginNext").onclick=()=>adjacentPlugin(1);$("#pluginBypass").onclick=()=>activeFX&&command("set_fx_bypass",`${activeFX.track.id}|${activeFX.fx.index}`,activeFX.fx.enabled?1:0);$("#wake").onclick=async()=>{try{window.wakeLock=await navigator.wakeLock.request("screen");$("#wake").textContent="AWAKE"}catch{$("#wake").textContent="WAKE FAILED"}};
document.addEventListener("contextmenu",e=>{if(!e.target.closest("input"))e.preventDefault()});document.addEventListener("gesturestart",e=>e.preventDefault(),{passive:false});window.addEventListener("resize",()=>state&&render());if("serviceWorker" in navigator)navigator.serviceWorker.register("/service-worker.js");connect();
