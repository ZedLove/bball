# Frontend Plan: MLB Gameday Ping UI

## Overview

A lightweight React SPA that connects to the backend via Socket.IO and displays real-time game state for a configured MLB team. The primary display shows **outs remaining** when the team is defending, switching to **runs needed** during extra innings when the team is batting and tied or trailing.

---

## Decisions Already Made

- **Framework:** Vite + React 19 + TypeScript (no SSR needed — this is a real-time dashboard)
- **Styling:** Tailwind CSS
- **State management:** React context or zustand (small state surface — no Redux)
- **Transport:** socket.io-client, connecting to the backend's Socket.IO server
- **Testing:** Vitest + React Testing Library
- **Hosting:** GitHub Pages (static SPA, `vite build` → `dist/`)
- **Repo:** Separate repo (`bball-ui`), independent of the backend

---

## Backend Contract

The backend emits a single Socket.IO event: `game-update`. When no game is active or the team is batting in regulation, no events are emitted.

### `game-update` payload

```typescript
interface GameUpdate {
  gameStatus: string;                    // "In Progress"
  teams: {
    away: TeamInfo;
    home: TeamInfo;
  };
  score: {
    away: number;
    home: number;
  };
  inning: {
    number: number;
    half: "Top" | "Bottom";
    ordinal: string;                     // "5th", "10th", etc.
  };
  outs: number;                          // 0–2 (current outs this half-inning)
  defendingTeam: string;                 // Abbreviation, e.g. "TOR"
  isExtraInnings: boolean;
  scheduledInnings: number;              // Usually 9
  trackingMode: "outs" | "runs";
  outsRemaining: number | null;          // 3 − outs when defending; null when tracking runs
  runsNeeded: number | null;             // Runs to take the lead in extras; null when tracking outs
}

interface TeamInfo {
  id: number;
  name: string;
  abbreviation: string;
}
```

### Tracking modes

| Mode | When | Frontend shows |
|------|------|---------------|
| `outs` | Team is defending (any inning) | Outs remaining (3 − outs) as visual dots/circles |
| `runs` | Team is batting in extras, tied or losing | Runs needed to take the lead |

When no `game-update` events arrive (no game active, team batting in regulation), the frontend shows an idle state.

---

## Environment

A single env var configures the backend connection:

```
VITE_SOCKET_URL=http://localhost:4000
```

In production (GitHub Pages), this points to the deployed backend URL.

---

## Component Architecture

```
App
├── ConnectionStatus          # Socket.IO connection indicator (dot/badge)
├── GameView                  # Shown when game state exists
│   ├── Scoreboard            # Teams, score, inning display
│   ├── OutsDisplay           # Visual outs remaining (trackingMode === 'outs')
│   └── RunsNeeded            # Runs needed display (trackingMode === 'runs')
└── IdleView                  # "No active game" message
```

### Component details

**`App`**
- Establishes Socket.IO connection on mount, cleans up on unmount
- Stores latest `GameUpdate | null` in state
- Renders `GameView` when state exists, `IdleView` when null
- Clears state after a configurable timeout with no updates (e.g. 5 min) to handle missed game-final transitions

**`ConnectionStatus`**
- Shows connected/disconnected/reconnecting state
- Listens to socket `connect`, `disconnect`, `reconnect_attempt` events

**`Scoreboard`**
- Displays: `NYM 2 — TOR 3 | Top 5th`
- Highlights the defending team
- Shows `[EXTRAS]` badge when `isExtraInnings`

**`OutsDisplay`**
- Three circles — filled for outs recorded, empty for outs remaining
- Example: 1 out → `● ○ ○` (1 recorded, 2 remaining)
- Large, visually prominent — this is the primary display

**`RunsNeeded`**
- Shown instead of `OutsDisplay` when `trackingMode === 'runs'`
- Displays: "Need 2 runs to take the lead"
- Large number with supporting text

**`IdleView`**
- Simple message: "No active game" or "Waiting for game to start"
- Could later show next game time if that data becomes available

---

## State Management

Minimal — a single context provider or zustand store:

```typescript
interface GameState {
  update: GameUpdate | null;
  connectionStatus: 'connected' | 'disconnected' | 'reconnecting';
}
```

The socket listener sets `update` on each `game-update` event. A timeout clears it to null after inactivity.

---

## Project Setup

### Scaffold commands

```bash
npm create vite@latest bball-ui -- --template react-ts
cd bball-ui
npm install socket.io-client
npm install -D tailwindcss @tailwindcss/vite
```

### Vite config

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/bball-ui/',  // GitHub Pages path
});
```

### Directory structure

```
src/
  main.tsx                # Entry point
  App.tsx                 # Root component, socket connection
  types.ts                # GameUpdate, TeamInfo (copied from backend contract)
  hooks/
    useSocket.ts          # Socket.IO connection hook
  components/
    ConnectionStatus.tsx
    GameView.tsx
    Scoreboard.tsx
    OutsDisplay.tsx
    RunsNeeded.tsx
    IdleView.tsx
```

---

## Implementation Phases

### Phase 1: Scaffold & Prove Connection
1. Scaffold Vite + React + TypeScript project
2. Install socket.io-client, Tailwind
3. Create `useSocket` hook — connects to `VITE_SOCKET_URL`, returns `{ update, connectionStatus }`
4. Render raw `game-update` JSON in `App` to prove the connection works
5. Add `ConnectionStatus` component

### Phase 2: Core Game Display
6. Build `Scoreboard` component (teams, score, inning, extras badge)
7. Build `OutsDisplay` component (3 circles with fill state)
8. Build `IdleView` component
9. Wire `App` to switch between `GameView` and `IdleView`
10. Basic responsive layout (mobile-first, centered content)

### Phase 3: Extra Innings & Runs Mode
11. Build `RunsNeeded` component
12. `GameView` switches between `OutsDisplay` and `RunsNeeded` based on `trackingMode`
13. Visual distinction for extras (badge, color change, etc.)

### Phase 4: Polish & Deploy
14. Inactivity timeout to clear stale game state
15. Reconnection handling (socket.io-client auto-reconnects, but UI should reflect it)
16. Accessibility — ARIA labels for outs display, semantic HTML
17. GitHub Actions workflow: build + deploy to GitHub Pages on push to main
18. Mobile layout refinement

---

## Testing Strategy

- **Components:** React Testing Library — render with mock props, assert DOM output
- **`useSocket` hook:** Mock `socket.io-client`, emit fake events, assert state changes
- **Integration:** Render `App` with a mock socket, emit a `game-update`, assert `GameView` renders correctly
- **No E2E initially** — manual testing against the running backend is sufficient for a single-page app

---

## GitHub Pages Deployment

```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - uses: actions/deploy-pages@v4
```

---

## Future Considerations (not in scope now)
- **Shared types package:** Extract `GameUpdate`/`TeamInfo` into `@bball/types` if maintaining two copies becomes painful
- **Game-final event:** Backend could emit a `game-final` event for a cleaner idle transition
- **Next game countdown:** Show time until next game in `IdleView` (requires schedule data from backend)
- **Team theming:** Colors/logos based on team abbreviation
- **Batting updates:** Extend to show at-bat context when the team is hitting (future backend feature)
