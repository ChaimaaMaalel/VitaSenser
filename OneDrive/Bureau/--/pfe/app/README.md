# Smart Hospital Mobile (React Native)

This folder contains the React Native app version (Expo + TypeScript).

## API URL (Important)

Do not use localhost for mobile.

Set your backend LAN URL in `.env`:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.68:5000/api/v1
```

If your PC IP changes, update this value.

## Run

1. Install dependencies:

```bash
npm install
```

2. Start app:

```bash
npm run start
```

3. Open on Android/iOS simulator or Expo Go.

## Implemented now

- Auth login screen wired to `/auth/login`
- App navigation with tabs + patient detail stack
- Core screens scaffolded from inventory:
  - Dashboard
  - Patients
  - Patient detail
  - Alerts
  - Simulation
  - Hospital
  - Users
- API service configured to use LAN IP by default

## Next migration steps

- Move each web page feature block into its mobile screen
- Add state/data modules per screen
- Port realtime socket flows (alerts, patient live vitals, simulation)
- Port modal flows (events, dossier files, emergency alerts)
