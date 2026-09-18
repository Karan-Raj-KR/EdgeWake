# EdgeWake Mission Control

EdgeWake is an edge-first wake-word and acoustic intelligence system developed for SIH26172. It combines local TinyML wake-word detection ("Cosmos") running on physical microcontrollers with centralized fleet monitoring via EdgeWake Mission Control.

---

## Status & Capabilities

### ALREADY IMPLEMENTED
- **Edge Impulse Cosmos model trained/exported**: Trained C++ inference library stored in `model/EdgeWake_KARYO_inferencing.zip`.
- **Mission Control backend**: Real-time Node.js server with Socket.io and REST APIs.
- **Dashboard software**: Clean dark-mode Mission Control web interface.
- **EW-001 / EW-002 registered node support**: Pre-configured registered node profiles defined in `backend/devices.json`.
- **Heartbeat API (`POST /api/heartbeat`)**: Ingestion of real hardware metrics (Heap, PSRAM, RSSI, uptime, inference latency, model version).
- **Event API (`POST /api/event`)**: Real-time wake-word event recording and live dispatch.
- **Transcript API (`POST /api/transcript`)**: Ingestion and display of ASR transcripts.
- **Online/Offline timeout**: Automatic transition of nodes to `OFFLINE` after 15 seconds without a heartbeat.
- **Strict No-Fabrication Policy**: When devices have no telemetry, the dashboard displays `OFFLINE` and `Waiting` — never fake, mocked, or simulated hardware data.

### NOT YET HARDWARE-INTEGRATED
- Our model running on our ESP32-CAM
- Real ESP32 telemetry
- Live microphone input
- Raw audio forwarding
- Automatic ASR
- Live GPS/UWB positioning (node locations are administrative **registered deployment locations**, not GPS tracking)
- Speaker verification

---

## Project Structure

```
EdgeWake/
├── backend/
│   ├── server.js              # Mission Control API server & Socket.io hub
│   ├── package.json
│   ├── package-lock.json
│   ├── devices.json           # Registered device catalog (EW-001, EW-002)
│   └── data.json              # State persistence (events, transcripts)
│
├── dashboard/
│   ├── index.html             # Mission Control dashboard UI
│   ├── app.js                 # Dashboard logic & Socket.io client
│   └── styles.css             # Dashboard styling
│
├── mic-client/
│   └── index.html             # Audio Bridge for testing host microphone capture
│
├── firmware/
│   └── README.md              # Placement & integration guidelines for EW-001 / EW-002
│
├── model/
│   └── EdgeWake_KARYO_inferencing.zip  # Trained Edge Impulse C++ inferencing library
│
├── docs/
│   ├── ARCHITECTURE.md        # System architecture and data flow
│   └── DEVICE_PROTOCOL.md     # Node-to-backend communication protocol
│
├── .gitignore
└── README.md
```

---

## Getting Started

### 1. Install Dependencies & Start Mission Control

From the `backend` directory:

```bash
cd backend
npm install
npm start
```

The server runs on port `3001` by default:

- **Mission Control Dashboard**: [http://localhost:3001](http://localhost:3001)
- **Audio Bridge**: [http://localhost:3001/mic](http://localhost:3001/mic)
- **API Health Check**: [http://localhost:3001/health](http://localhost:3001/health)

### 2. Physical Device Integration

When physical ESP32 nodes are powered on:
1. Connect to the local Wi-Fi network.
2. Direct heartbeats to `http://<HOST_IP>:3001/api/heartbeat`.
3. Nodes EW-001 and EW-002 will automatically transition from `OFFLINE` to `ONLINE`, and live telemetry will populate their cards.

See [docs/DEVICE_PROTOCOL.md](file:///Users/karanrajkr/Projects/EdgeWake/docs/DEVICE_PROTOCOL.md) for payload specifications.
