# bball — MLB Gameday Ping Service

A lightweight Node.js service that monitors live MLB games for a configured team, extracts game state (outs, score, inning), and broadcasts updates to connected clients via Socket.IO.

## Getting Started

### Prerequisites

- Node.js 20+
- npm

### Install

```sh
npm install
```

### Configure

Copy the example env file and adjust values:

```sh
cp .env.example .env
```

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP server port | `4000` |
| `TEAM_ID` | MLB team ID ([lookup](https://statsapi.mlb.com/api/v1/teams?sportId=1)) | — |
| `IDLE_POLL_INTERVAL` | Seconds between polls when no game is active | `60` |
| `ACTIVE_POLL_INTERVAL` | Seconds between polls during a live game | `30` |
| `MAX_RETRIES` | Retry attempts per poll tick on network error | `3` |
| `RETRY_BACKOFF_MS` | Base back-off in ms (doubled each retry) | `500` |

### Run

```sh
# Development (auto-reload)
npm run dev

# Production
npm run build
npm start
```

### Test

```sh
npm test            # watch mode
npm run test:ci     # single run
npm run test:coverage
```

## How It Works

1. **Scheduler** polls the MLB Schedule API (`/api/v1/schedule`) with `linescore` and `team` hydrations on a configurable interval.
2. **Parser** checks if the configured team has a game in progress and is currently on defense.
3. When defending, a `game-update` event is emitted via **Socket.IO** containing score, inning, outs, and team info.
4. Poll interval switches between idle and active rates based on game state.

### Socket.IO Events

| Event | Direction | Payload |
|---|---|---|
| `game-update` | Server → Client | `{ gameStatus, teams, score, inning, outs, defendingTeam }` |

### API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check — returns `{ "status": "ok" }` |

## Project Structure

```
src/
  config/
    env.ts              # Zod-validated environment config
    logger.ts           # Winston logger
  routes/
    health.ts           # Health check endpoint
  scheduler/
    mlb-scheduler.ts    # Cron-based poll loop with adaptive intervals
    poller.ts           # MLB Schedule API client
    parser.ts           # Extracts game state from API response
    logger.ts           # Debug log for game updates
    types.ts            # Shared TypeScript interfaces
  server/
    app.ts              # Express app setup
    http-server.ts      # HTTP server factory
    socket.ts           # Socket.IO setup
  index.ts              # Entrypoint
```
