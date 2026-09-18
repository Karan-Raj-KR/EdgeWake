/**
 * EDGEWAKE MISSION CONTROL // CLIENT LOGIC & FUNCTIONAL ANALYTICS
 * Real-time data synchronization, table rendering, SVG trend charts, and state management.
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
   SVG ANALYTICAL CHARTS PIPELINE (ZERO GRADIENTS / ZERO FAKE DATA)
   ========================================================================== */

function renderOperationalAnalytics() {
  // 1. Wake Event Activity Bar Chart
  const eventsSvg = qs("#chartEvents");
  const eventTotalPill = qs("#analyticsEventTotal");
  if (eventsSvg) {
    if (events.length === 0) {
      if (eventTotalPill) eventTotalPill.textContent = "0 Events";
      eventsSvg.innerHTML = `
        <line x1="20" y1="85" x2="300" y2="85" stroke="#D7DAD5" stroke-width="1" />
        <line x1="20" y1="50" x2="300" y2="50" stroke="#E5E7E3" stroke-width="1" stroke-dasharray="3,3" />
        <text x="160" y="54" text-anchor="middle" font-size="11" fill="#8C949D" font-family="Inter, sans-serif">No wake events recorded yet</text>
      `;
    } else {
      if (eventTotalPill) eventTotalPill.textContent = `${events.length} Events Logged`;

      // Group recent events into 8 sequential time slices or bins
      const binCount = 8;
      const bins = new Array(binCount).fill(0);
      const recent = events.slice(0, 32);
      recent.forEach((e, idx) => {
        const b = Math.min(binCount - 1, Math.floor((idx / recent.length) * binCount));
        bins[binCount - 1 - b]++;
      });

      const maxVal = Math.max(1, Math.max(...bins));
      const chartW = 280;
      const chartH = 70;
      const startX = 25;
      const baseY = 90;
      const barW = Math.floor(chartW / binCount) - 8;

      let rects = `
        <line x1="20" y1="${baseY}" x2="305" y2="${baseY}" stroke="#D7DAD5" stroke-width="1" />
        <line x1="20" y1="45" x2="305" y2="45" stroke="#E5E7E3" stroke-width="1" stroke-dasharray="3,3" />
      `;

      bins.forEach((cnt, i) => {
        const x = startX + i * (barW + 8);
        const h = cnt > 0 ? Math.max(4, Math.round((cnt / maxVal) * chartH)) : 0;
        const y = baseY - h;
        const fill = cnt > 0 ? "#2F5D7C" : "transparent";
        rects += `<rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${fill}" rx="2">
          <title>${cnt} event(s)</title>
        </rect>`;
      });

      eventsSvg.innerHTML = rects;
    }
  }

  // 2. Inference Latency Trend Line Chart
  const latencySvg = qs("#chartLatency");
  const latencyStatPill = qs("#analyticsLatencyStat");
  if (latencySvg) {
    const validEvents = events
      .filter((e) => e.inferenceLatencyMs != null && !isNaN(Number(e.inferenceLatencyMs)))
      .slice(0, 20)
      .reverse();

    if (validEvents.length === 0) {
      if (latencyStatPill) latencyStatPill.textContent = "Ref: <100ms";
      latencySvg.innerHTML = `
        <line x1="20" y1="85" x2="300" y2="85" stroke="#D7DAD5" stroke-width="1" />
        <line x1="20" y1="48" x2="300" y2="48" stroke="#B7791F" stroke-width="1" stroke-dasharray="3,3" />
        <text x="302" y="52" text-anchor="end" font-size="9" fill="#B7791F" font-family="JetBrains Mono, monospace">100ms</text>
        <text x="160" y="54" text-anchor="middle" font-size="11" fill="#8C949D" font-family="Inter, sans-serif">Awaiting hardware inferencing benchmarks</text>
      `;
    } else {
      const latencies = validEvents.map((e) => Number(e.inferenceLatencyMs));
      const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
      if (latencyStatPill) latencyStatPill.textContent = `Avg: ${avg}ms (N=${latencies.length})`;

      const maxLat = Math.max(160, ...latencies);
      const chartW = 270;
      const startX = 25;
      const baseY = 90;
      const topY = 20;
      const rangeY = baseY - topY;

      // 100ms threshold reference line
      const threshY = Math.round(baseY - (100 / maxLat) * rangeY);

      let content = `
        <line x1="20" y1="${baseY}" x2="305" y2="${baseY}" stroke="#D7DAD5" stroke-width="1" />
        <line x1="20" y1="${threshY}" x2="305" y2="${threshY}" stroke="#B7791F" stroke-width="1" stroke-dasharray="3,3" />
        <text x="302" y="${threshY - 3}" text-anchor="end" font-size="9" fill="#B7791F" font-family="JetBrains Mono, monospace">100ms</text>
      `;

      if (latencies.length === 1) {
        const ptY = Math.round(baseY - (latencies[0] / maxLat) * rangeY);
        content += `<circle cx="160" cy="${ptY}" r="4" fill="${latencies[0] <= 100 ? "#2F7D4A" : "#B7791F"}"><title>${latencies[0]} ms</title></circle>`;
      } else {
        const step = chartW / (latencies.length - 1);
        const points = latencies.map((val, i) => {
          const px = Math.round(startX + i * step);
          const py = Math.round(baseY - (val / maxLat) * rangeY);
          return `${px},${py}`;
        }).join(" ");

        content += `<polyline fill="none" stroke="#2F5D7C" stroke-width="2" points="${points}" />`;
        latencies.forEach((val, i) => {
          const px = Math.round(startX + i * step);
          const py = Math.round(baseY - (val / maxLat) * rangeY);
          const dotColor = val <= 100 ? "#2F7D4A" : "#B7791F";
          content += `<circle cx="${px}" cy="${py}" r="3" fill="${dotColor}"><title>${val} ms</title></circle>`;
        });
      }

      latencySvg.innerHTML = content;
    }
  }

  // 3. Node Activity Comparison Bars
  const compContainer = qs("#chartComparison");
  const ratioStatPill = qs("#analyticsRatioStat");
  if (compContainer) {
    const totalActs = devices.reduce((sum, d) => sum + (d.activationCount || 0), 0);
    if (ratioStatPill) {
      ratioStatPill.textContent = `${totalActs} Total Triggers`;
    }

    if (devices.length === 0) {
      compContainer.innerHTML = `<span style="font-size: 11px; color: #8C949D; margin: auto;">No devices registered</span>`;
    } else {
      const maxActs = Math.max(1, Math.max(...devices.map((d) => d.activationCount || 0)));
      compContainer.innerHTML = devices.map((d) => {
        const count = d.activationCount || 0;
        const widthPct = Math.round((count / maxActs) * 100);
        return `
          <div class="comp-bar-item">
            <div class="comp-bar-label">
              <span class="comp-node-name">${escapeHtml(d.deviceId)} · ${escapeHtml(d.location || "Unassigned")}</span>
              <span class="comp-node-count">${count} trigger${count === 1 ? "" : "s"}</span>
            </div>
            <div class="comp-bar-track">
              <div class="comp-bar-fill" style="width: ${widthPct}%;"></div>
            </div>
          </div>
        `;
      }).join("");
    }
  }
}

