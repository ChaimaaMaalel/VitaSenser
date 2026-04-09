# Bed Vital Simulation Bot

This folder is reserved for simulator-specific assets and scripts.

## Phase 1 (implemented in backend)

The simulation runtime currently lives in the backend service layer:

- `backend/src/services/simulation.service.ts`
- `backend/src/routes/simulation.routes.ts`

Why: this keeps simulation state close to database writes and websocket emission.

## Available API endpoints

Base path: `/api/v1/simulation`

- `GET /beds`
- `GET /beds/:bedId/status`
- `POST /beds/:bedId/start`
- `POST /beds/:bedId/stop`
- `PATCH /beds/:bedId/profile`
- `POST /beds/:bedId/manual-signal`

## Example payloads

Start stable simulation:

```json
{
  "profile": "STABLE",
  "intervalMs": 3000
}
```

Switch to critical profile:

```json
{
  "profile": "CRITICAL",
  "intervalMs": 2000
}
```

Publish manual signal:

```json
{
  "heartRate": 145,
  "temperature": 39.2,
  "spO2": 89,
  "glucose": 260
}
```

## Realtime events

- `bed-signal:update`
- `patient-vitals:update`
- `bed-simulation:status`

Socket subscriptions:

- `subscribe-bed` / `unsubscribe-bed`
- `subscribe-patient` / `unsubscribe-patient`
