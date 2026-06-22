# Wilds Hub

A companion PWA for Monster Hunter Wilds — five tactical tools in one offline-capable dashboard.

## Features

| Screen | Description |
|--------|-------------|
| **Environmental Sandbox** | Plot pop-up camps across five living regions, read seasonal phases and danger zones |
| **Monster Encyclopedia** | Hitzone data, elemental weaknesses, and reward tables per monster |
| **Armory** | Weapon upgrade trees with sharpness and Artian reinforcement simulator; armor browser with skill/slot details |
| **Favorites & Farming** | Star weapons/armor to auto-aggregate crafting materials into a farm tracker |
| **Set Builder** | Mixed Set Searcher (MSS) — find armor combinations that hit your desired skill targets |

## Tech Stack

- **React 19 + TypeScript** — Vite build
- **Dexie.js** — IndexedDB for offline-first data storage
- **React Router v6** — client-side routing
- **Tailwind CSS v4** — `@theme inline` token mapping
- **Web Worker** — MSS engine runs off the main thread
- **PWA** — works offline after first load

## Data Source

All game data fetched from the public [MH Wilds API](https://wilds.mhdb.io) and cached locally in IndexedDB. No backend required.

## Local Development

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build
npm run lint
```

## Environment Variables

Public defaults are in `.env` (committed). Override locally with `.env.local` (gitignored — never commit secrets).

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE` | `https://wilds.mhdb.io/en` | Game data API base URL |
| `VITE_API_VERSION_URL` | `https://wilds.mhdb.io/version` | API version endpoint for cache busting |

See `.env.example` for the full template.

## Deployment

CI/CD via GitHub Actions — pushes to `main` automatically build a Docker image, push to GHCR, and deploy to VPS.

```
push to main → build Docker image → push ghcr.io → SSH → docker pull + restart
```

**Required GitHub Secrets:**

| Secret | Value |
|--------|-------|
| `VPS_HOST` | VPS IP or domain |
| `VPS_USER` | SSH username |
| `VPS_SSH_KEY` | Private key (full `-----BEGIN…-----END…` block) |

The container runs `nginx:alpine` serving the static build. React Router SPA fallback is configured in `nginx.conf`.
