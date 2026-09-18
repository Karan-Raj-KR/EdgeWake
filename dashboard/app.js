/**
 * EDGEWAKE MISSION CONTROL // CLIENT ENGINE
 * Real-Time Telemetry, Event Dispatch, Tactical Clock, and State Visualization
 */

// Establish WebSocket Link to Backend Server
const socket = io();

// Operational State Store
let devices = [];
let events = [];
let transcripts = [];

// DOM Utility
const qs = (selector) => document.querySelector(selector);
const qsa = (selector) => document.querySelectorAll(selector);

/* ==========================================================================
   FORMATTERS & UTILITIES
   ========================================================================== */

function fmtTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function fmtFullTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${time}.${ms}`;
}

function fmtAgo(iso) {
  if (!iso) return "No telemetry received";
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 3) return "Live right now";
  if (sec < 60) return `Seen ${sec}s ago`;
  if (sec < 3600) return `Seen ${Math.floor(sec / 60)}m ago`;
  return `Seen ${Math.floor(sec / 3600)}h ago`;
}

function fmtUptime(sec) {
  if (sec == null) return "Waiting";
  sec = Number(sec);
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

function fmtBytes(bytes) {
  if (bytes == null || isNaN(bytes) || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

/* ==========================================================================
   MISSION CLOCK (REAL-TIME UTC & LOCAL)
   ========================================================================== */

function updateMissionClock() {
  const now = new Date();
  
  // UTC
  const utcHours = String(now.getUTCHours()).padStart(2, "0");
  const utcMinutes = String(now.getUTCMinutes()).padStart(2, "0");
  const utcSeconds = String(now.getUTCSeconds()).padStart(2, "0");
  const utcEl = qs("#missionClockUtc");
  if (utcEl) utcEl.textContent = `${utcHours}:${utcMinutes}:${utcSeconds} UTC`;

  // Local
  const localEl = qs("#missionClockLocal");
  if (localEl) {
    localEl.textContent = now.toLocaleTimeString([], { hour12: false });
  }
}

setInterval(updateMissionClock, 1000);
updateMissionClock();

/* ==========================================================================
   DASHBOARD RENDERING PIPELINE
   ========================================================================== */

function render() {
  // 1. TOP METRICS
  const registeredCount = devices.length;
  const onlineCount = devices.filter((d) => d.status === "online").length;
  const totalActivations = devices.reduce((sum, d) => sum + (d.activationCount || 0), 0);

  // Compute real average latency if events exist
  const validLatencies = events
    .map((e) => Number(e.inferenceLatencyMs))
    .filter((n) => !isNaN(n) && n > 0);
  const avgLatency = validLatencies.length
    ? Math.round(validLatencies.reduce((a, b) => a + b, 0) / validLatencies.length)
    : "—";

  qs("#registeredCount").textContent = registeredCount;
  qs("#onlineCount").textContent = onlineCount;
  qs("#onlineTotalLabel").textContent = `/ ${registeredCount} ACTIVE`;

  const fleetStatusSub = qs("#fleetStatusSub");
  if (fleetStatusSub) {
    if (onlineCount === 0) {
      fleetStatusSub.textContent = "Standby · Awaiting hardware heartbeat";
      fleetStatusSub.className = "stat-foot text-amber";
    } else {
      fleetStatusSub.textContent = `${onlineCount} node(s) transmitting live telemetry`;
      fleetStatusSub.className = "stat-foot highlight-word";
    }
  }

  qs("#activationCount").textContent = totalActivations;
  qs("#avgLatency").textContent = avgLatency;
  qs("#latestEvent").textContent = events[0] ? fmtTime(events[0].timestamp) : "—";
  
  const latestEventSub = qs("#latestEventSub");
  if (latestEventSub) {
    if (events[0]) {
      const conf = events[0].confidence != null ? `${(Number(events[0].confidence) * 100).toFixed(1)}%` : "conf. unrecorded";
      latestEventSub.textContent = `${events[0].deviceId} · ${conf}`;
    } else {
      latestEventSub.textContent = "No detection recorded";
    }
  }

  qs("#transcriptCount").textContent = transcripts.length;

  // 2. DEVICE FLEET GRID
  const grid = qs("#deviceGrid");
  grid.innerHTML = "";
  const tmpl = qs("#deviceTemplate");

  devices.forEach((d) => {
    const node = tmpl.content.cloneNode(true);
    const card = node.querySelector(".tactical-device-card");
    const isOnline = d.status === "online";

    if (isOnline) card.classList.add("online");

    // Identity
    node.querySelector(".device-id-chip").textContent = d.deviceId;
    node.querySelector(".device-title").textContent = d.name || d.deviceId;
    node.querySelector(".location-text").textContent = d.location || "Unassigned";

    // Status Pill
    const pill = node.querySelector(".status-pill");
    const statusSub = node.querySelector(".status-sub");
    if (isOnline) {
      pill.textContent = "ONLINE";
      pill.className = "status-pill status-online";
      statusSub.textContent = "TRANSMITTING";
    } else {
      pill.textContent = "OFFLINE";
      pill.className = "status-pill status-offline";
      statusSub.textContent = "NO HEARTBEAT";
    }

    // Telemetry Gauges
    const t = d.telemetry;

    // Heap
    const heapVal = node.querySelector(".heap-val");
    const heapFill = node.querySelector(".heap-fill");
    const heapDetail = node.querySelector(".heap-detail");
    if (t && t.heapUsedPercent != null) {
      heapVal.textContent = `${t.heapUsedPercent}%`;
      heapFill.style.width = `${Math.min(100, Math.max(0, t.heapUsedPercent))}%`;
      heapFill.classList.remove("waiting");
      if (t.totalHeapBytes && t.freeHeapBytes != null) {
        heapDetail.textContent = `${fmtBytes(t.totalHeapBytes - t.freeHeapBytes)} / ${fmtBytes(t.totalHeapBytes)} used`;
      }
    } else {
      heapVal.textContent = "Waiting";
      heapFill.classList.add("waiting");
      heapDetail.textContent = "Awaiting hardware metrics";
    }

    // PSRAM
    const psramVal = node.querySelector(".psram-val");
    const psramFill = node.querySelector(".psram-fill");
    const psramDetail = node.querySelector(".psram-detail");
    if (t && t.psramUsedPercent != null) {
      psramVal.textContent = `${t.psramUsedPercent}%`;
      psramFill.style.width = `${Math.min(100, Math.max(0, t.psramUsedPercent))}%`;
      psramFill.classList.remove("waiting");
      if (t.totalPsramBytes && t.freePsramBytes != null) {
        psramDetail.textContent = `${fmtBytes(t.totalPsramBytes - t.freePsramBytes)} / ${fmtBytes(t.totalPsramBytes)} used`;
      }
    } else {
      psramVal.textContent = "Waiting";
      psramFill.classList.add("waiting");
      psramDetail.textContent = "Awaiting hardware metrics";
    }

    // Wi-Fi RSSI
    const wifiVal = node.querySelector(".wifi-val");
    const wifiDetail = node.querySelector(".wifi-detail");
    const sigBars = node.querySelectorAll(".sig-bar");
    if (t && t.wifiRSSI != null) {
      const rssi = Number(t.wifiRSSI);
      wifiVal.textContent = `${rssi} dBm`;
      wifiDetail.textContent = rssi >= -60 ? "Strong Signal Link" : rssi >= -75 ? "Moderate Signal Link" : "Weak Signal Link";
      
      const barsToLight = rssi >= -55 ? 4 : rssi >= -67 ? 3 : rssi >= -80 ? 2 : 1;
      sigBars.forEach((bar, idx) => {
        if (idx < barsToLight) bar.classList.add("lit");
        else bar.classList.remove("lit");
      });
    } else {
      wifiVal.textContent = "Waiting";
      wifiDetail.textContent = "Awaiting 2.4 GHz signal";
      sigBars.forEach((bar) => bar.classList.remove("lit"));
    }

    // Inference Latency
    const latencyVal = node.querySelector(".latency-val");
    const latencyFill = node.querySelector(".latency-fill");
    const latencyDetail = node.querySelector(".latency-detail");
    if (t && t.inferenceLatencyMs != null) {
      latencyVal.textContent = `${t.inferenceLatencyMs} ms`;
      const pct = Math.min(100, Math.round((Number(t.inferenceLatencyMs) / 120) * 100));
      latencyFill.style.width = `${pct}%`;
      latencyFill.classList.remove("waiting");
      latencyDetail.textContent = Number(t.inferenceLatencyMs) < 100 ? "Nominal (<100ms threshold)" : "High Latency Warning";
    } else {
      latencyVal.textContent = "Waiting";
      latencyFill.classList.add("waiting");
      latencyDetail.textContent = "TinyML execution benchmark";
    }

    // Uptime
    const uptimeVal = node.querySelector(".uptime-val");
    const uptimeFill = node.querySelector(".uptime-fill");
    const uptimeDetail = node.querySelector(".uptime-detail");
    if (t && t.uptimeSeconds != null) {
      uptimeVal.textContent = fmtUptime(t.uptimeSeconds);
      uptimeFill.style.width = "100%";
      uptimeFill.classList.remove("waiting");
      uptimeDetail.textContent = "Node clock synchronized";
    } else {
      uptimeVal.textContent = "Waiting";
      uptimeFill.classList.add("waiting");
      uptimeDetail.textContent = "Node system clock";
    }

    // Activations
    const activationsVal = node.querySelector(".activations-val");
    const activationsFill = node.querySelector(".activations-fill");
    activationsVal.textContent = d.activationCount || 0;
    const actPct = Math.min(100, (d.activationCount || 0) * 10);
    activationsFill.style.width = `${actPct}%`;

    // Footer
    node.querySelector(".last-seen-val").textContent = fmtAgo(d.lastSeen);
    node.querySelector(".model-val").textContent = (t && t.modelVersion) ? t.modelVersion : "EdgeWake-KARYO-v1";

    grid.appendChild(node);

    // 3. UPDATE BLUEPRINT LOCATION MAP
    const mapNode = document.getElementById(`map-${d.deviceId}`);
    if (mapNode) {
      mapNode.classList.toggle("online", isOnline);
      mapNode.classList.toggle("offline", !isOnline);
      const pillState = mapNode.querySelector(".node-state-pill");
      if (pillState) {
        pillState.textContent = isOnline ? "ONLINE // ACTIVE" : "STANDBY";
      }
    }
  });

  // 4. TIMELINE EVENT FEED
  const eventList = qs("#eventList");
  if (!events.length) {
    eventList.innerHTML = `
      <div class="feed-empty-state">
        <div class="empty-radar-graphic">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"></circle>
            <circle cx="12" cy="12" r="6"></circle>
            <line x1="12" y1="2" x2="12" y2="12"></line>
            <line x1="12" y1="12" x2="19" y2="19"></line>
          </svg>
        </div>
        <div class="empty-state-title">Awaiting Edge Wake Events</div>
        <div class="empty-state-desc">Edge nodes are armed for the "Cosmos" wake word. Detected events will appear here with confidence score and latency.</div>
      </div>
    `;
  } else {
    eventList.innerHTML = events.map((e) => `
      <div class="feed-event-card">
        <div class="event-timestamp">${fmtFullTime(e.timestamp)}</div>
        <div class="event-details">
          <strong>${e.type === "COSMOS_DETECTED" ? "COSMOS WAKE WORD DETECTED" : escapeHtml(e.type)}</strong>
          <div class="event-meta">
            ${escapeHtml(e.deviceId)} · ${escapeHtml(e.location || "Unknown Sector")} · Latency: ${
              e.inferenceLatencyMs != null ? `${e.inferenceLatencyMs} ms` : "unrecorded"
            }
          </div>
        </div>
        <div class="confidence-pill">
          ${e.confidence != null ? `${(Number(e.confidence) * 100).toFixed(1)}% CONF` : "EVENT"}
        </div>
      </div>
    `).join("");
  }

  // 5. ASR TRANSCRIPTS FEED
  const transcriptList = qs("#transcriptList");
  if (!transcripts.length) {
    transcriptList.innerHTML = `
      <div class="feed-empty-state">
        <div class="empty-waveform-graphic">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M2 10v4"></path>
            <path d="M6 7v10"></path>
            <path d="M10 4v16"></path>
            <path d="M14 8v8"></path>
            <path d="M18 6v12"></path>
            <path d="M22 10v4"></path>
          </svg>
        </div>
        <div class="empty-state-title">ASR Pipeline Standing By</div>
        <div class="empty-state-desc">Post-wake audio transcription pipeline is ready. Real speech transcripts submitted to <code>/api/transcript</code> will stream here.</div>
      </div>
    `;
  } else {
    transcriptList.innerHTML = transcripts.map((t) => `
      <div class="feed-transcript-card">
        <div class="transcript-header">
          <div class="transcript-origin">
            <span class="transcript-node-chip">${escapeHtml(t.deviceId)}</span>
            <span class="transcript-time">${fmtFullTime(t.timestamp)}</span>
          </div>
          <span class="transcript-provider">${escapeHtml(t.provider || "ASR-INGEST")}</span>
        </div>
        <div class="transcript-body">
          "${escapeHtml(t.text)}"
        </div>
      </div>
    `).join("");
  }
}

/* ==========================================================================
   SOCKET.IO EVENT LISTENERS
   ========================================================================== */

socket.on("connect", () => {
  const dot = qs("#apiDot");
  const text = qs("#apiText");
  if (dot) dot.classList.add("live");
  if (text) text.textContent = "MISSION CONTROL ONLINE";
});

socket.on("disconnect", () => {
  const dot = qs("#apiDot");
  const text = qs("#apiText");
  if (dot) dot.classList.remove("live");
  if (text) text.textContent = "BROKER DISCONNECTED";
});

socket.on("snapshot", (data) => {
  devices = data.devices || [];
  events = data.events || [];
  transcripts = data.transcripts || [];
  render();
});

socket.on("device:update", (d) => {
  const idx = devices.findIndex((x) => x.deviceId === d.deviceId);
  if (idx >= 0) devices[idx] = d;
  else devices.push(d);
  render();
});

socket.on("event:new", (e) => {
  events.unshift(e);
  if (events.length > 100) events.pop();
  render();
});

socket.on("transcript:new", (t) => {
  transcripts.unshift(t);
  if (transcripts.length > 50) transcripts.pop();
  render();
});

// Periodic re-render to update relative time ("Seen X seconds ago") and clock
setInterval(render, 1000);
