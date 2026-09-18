# EdgeWake Architecture

EdgeWake is an edge-first wake-word and acoustic intelligence system designed for SIH26172. It deploys localized TinyML inference on resource-constrained microcontrollers while centralizing telemetry and wake activity monitoring through the EdgeWake Mission Control platform.

## High-Level Architecture Flow

```
Microphone
    ↓
EdgeWake node / ESP32
    ↓
TinyML wake-word inference ("Cosmos")
    ├── wake event → backend → Mission Control
    ↓
subsequent audio
    ↓
remote ASR
    ↓
transcript → Mission Control
```

### Flow Breakdown

1. **Acoustic Capture**: The audio stream is captured via microphone at the edge node.
2. **On-Device Inference**: An ESP32 microcontroller executes on-device TinyML inferencing using the trained "Cosmos" wake-word model.
3. **Wake Event Dispatch**: When the model detects "Cosmos", a wake event (`COSMOS_DETECTED`) containing detection confidence and inference latency is transmitted immediately to the EdgeWake backend and pushed in real time to Mission Control.
4. **Post-Wake Audio Stream**: Following wake-word detection, subsequent speech audio is captured and forwarded to remote Automatic Speech Recognition (ASR).
5. **ASR Transcription**: The transcription engine converts speech into text and forwards the transcript to the backend, where it is correlated with the triggering device and rendered on the Mission Control dashboard.

---

## EdgeWake Mission Control

EdgeWake Mission Control serves as the centralized command dashboard for deployed EdgeWake edge nodes.

### Responsibilities

- **Fleet Monitoring**: Tracks the operational state (Online/Offline) of all registered nodes (EW-001, EW-002, etc.) using automated heartbeat timeouts (15 seconds).
- **Registered Deployment Location**: Displays the pre-configured, administrative installation site of each physical node (e.g., "Control Room · Desk 01", "Operations Lab · Desk 02"). This is a static registered deployment location, NOT GPS/live tracking.
- **Device Health & Real Hardware Telemetry**: Ingests and visualizes genuine device telemetry:
  - Free and total Heap memory
  - Free and total PSRAM memory
  - Wi-Fi signal strength (RSSI in dBm)
  - System uptime
  - Local inference latency
  - Firmware and model version
- **Wake Event History**: Maintains an event timeline of all detected wake-word occurrences with timestamp, confidence, and latency.
- **ASR Transcripts**: Logs incoming remote speech recognition transcripts correlated by device ID.

> [!NOTE]
> Mission Control does not invent or mock hardware telemetry. In the absence of live device telemetry, metric fields remain in a clean "Waiting" / "OFFLINE" state.
