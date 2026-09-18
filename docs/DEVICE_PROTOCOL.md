# EdgeWake Device → Mission Control Protocol

The dashboard does not invent device values. Until a physical node sends a heartbeat, the node stays **OFFLINE** and metrics display **Waiting**.

## Heartbeat

`POST http://<MAC_IP>:3001/api/heartbeat`

```json
{
  "deviceId": "EW-001",
  "freeHeapBytes": 120000,
  "totalHeapBytes": 220000,
  "freePsramBytes": 3500000,
  "totalPsramBytes": 4194304,
  "wifiRSSI": -54,
  "uptimeSeconds": 123,
  "inferenceLatencyMs": 72,
  "modelVersion": "EdgeWake-KARYO-v1",
  "firmwareVersion": "1.0.0"
}
```

The server computes heap and PSRAM used percentages.

## Wake event

`POST http://<MAC_IP>:3001/api/event`

```json
{
  "deviceId": "EW-001",
  "type": "COSMOS_DETECTED",
  "confidence": 0.94,
  "inferenceLatencyMs": 72
}
```

## ASR transcript

`POST http://<MAC_IP>:3001/api/transcript`

```json
{
  "deviceId": "EW-001",
  "text": "Start telemetry sequence",
  "provider": "your-asr-service"
}
```

## Offline logic

If Mission Control receives no heartbeat for 15 seconds, that node is marked offline automatically.
