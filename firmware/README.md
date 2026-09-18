# EdgeWake Node Firmware

This directory is designated for physical microcontroller firmware running on deployed EdgeWake nodes (such as ESP32-CAM and ESP32 audio boards).

## Planned Firmware Structure

Physical node firmware will be placed here during hardware integration:

```
firmware/
├── README.md
├── EW-001/              # Firmware build configured for node EW-001 (Control Room)
│   └── ...
└── EW-002/              # Firmware build configured for node EW-002 (Operations Lab)
    └── ...
```

## Node Requirements & Integration Flow

Each deployed node will be flashed with its assigned `deviceId` (`EW-001` or `EW-002`) and will perform:

1. **Network Initialization**: Connect to the local 2.4 GHz Wi-Fi network and locate the Mission Control backend at `<BACKEND_HOST>:3001`.
2. **Periodic Heartbeat (`POST /api/heartbeat`)**:
   - Transmit real hardware metrics every 5 seconds:
     - `freeHeapBytes` & `totalHeapBytes`
     - `freePsramBytes` & `totalPsramBytes`
     - `wifiRSSI`
     - `uptimeSeconds`
     - `inferenceLatencyMs`
     - `modelVersion` & `firmwareVersion`
3. **TinyML Inferencing**:
   - Run the compiled Edge Impulse C++ library (located in `model/EdgeWake_KARYO_inferencing.zip`).
   - Continuously sample microphone input for the "Cosmos" wake word.
4. **Wake Event Notification (`POST /api/event`)**:
   - When "Cosmos" is detected above threshold, immediately send detection confidence and inference latency.
5. **Post-Wake Audio Forwarding**:
   - Stream subsequent spoken audio to the configured ASR service for transcription.

> [!NOTE]
> Until hardware integration is completed and physical nodes are flashed and active, nodes in Mission Control will remain in an `OFFLINE` status with metrics displaying `Waiting`.
