/**
 * EDGEWAKE MISSION CONTROL // CLIENT LOGIC
 * Real-time data synchronization, table rendering, and state management.
 * Strictly adheres to enterprise data integrity: zero synthetic values.
 */

// Establish WebSocket Connection to Mission Control Server
const socket = io();

// Operational State Store
let devices = [];
let events = [];
let transcripts = [];

// DOM Query Helper
const qs = (selector) => document.querySelector(selector);

/* ==========================================================================
   FORMATTERS & UTILITIES
   ========================================================================== */

function fmtTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function fmtAgo(iso) {
  if (!iso) return "Never";
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 3) return "Just now";
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

function fmtUptime(sec) {
  if (sec == null) return "—";
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
   MISSION CLOCKS (UTC & LOCAL STATION TIME)
   ========================================================================== */

function updateClocks() {
  const now = new Date();

  // UTC Time
  const utcHours = String(now.getUTCHours()).padStart(2, "0");
  const utcMinutes = String(now.getUTCMinutes()).padStart(2, "0");
  const utcSeconds = String(now.getUTCSeconds()).padStart(2, "0");
  const utcEl = qs("#clockUtc");
  if (utcEl) utcEl.textContent = `${utcHours}:${utcMinutes}:${utcSeconds}`;

  // Station Local Time
  const localEl = qs("#clockLocal");
  if (localEl) localEl.textContent = now.toLocaleTimeString([], { hour12: false });
}

setInterval(updateClocks, 1000);
updateClocks();

/* ==========================================================================
   DASHBOARD RENDERING PIPELINE
   ========================================================================== */

function render() {
  // 1. SUMMARY STRIP METRICS
  const registeredCount = devices.length;
  const onlineCount = devices.filter((d) => d.status === "online").length;

  qs("#metricRegistered").textContent = registeredCount;
  qs("#metricOnline").textContent = onlineCount;

  const onlineSubtext = qs("#metricOnlineSubtext");
  if (onlineSubtext) {
    if (onlineCount === 0) {
      onlineSubtext.textContent = "Awaiting heartbeat";
      onlineSubtext.className = "summary-subtext text-warning";
    } else {
      onlineSubtext.textContent = `${onlineCount} transmitting telemetry`;
      onlineSubtext.className = "summary-subtext text-success";
    }
  }

  // Activations
  const totalActivations = devices.reduce((sum, d) => sum + (d.activationCount || 0), 0);
  qs("#metricEvents").textContent = totalActivations;

  // Average Latency
  const validLatencies = events
    .map((e) => Number(e.inferenceLatencyMs))
    .filter((n) => !isNaN(n) && n > 0);
  const avgLatency = validLatencies.length
    ? Math.round(validLatencies.reduce((a, b) => a + b, 0) / validLatencies.length)
    : "—";
  qs("#metricLatency").textContent = avgLatency;

  // Transcripts
  qs("#metricTranscripts").textContent = transcripts.length;

  // 2. FLEET TABLE
  const tableBody = qs("#deviceTableBody");
  if (tableBody) {
    if (devices.length === 0) {
      tableBody.innerHTML = `
        <tr class="table-empty-row">
          <td colspan="10">
            <div class="empty-message">
              <span class="empty-title">No registered devices found</span>
              <span class="empty-subtext">Add device definitions to backend/devices.json</span>
            </div>
          </td>
        </tr>
      `;
    } else {
      tableBody.innerHTML = devices.map((d) => {
        const isOnline = d.status === "online";
        const t = d.telemetry;

        // Status Badge
        const statusBadge = isOnline
          ? `<span class="badge badge-online"><span class="badge-dot"></span>ONLINE</span>`
          : `<span class="badge badge-offline"><span class="badge-dot"></span>OFFLINE</span>`;

        // Heap Usage
        let heapCell = "—";
        if (t && t.heapUsedPercent != null) {
          const usedBytes = (t.totalHeapBytes && t.freeHeapBytes != null)
            ? `${fmtBytes(t.totalHeapBytes - t.freeHeapBytes)}`
            : "";
          heapCell = `
            <div class="usage-cell">
              <div class="usage-bar-track">
                <div class="usage-bar-fill" style="width: ${Math.min(100, Math.max(0, t.heapUsedPercent))}%;"></div>
              </div>
              <span class="usage-text">${t.heapUsedPercent}% ${usedBytes ? "· " + usedBytes : ""}</span>
            </div>
          `;
        }

        // PSRAM Usage
        let psramCell = "—";
        if (t && t.psramUsedPercent != null) {
          const usedBytes = (t.totalPsramBytes && t.freePsramBytes != null)
            ? `${fmtBytes(t.totalPsramBytes - t.freePsramBytes)}`
            : "";
          psramCell = `
            <div class="usage-cell">
              <div class="usage-bar-track">
                <div class="usage-bar-fill" style="width: ${Math.min(100, Math.max(0, t.psramUsedPercent))}%;"></div>
              </div>
              <span class="usage-text">${t.psramUsedPercent}% ${usedBytes ? "· " + usedBytes : ""}</span>
            </div>
          `;
        }

        // Wi-Fi Signal Bars
        let wifiCell = "—";
        if (t && t.wifiRSSI != null) {
          const rssi = Number(t.wifiRSSI);
          const activeBars = rssi >= -55 ? 4 : rssi >= -67 ? 3 : rssi >= -80 ? 2 : 1;
          wifiCell = `
            <div class="wifi-cell">
              <div class="wifi-bars">
                <span class="wifi-bar bar-1 ${activeBars >= 1 ? "active" : ""}"></span>
                <span class="wifi-bar bar-2 ${activeBars >= 2 ? "active" : ""}"></span>
                <span class="wifi-bar bar-3 ${activeBars >= 3 ? "active" : ""}"></span>
                <span class="wifi-bar bar-4 ${activeBars >= 4 ? "active" : ""}"></span>
              </div>
              <span class="wifi-val">${rssi} dBm</span>
            </div>
          `;
        }

        // Inference Latency
        const latencyCell = (t && t.inferenceLatencyMs != null)
          ? `<span class="cell-mono">${t.inferenceLatencyMs} ms</span>`
          : "—";

        // Uptime
        const uptimeCell = (t && t.uptimeSeconds != null)
          ? `<span class="cell-mono">${fmtUptime(t.uptimeSeconds)}</span>`
          : "—";

        // Activations
        const activationsCell = `<span class="cell-mono">${d.activationCount || 0}</span>`;

        // Last Seen
        const lastSeenCell = `<span class="cell-mono">${fmtAgo(d.lastSeen)}</span>`;

        return `
          <tr>
            <td class="cell-node-id">${escapeHtml(d.deviceId)}</td>
            <td>${escapeHtml(d.location || "Unassigned")}</td>
            <td>${statusBadge}</td>
            <td>${heapCell}</td>
            <td>${psramCell}</td>
            <td>${wifiCell}</td>
            <td>${latencyCell}</td>
            <td>${uptimeCell}</td>
            <td>${activationsCell}</td>
            <td>${lastSeenCell}</td>
          </tr>
        `;
      }).join("");
    }
  }

  // 3. UPDATE SCHEMATIC ROOM BADGES
  devices.forEach((d) => {
    const isOnline = d.status === "online";
    const schematicStatus = qs(`#schematicStatus-${d.deviceId}`);
    if (schematicStatus) {
      if (isOnline) {
        schematicStatus.className = "badge badge-online";
        schematicStatus.innerHTML = `<span class="badge-dot"></span>ONLINE`;
      } else {
        schematicStatus.className = "badge badge-offline";
        schematicStatus.innerHTML = `<span class="badge-dot"></span>OFFLINE`;
      }
    }
  });

  // 4. WAKE EVENT TABLE
  const eventTableBody = qs("#eventTableBody");
  if (eventTableBody) {
    if (events.length === 0) {
      eventTableBody.innerHTML = `
        <tr class="table-empty-row">
          <td colspan="6">
            <div class="empty-message">
              <span class="empty-title">No wake events received yet</span>
              <span class="empty-subtext">Events will appear after a connected node reports COSMOS_DETECTED.</span>
            </div>
          </td>
        </tr>
      `;
    } else {
      eventTableBody.innerHTML = events.map((e) => `
        <tr>
          <td class="cell-mono">${fmtTime(e.timestamp)}</td>
          <td class="cell-node-id">${escapeHtml(e.deviceId)}</td>
          <td><strong>${e.type === "COSMOS_DETECTED" ? "COSMOS_DETECTED" : escapeHtml(e.type)}</strong></td>
          <td>${escapeHtml(e.location || "—")}</td>
          <td class="cell-mono">${e.confidence != null ? (Number(e.confidence) * 100).toFixed(1) + "%" : "—"}</td>
          <td class="cell-mono">${e.inferenceLatencyMs != null ? e.inferenceLatencyMs + " ms" : "—"}</td>
        </tr>
      `).join("");
    }
  }

  // 5. ASR TRANSCRIPTS TABLE
  const transcriptTableBody = qs("#transcriptTableBody");
  if (transcriptTableBody) {
    if (transcripts.length === 0) {
      transcriptTableBody.innerHTML = `
        <tr class="table-empty-row">
          <td colspan="4">
            <div class="empty-message">
              <span class="empty-title">No speech transcripts received yet</span>
              <span class="empty-subtext">Transcripts will appear when audio is processed via /api/transcript.</span>
            </div>
          </td>
        </tr>
      `;
    } else {
      transcriptTableBody.innerHTML = transcripts.map((t) => `
        <tr>
          <td class="cell-mono" style="white-space: nowrap;">${fmtTime(t.timestamp)}</td>
          <td class="cell-node-id">${escapeHtml(t.deviceId)}</td>
          <td>"${escapeHtml(t.text)}"</td>
          <td><span class="tag tag-neutral">${escapeHtml(t.provider || "external-asr")}</span></td>
        </tr>
      `).join("");
    }
  }
}

/* ==========================================================================
   SOCKET.IO EVENT HANDLERS
   ========================================================================== */

socket.on("connect", () => {
  const indicator = qs("#connectionStatus");
  const text = qs("#connectionText");
  if (indicator) {
    indicator.className = "status-indicator status-online";
  }
  if (text) text.textContent = "Connected";
});

socket.on("disconnect", () => {
  const indicator = qs("#connectionStatus");
  const text = qs("#connectionText");
  if (indicator) {
    indicator.className = "status-indicator status-offline";
  }
  if (text) text.textContent = "Disconnected";
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

// Periodic re-render every second to refresh relative timestamps ("3s ago")
setInterval(render, 1000);
