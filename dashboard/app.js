
const socket = io();

let devices = [];
let events = [];
let transcripts = [];

const qs = (s) => document.querySelector(s);

function fmtTime(iso){
  if(!iso) return "—";
  return new Date(iso).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit", second:"2-digit"});
}
function fmtAgo(iso){
  if(!iso) return "No telemetry received";
  const sec = Math.max(0, Math.floor((Date.now()-new Date(iso).getTime())/1000));
  if(sec < 5) return "Seen just now";
  if(sec < 60) return `Seen ${sec}s ago`;
  return `Seen ${Math.floor(sec/60)}m ago`;
}
function fmtUptime(sec){
  if(sec == null) return "Waiting";
  sec = Number(sec);
  if(sec < 60) return `${sec}s`;
  if(sec < 3600) return `${Math.floor(sec/60)}m`;
  return `${Math.floor(sec/3600)}h ${Math.floor((sec%3600)/60)}m`;
}
function fmtPct(v){ return v == null ? "Waiting" : `${v}%`; }
function fmtRSSI(v){ return v == null ? "Waiting" : `${v} dBm`; }
function fmtLatency(v){ return v == null ? "Waiting" : `${v} ms`; }

function render(){
  qs("#registeredCount").textContent = devices.length;
  qs("#onlineCount").textContent = devices.filter(d=>d.status==="online").length;
  qs("#activationCount").textContent = devices.reduce((n,d)=>n+(d.activationCount||0),0);
  qs("#latestEvent").textContent = events[0] ? fmtTime(events[0].timestamp) : "—";

  const grid = qs("#deviceGrid");
  grid.innerHTML = "";
  const tmpl = qs("#deviceTemplate");

  devices.forEach(d=>{
    const node = tmpl.content.cloneNode(true);
    node.querySelector(".device-id").textContent = d.deviceId;
    node.querySelector(".device-name").textContent = d.name || d.deviceId;
    node.querySelector(".device-location").textContent = d.location || "Unassigned";
    const pill = node.querySelector(".status-pill");
    pill.textContent = (d.status || "offline").toUpperCase();
    if(d.status==="online") pill.classList.add("online");

    const t = d.telemetry || {};
    node.querySelector(".heap").textContent = fmtPct(t.heapUsedPercent);
    node.querySelector(".psram").textContent = fmtPct(t.psramUsedPercent);
    node.querySelector(".wifi").textContent = fmtRSSI(t.wifiRSSI);
    node.querySelector(".latency").textContent = fmtLatency(t.inferenceLatencyMs);
    node.querySelector(".uptime").textContent = fmtUptime(t.uptimeSeconds);
    node.querySelector(".activations").textContent = d.activationCount || 0;
    node.querySelector(".last-seen").textContent = fmtAgo(d.lastSeen);
    node.querySelector(".model").textContent = `Model: ${t.modelVersion || "—"}`;
    grid.appendChild(node);

    const map = document.getElementById(`map-${d.deviceId}`);
    if(map) map.classList.toggle("online", d.status==="online");
  });

  const eventList = qs("#eventList");
  if(!events.length){
    eventList.className = "timeline empty-state";
    eventList.textContent = "No wake events yet.";
  } else {
    eventList.className = "timeline";
    eventList.innerHTML = events.map(e=>`
      <div class="timeline-item">
        <div class="time">${fmtTime(e.timestamp)}</div>
        <div>
          <strong>${e.type === "COSMOS_DETECTED" ? "COSMOS detected" : e.type}</strong>
          <p>${e.deviceId} · ${e.location || "Unknown location"} · ${
            e.inferenceLatencyMs != null ? `${e.inferenceLatencyMs} ms` : "latency unavailable"
          }</p>
        </div>
        <div class="badge">${e.confidence != null ? `${(Number(e.confidence)*100).toFixed(1)}%` : "event"}</div>
      </div>
    `).join("");
  }

  const transcriptList = qs("#transcriptList");
  if(!transcripts.length){
    transcriptList.className = "timeline empty-state";
    transcriptList.textContent = "No ASR transcripts yet.";
  } else {
    transcriptList.className = "timeline";
    transcriptList.innerHTML = transcripts.map(t=>`
      <div class="timeline-item">
        <div class="time">${fmtTime(t.timestamp)}</div>
        <div><strong>${t.deviceId}</strong><p>${escapeHtml(t.text)}</p></div>
        <div class="badge">${t.provider || "ASR"}</div>
      </div>
    `).join("");
  }
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g,c=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]));
}

socket.on("connect", ()=>{
  qs("#apiDot").classList.add("live");
  qs("#apiText").textContent = "Mission Control online";
});
socket.on("disconnect", ()=>{
  qs("#apiDot").classList.remove("live");
  qs("#apiText").textContent = "Backend disconnected";
});

socket.on("snapshot", data=>{
  devices = data.devices || [];
  events = data.events || [];
  transcripts = data.transcripts || [];
  render();
});
socket.on("device:update", d=>{
  const i = devices.findIndex(x=>x.deviceId===d.deviceId);
  if(i>=0) devices[i]=d; else devices.push(d);
  render();
});
socket.on("event:new", e=>{
  events.unshift(e);
  events = events.slice(0,100);
  render();
});
socket.on("transcript:new", t=>{
  transcripts.unshift(t);
  transcripts = transcripts.slice(0,50);
  render();
});

setInterval(render, 1000);
