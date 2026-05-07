# Class Record Web App

Full-stack class record system with a Node.js backend API and a static frontend.

## Features

- First-run admin account setup
- Admin, teacher, and student dashboards
- Subjects, grades, and attendance tracking
- File-based JSON datastore for simple deployments and demos

## Requirements

- Node.js 18 or newer
- npm

## Run Locally

```bash
npm install
npm start
```

Open `http://localhost:3000`.

On first run, the app creates `data/class-record.json` automatically and asks you to create the first admin account.

## Environment

Copy `.env.example` only as a reference for deployment settings. This app does not load `.env` files automatically, so set these variables in your terminal or hosting provider dashboard.

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `3000` | Hosting providers usually set this automatically. |
| `DATA_DIR` | `./data` | Optional directory for runtime JSON data. |
| `DATA_FILE` | `./data/class-record.json` | Optional full path for runtime JSON data. |
| `ALLOW_DATA_RESET` | `false` | Set to `true` only for local demos. Enables `/api/reset`. |

## Deploy From GitHub

This is a Node.js backend app, so it cannot be hosted by GitHub Pages alone. Push the repository to GitHub, then connect it to a Node-capable host such as Render, Railway, Fly.io, or Heroku.

Use these deploy settings:

- Build command: `npm ci`
- Start command: `npm start`
- Node version: `20` or newer
- Health check path: `/api/health`

For hosts with ephemeral filesystems, configure persistent storage and set `DATA_DIR` or `DATA_FILE` to that mounted path. Without persistent storage, class records may be lost when the service restarts or redeploys.

## GitHub Checklist

- Do not commit `data/class-record.json`; it contains runtime users and passwords.
- Commit `data/class-record.example.json` instead if you need a safe sample file.
- If `data/class-record.json` was already committed before `.gitignore` was applied, remove it from Git tracking with:

```bash
git rm --cached data/class-record.json
```

Then commit the removal. Your local runtime file can remain on disk.

## Verification

```bash
npm run check
```
