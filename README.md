# Lead Tracker

Desktop lead tracker for:

- Viewing leads from a Google Sheet
- Adding new leads directly in the tracker and syncing them to Google Sheets
- Updating lead state and follow-up reminders in Google Calendar
- Follow-up delay rules:
  - Cold = 7 days
  - Warm = 4 days
  - Hot = 2 days
  - Dead = disabled

## Google Sheet Schema

Create a Google Sheet with a tab named `Leads`.

Header row:

```text
Name | First Added | Last Interaction | Interaction Type | State | Follow-up Scheduled
```

Recommended values:

- Interaction Type: `PM`, `Post Comment`
- State: `Cold`, `Warm`, `Hot`, `Dead`
- Follow-up Scheduled: `NO` or timestamp

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`.

## Run

```bash
npm run dev
```

## Google API Setup

Enable these APIs in Google Cloud:

- Google Sheets API
- Google Calendar API

Create OAuth credentials:

- OAuth Client ID
- Type: Desktop app
- Add `http://127.0.0.1:3000` as an authorized redirect URI

Add the credentials to `.env`.

The app opens a browser window for Google login and stores tokens locally using `electron-store`.

## Files

```text
electron/
  main.ts
  preload.ts
  services/
    googleAuth.ts
    googleSheets.ts
    googleCalendar.ts
src/
  App.tsx
  main.tsx
  styles.css
```
