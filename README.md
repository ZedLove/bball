# bball — MLB Live Game Tracker

A real-time Node.js/TypeScript backend that tracks live MLB games for a configured team and pushes rich game state to connected clients via Socket.IO. It polls the MLB Stats API, enriches each tick with play-by-play data and Statcast tracking, and emits three distinct socket events covering every aspect of an in-progress game.

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

| Variable               | Description                                                                          | Default |
| ---------------------- | ------------------------------------------------------------------------------------ | ------- |
| `PORT`                 | HTTP server port                                                                     | `4000`  |
| `TEAM`                 | Team abbreviation — preferred shorthand (e.g. `TEAM=TOR`)                            | —       |
| `TEAM_ID`              | MLB numeric team ID ([lookup](https://statsapi.mlb.com/api/v1/teams?sportId=1))      | —       |
| `IDLE_POLL_INTERVAL`   | Seconds between polls when no game is active                                         | `60`    |
| `ACTIVE_POLL_INTERVAL` | Seconds between polls during a live game                                             | `10`    |
| `MAX_RETRIES`          | Retry attempts per tick on network error                                             | `3`     |
| `RETRY_BACKOFF_MS`     | Base back-off in ms (doubled each retry)                                             | `500`   |
| `DEV_MODE`             | Set `true` to disable real polling and run the dev event simulator instead           | `false` |
| `ENABLE_ADMIN_UI`      | Set `true` to mount the Socket.IO Admin UI panel (dev tool — do not expose publicly) | `false` |
| `CORS_ORIGIN`          | Allowed CORS origin for socket connections                                           | `*`     |

`TEAM` takes precedence over `TEAM_ID` if both are set. Pass an invalid abbreviation to see the full list.

### Run

```sh
# Development (auto-reload, requires TEAM or TEAM_ID in .env)
npm run dev

# Development with team override (no .env edit needed)
TEAM=TOR npm run dev

# Dev simulator (no MLB API calls)
DEV_MODE=true npm run dev

# Production
npm run build
npm start
```

### Test

```sh
npm run test:ci       # single run
npm run test:coverage # with coverage report
```

Coverage thresholds enforced: lines 93%, functions 91%, branches 86%.

## How It Works

The service runs a polling loop that calls the MLB Stats API, assembles a rich game state snapshot each tick, and pushes it to all connected Socket.IO clients. Three concurrent data sources feed each tick:

1. **Schedule poll** (`/api/v1/schedule`) — game state, linescore (score, inning, outs, runners, pitcher), and venue metadata. Runs every tick.
2. **`feed/live`** (`/api/v1.1/game/{gamePk}/feed/live`) — the in-progress plate appearance (`currentPlay`), live count, pitch sequence with full Statcast tracking, and cumulative `allPlays` for pitcher stats. Runs every `'live'` tick in parallel with the schedule poll.
3. **`diffPatch`** (`/api/v1.1/game/{gamePk}/feed/live/diffPatch`) — completed play deltas used to emit enriched `game-events` (at-bat outcomes, substitutions). Runs conditionally when the linescore indicates a state change.

Each tick emits up to three Socket.IO events (see below). When a client connects mid-game the server immediately replays the last `game-update` and `game-summary` (if final) so clients always start from a consistent state.

### Socket.IO Events

| Event          | Direction       | Description                                                                                                                                                                                                          |
| -------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `game-update`  | Server → Client | Full game snapshot emitted every `'live'` tick. Includes score, inning, runners, live at-bat state, pitch sequence, full Statcast tracking, pitcher stats, venue field info, and team context. `null` between games. |
| `game-events`  | Server → Client | Batch of completed-play events emitted when enrichment detects new plays. Covers at-bat outcomes (`plate-appearance-completed`), pitching substitutions, and other in-game events.                                   |
| `game-summary` | Server → Client | Emitted once when the game ends. Includes final score, winning/losing pitcher decisions, save, and next scheduled game.                                                                                              |

#### `game-update` tracking modes

| `trackingMode`      | When emitted                                                |
| ------------------- | ----------------------------------------------------------- |
| `'live'`            | Every tick during active play (both halves of every inning) |
| `'between-innings'` | Once on each half-inning transition                         |
| `'final'`           | Once when the game ends; scheduler returns to idle polling  |

### API Endpoints

| Method | Path      | Description                                 |
| ------ | --------- | ------------------------------------------- |
| `GET`  | `/health` | Health check — returns `{ "status": "ok" }` |

## Dev Simulator

Set `DEV_MODE=true` to replace the real MLB polling loop with an event-driven simulator. The simulator replays a scripted game sequence at configurable speed and exposes an interactive CLI for injecting events (pitch, out, home run, pitching change, etc.).

```sh
DEV_MODE=true npm run dev
```

The terminal monitor (`src/monitor/`) connects to the simulator via Socket.IO and renders all three event streams live.

## Capture & Replay Tools

```sh
# Capture a live game to disk (creates captures/<date>-<gamePk>/)
npx tsx scripts/capture-game.ts

# Replay a captured session through the simulator
DEV_MODE=true npm run dev
# Then in the CLI: select "Replay from capture"

# Analyse a captured session
npx tsx scripts/analyze/state-transitions.ts captures/<session>/ticks.ndjson
npx tsx scripts/analyze/at-bat-transitions.ts captures/<session>/ticks.ndjson
npx tsx scripts/analyze/pitcher-stats.ts captures/<session>/ticks.ndjson
```

## Project Structure

```
src/
  config/
    env.ts                    # Zod-validated environment config + team resolution
    logger.ts                 # Winston logger
    teams.ts                  # Team abbreviation → ID map
  routes/
    health.ts                 # Health check endpoint
  scheduler/
    mlb-scheduler.ts          # Main poll loop — schedule, feed/live, diffPatch, venue
    parser.ts                 # Produces GameUpdate from schedule response
    current-play-parser.ts    # Assembles AtBatState from feed/live currentPlay
    feed-parser.ts            # Parses diffPatch response into GameEvent[]
    pitcher-stats.ts          # Computes PitcherGameStats from allPlays
    pitch-mapper.ts           # Maps raw PlayEvent to PitchEvent (Statcast fields)
    enrichment-state.ts       # Manages per-game diffPatch cursor
    change-detector.ts        # Detects linescore deltas that trigger enrichment
    summary-parser.ts         # Produces GameSummary from final feed response
    known-event-types.ts      # Categorises and filters game event types
    schedule-client.ts        # MLB schedule API client
    game-feed-client.ts       # diffPatch feed client
    game-feed-live-client.ts  # feed/live client
    game-feed-types.ts        # Raw MLB API type definitions
    boxscore-client.ts        # Boxscore API client
    next-game-client.ts       # Next scheduled game client
    venue-client.ts           # Venue field dimensions client
    logger.ts                 # Per-tick game state log formatting
  server/
    app.ts                    # Express app setup
    socket.ts                 # Socket.IO setup and replay-on-connect
    socket-events.ts          # Emitted type definitions and SOCKET_EVENTS constant
  dev/
    dev-simulator.ts          # Event-driven game simulator (DEV_MODE=true)
    emitter/                  # Simulator event handlers and payload factory
    state/                    # Simulator game state store
    cli/                      # Interactive CLI and replay command
    capture-types.ts          # Types for captured session format
    types.ts                  # Simulator-specific types
  monitor/
    app.tsx                   # Ink terminal dashboard root component
    entry.tsx                 # Dashboard entrypoint
    components/               # AtBatPanel, Header, StrikeZone, SprayChart, etc.
    formatters/               # Pure formatting functions for display values
    hooks/                    # use-dashboard-state (reducer + socket wiring)
    types.ts                  # Dashboard state types
    theme.ts                  # Colour theme constants
  index.ts                    # Server entrypoint
scripts/
  capture-game.ts             # Capture live game ticks to disk
  analyze/                    # Post-capture analysis scripts
```
