# Proof of Concept: MLB Gameday Ping Service

## Overview
We will build a lightweight service that periodically queries the **MLB Gameday API** to monitor a single hard‑coded team (e.g., `NYM` for the New York Mets). The service will:
1. Detect when a game for the target team is **in progress**.
2. While the game is active, fetch the latest game state at a regular interval (e.g., every 30 seconds).
3. Extract the **number of outs** recorded by the defensive side of the target team.
4. Emit a simple update (e.g., log line, HTTP endpoint, or message queue) containing the current outs count.

The POC is intentionally minimal – no persistence, no authentication, and a single hard‑coded team.

---

## High‑Level Architecture
```mermaid
flowchart TD
    A[Scheduler (Timer)] --> B[HTTP Client]
    B --> C[MLB Gameday API]
    C --> D[Response Parser]
    D --> E{Game In Progress?}
    E -- Yes --> F[Extract Outs for Target Team]
    F --> G[Publish Update]
    E -- No --> H[Idle / Wait]
    G --> A
    H --> A
```
* **Scheduler** – a simple loop or cron‑like timer that triggers every N seconds.
* **HTTP Client** – performs a GET request to the MLB Gameday endpoint for the target team’s schedule.
* **Response Parser** – decodes JSON, finds the current game (if any), and determines the defensive team.
* **Publish Update** – for the POC we will just `console.log` the outs count, but the design allows swapping in a REST endpoint, WebSocket, or message queue.

---

## Components Detail
| Component | Responsibility | Technology (suggested) |
|-----------|----------------|------------------------|
| **Scheduler** | Triggers the fetch cycle. | Node.js `setInterval` or Python `schedule` library. |
| **HTTP Client** | Calls `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=<TEAM_ID>` (or similar endpoint). | `axios` (JS) or `requests` (Python). |
| **Response Parser** | Parses JSON, checks `games[i].status.detailedState` for `In Progress`. Determines which side is on defense via `games[i].teams.away` / `home` and `games[i].inningState`. | Plain JS/Python logic. |
| **Update Publisher** | Emits the outs count. | `console.log` for now; can be replaced with an HTTP POST or Pub/Sub. |

---

## Data Flow
1. **Scheduler** fires → 2. **HTTP Client** requests the schedule for the target team.  
3. **Response Parser** scans the returned games list:
   * If a game’s `status.detailedState` equals `In Progress`, locate the defensive team (the team **not** batting).
   * Read `games[i].innings[...].half` and `games[i].outs` (or similar field) to get the current outs.
4. **Publish Update** logs: `"[Team] outs: X"`.
5. Loop repeats.

---

## Error Handling & Edge Cases
* **No game today / no game in progress** – Scheduler simply waits for the next interval.
* **Network failures** – Log the error and retry on the next tick.
* **API rate limits** – Use a modest interval (30 s) and include exponential back‑off on repeated failures.

---

## Implementation Steps (Todo List)
1. Choose language/runtime (Node.js or Python).  
2. Scaffold project directory (`src/`, `package.json` or `requirements.txt`).  
3. Implement Scheduler with configurable interval.  
4. Add HTTP client wrapper for MLB API.  
5. Write parser to detect in‑progress game and extract outs for the target team.  
6. Implement simple logger as the update publisher.  
7. Add basic configuration file (`config.json`) with `teamId` and `pollInterval`.  
8. Write README with run instructions.  
9. (Optional) Containerize with Docker for easy execution.

---

## Next Steps
* Review the plan and confirm the chosen language/runtime.
* Once approved, we can move to **code** mode to create the project skeleton and implement the service.
