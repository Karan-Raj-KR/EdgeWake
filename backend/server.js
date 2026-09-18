
const express = require("express");
const cors = require("cors");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3001;
const DATA_FILE = path.join(__dirname, "data.json");
const DEVICES_FILE = path.join(__dirname, "devices.json");

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const registered = JSON.parse(fs.readFileSync(DEVICES_FILE, "utf8"));

let state = {
  devices: Object.fromEntries(
    Object.values(registered).map(d => [d.deviceId, {
      ...d,
      status: "offline",
      lastSeen: null,
      telemetry: null,
      lastActivation: null,
      activationCount: 0
    }])
  ),
  events: [],
  transcripts: []
};

if (fs.existsSync(DATA_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    state.events = Array.isArray(saved.events) ? saved.events : [];
    state.transcripts = Array.isArray(saved.transcripts) ? saved.transcripts : [];
    for (const [id, d] of Object.entries(saved.devices || {})) {
      if (state.devices[id]) {
        state.devices[id].activationCount = d.activationCount || 0;
        state.devices[id].lastActivation = d.lastActivation || null;
      }
    }
  } catch (_) {}
}

function persist() {
  const safe = {
    devices: Object.fromEntries(
      Object.entries(state.devices).map(([id,d]) => [id, {
        activationCount: d.activationCount,
        lastActivation: d.lastActivation
      }])
    ),
    events: state.events.slice(-500),
    transcripts: state.transcripts.slice(-200)
  };
  fs.writeFileSync(DATA_FILE, JSON.stringify(safe, null, 2));
}

function publicDevice(d) {
  return {
    deviceId: d.deviceId,
    name: d.name,
    location: d.location,
    status: d.status,
    lastSeen: d.lastSeen,
    telemetry: d.telemetry,
    lastActivation: d.lastActivation,
    activationCount: d.activationCount
  };
}

function emitSnapshot() {
  io.emit("snapshot", {
    devices: Object.values(state.devices).map(publicDevice),
    events: state.events.slice(-100).reverse(),
    transcripts: state.transcripts.slice(-50).reverse()
  });
}

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "EdgeWake Mission Control API",
    time: new Date().toISOString()
  });
});

app.get("/api/devices", (_req, res) => {
  res.json(Object.values(state.devices).map(publicDevice));
});

app.get("/api/events", (_req, res) => {
  res.json(state.events.slice(-100).reverse());
});

app.get("/api/transcripts", (_req, res) => {
  res.json(state.transcripts.slice(-50).reverse());
});

app.post("/api/heartbeat", (req, res) => {
  const body = req.body || {};
  const id = body.deviceId;

  if (!id) return res.status(400).json({ error: "deviceId is required" });

  if (!state.devices[id]) {
    state.devices[id] = {
      deviceId: id,
      name: body.name || id,
      location: body.location || "Unassigned",
      status: "offline",
      lastSeen: null,
      telemetry: null,
      lastActivation: null,
      activationCount: 0
    };
  }

  const d = state.devices[id];
  if (body.location) d.location = body.location;

  const telemetry = {
    freeHeapBytes: body.freeHeapBytes ?? null,
    totalHeapBytes: body.totalHeapBytes ?? null,
    freePsramBytes: body.freePsramBytes ?? null,
    totalPsramBytes: body.totalPsramBytes ?? null,
    wifiRSSI: body.wifiRSSI ?? null,
    uptimeSeconds: body.uptimeSeconds ?? null,
    inferenceLatencyMs: body.inferenceLatencyMs ?? null,
    modelVersion: body.modelVersion ?? null,
    firmwareVersion: body.firmwareVersion ?? null
  };

  if (telemetry.totalHeapBytes && telemetry.freeHeapBytes != null) {
    telemetry.heapUsedPercent = +(
      (1 - telemetry.freeHeapBytes / telemetry.totalHeapBytes) * 100
    ).toFixed(1);
  } else {
    telemetry.heapUsedPercent = null;
  }

  if (telemetry.totalPsramBytes && telemetry.freePsramBytes != null) {
    telemetry.psramUsedPercent = +(
      (1 - telemetry.freePsramBytes / telemetry.totalPsramBytes) * 100
    ).toFixed(1);
  } else {
    telemetry.psramUsedPercent = null;
  }

  d.telemetry = telemetry;
  d.status = "online";
  d.lastSeen = new Date().toISOString();

  io.emit("device:update", publicDevice(d));
  res.json({ success: true, device: publicDevice(d) });
});

app.post("/api/event", (req, res) => {
  const body = req.body || {};
  const id = body.deviceId;

  if (!id) return res.status(400).json({ error: "deviceId is required" });

  const d = state.devices[id] || {
    deviceId: id,
    name: id,
    location: body.location || "Unknown",
    status: "offline",
    lastSeen: null,
    telemetry: null,
    lastActivation: null,
    activationCount: 0
  };
  state.devices[id] = d;

  const event = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    deviceId: id,
    type: body.type || "COSMOS_DETECTED",
    confidence: body.confidence ?? null,
    inferenceLatencyMs: body.inferenceLatencyMs ?? null,
    location: d.location,
    timestamp: new Date().toISOString()
  };

  state.events.push(event);
  if (state.events.length > 500) state.events.shift();

  if (event.type === "COSMOS_DETECTED") {
    d.activationCount += 1;
    d.lastActivation = event.timestamp;
  }

  persist();
  io.emit("event:new", event);
  io.emit("device:update", publicDevice(d));
  res.json({ success: true, event });
});

app.post("/api/transcript", (req, res) => {
  const body = req.body || {};
  if (!body.deviceId || !body.text) {
    return res.status(400).json({ error: "deviceId and text are required" });
  }

  const item = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    deviceId: body.deviceId,
    text: String(body.text),
    provider: body.provider || "external-asr",
    timestamp: new Date().toISOString()
  };

  state.transcripts.push(item);
  if (state.transcripts.length > 200) state.transcripts.shift();

  persist();
  io.emit("transcript:new", item);
  res.json({ success: true, transcript: item });
});

setInterval(() => {
  const now = Date.now();
  let changed = false;

  for (const d of Object.values(state.devices)) {
    if (d.status === "online" && d.lastSeen) {
      if (now - new Date(d.lastSeen).getTime() > 15000) {
        d.status = "offline";
        changed = true;
        io.emit("device:update", publicDevice(d));
      }
    }
  }

  if (changed) emitSnapshot();
}, 3000);

io.on("connection", socket => {
  socket.emit("snapshot", {
    devices: Object.values(state.devices).map(publicDevice),
    events: state.events.slice(-100).reverse(),
    transcripts: state.transcripts.slice(-50).reverse()
  });
});

const dashboardDir = path.join(__dirname, "..", "dashboard");
const micClientDir = path.join(__dirname, "..", "mic-client");

app.use("/", express.static(dashboardDir));
app.use("/mic", express.static(micClientDir));

server.listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log("======================================");
  console.log(" EdgeWake Mission Control");
  console.log("======================================");
  console.log(`Dashboard : http://localhost:${PORT}`);
  console.log(`Mic client: http://localhost:${PORT}/mic`);
  console.log(`API health: http://localhost:${PORT}/health`);
  console.log("");
});