/* ==========================================================================
   DASHBOARD RENDERING PIPELINE
   ========================================================================== */

function render() {
  // 1. FLEET HEALTH WIDGET (DISTRIBUTION BAR)
  const registeredCount = devices.length;
  const onlineCount = devices.filter((d) => d.status === "online").length;
  const offlineCount = Math.max(0, registeredCount - onlineCount);
  const onlinePct = registeredCount > 0 ? Math.round((onlineCount / registeredCount) * 100) : 0;
  const offlinePct = 100 - onlinePct;

  const barOnline = qs("#barOnline");
  const barOffline = qs("#barOffline");
  const fleetHealthPercent = qs("#fleetHealthPercent");
  const legendOnlineText = qs("#legendOnlineText");
  const legendOfflineText = qs("#legendOfflineText");

  if (barOnline) barOnline.style.width = `${onlinePct}%`;
  if (barOffline) barOffline.style.width = `${offlinePct}%`;
  if (fleetHealthPercent) fleetHealthPercent.textContent = `${onlinePct}% Online`;
  if (legendOnlineText) legendOnlineText.textContent = `${onlineCount} Online`;
  if (legendOfflineText) legendOfflineText.textContent = `${offlineCount} Offline`;

  // 2. SUMMARY STRIP METRICS
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

  // 3. OPERATIONAL ANALYTICS SECTION
  renderOperationalAnalytics();

  // 4. FLEET TABLE
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
        let latencyCell = "—";
        if (t && t.inferenceLatencyMs != null) {
          const latVal = Number(t.inferenceLatencyMs);
          const badgeClass = latVal <= 100 ? "badge-online" : "badge-warning";
          latencyCell = `<span class="badge ${badgeClass}">${latVal} ms</span>`;
        }

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

  // 5. UPDATE SCHEMATIC ROOM BADGES & METADATA
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

    const schematicMeta = qs(`#schematicMeta-${d.deviceId}`);
    if (schematicMeta) {
      schematicMeta.textContent = `Heartbeat: ${fmtAgo(d.lastSeen)} · ${d.activationCount || 0} activations`;
    }
  });

  // 6. WAKE EVENT TABLE
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
      eventTableBody.innerHTML = events.map((e) => {
        const confNum = e.confidence != null ? Number(e.confidence) : null;
        const confBadge = confNum != null
          ? `<span class="badge ${confNum >= 0.90 ? "badge-online" : "badge-warning"}">${(confNum * 100).toFixed(1)}%</span>`
          : "—";

        const latVal = e.inferenceLatencyMs != null ? Number(e.inferenceLatencyMs) : null;
        const latBadge = latVal != null
          ? `<span class="cell-mono">${latVal} ms</span>`
          : "—";

        return `
          <tr>
            <td class="cell-mono">${fmtTime(e.timestamp)}</td>
            <td class="cell-node-id">${escapeHtml(e.deviceId)}</td>
            <td><span class="event-type-chip">${e.type === "COSMOS_DETECTED" ? "COSMOS_DETECTED" : escapeHtml(e.type)}</span></td>
            <td>${escapeHtml(e.location || "—")}</td>
            <td>${confBadge}</td>
            <td>${latBadge}</td>
          </tr>
        `;
      }).join("");
    }
  }

  // 7. ASR TRANSCRIPTS TABLE & MINI ANALYTICS
  const transcriptDistText = qs("#transcriptDistributionText");
  if (transcriptDistText) {
    if (transcripts.length === 0) {
      transcriptDistText.textContent = "0 total logs";
    } else {
      const byDev = {};
      transcripts.forEach((t) => {
        byDev[t.deviceId] = (byDev[t.deviceId] || 0) + 1;
      });
      const parts = Object.entries(byDev).map(([id, cnt]) => `${id}: ${cnt}`).join(" · ");
      transcriptDistText.textContent = `${transcripts.length} logs (${parts})`;
    }
  }

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
