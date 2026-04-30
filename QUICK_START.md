# Quick Deployment Reference

## Local Development

```bash
npm install
cp .env.example .env
# Edit .env: set TEAM=TOR (or TEAM_ID=141)
npm run dev

# Or pass team inline — no .env edit needed:
TEAM=TOR npm run dev

# Dev simulator (no MLB API calls):
DEV_MODE=true npm run dev
```

## Testing

```bash
npm run test:ci       # Single run
npm run test:coverage # With coverage report
```

## Docker

### Build locally

```bash
docker build -t bball:latest .
docker run -p 4000:4000 -e TEAM=TOR bball:latest
```

### Using Docker Compose

```bash
docker-compose up          # Run in foreground
docker-compose up -d       # Background
docker-compose logs -f     # View logs
docker-compose down        # Stop
```

## Health Check

```bash
curl http://localhost:4000/health
# Response: { "status": "ok" }
```

## Socket.IO Events

**Connect and listen for updates:**

```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:4000');

// Full game snapshot — emitted every ~10s during active play
socket.on('game-update', (update) => {
  console.log(update);
  // {
  //   trackingMode: "live",          // 'live' | 'between-innings' | 'final'
  //   gamePk: 745456,
  //   trackedTeamAbbr: "TOR",
  //   teams: { away: { abbrev, name, score }, home: { abbrev, name, score } },
  //   inning: { number: 5, ordinal: "5th", half: "Top" },
  //   outs: 1,
  //   isExtraInnings: false,
  //   outsRemaining: 2,              // null when tracked team is batting
  //   runsNeeded: null,              // non-null in extras when tied/losing
  //   currentPitcher: {
  //     id: 543037,
  //     fullName: "Gerrit Cole",
  //     pitchesThrown: 87,
  //     strikes: 57,
  //     balls: 30,
  //     usage: [{ typeCode: "FF", typeName: "4-Seam Fastball", count: 45, pct: 52 }]
  //   },
  //   atBat: {
  //     batter: { id: 592450, fullName: "Aaron Judge", battingOrder: 3 },
  //     pitcher: { id: 543037, fullName: "Gerrit Cole" },
  //     batSide: "R",
  //     pitchHand: "R",
  //     onDeck: { id: 641933, fullName: "Anthony Rizzo" },
  //     inHole: { id: 668804, fullName: "Gleyber Torres" },
  //     first: null, second: { id: 592450, fullName: "..." }, third: null,
  //     count: { balls: 1, strikes: 2 },
  //     pitchSequence: [
  //       {
  //         pitchNumber: 1, pitchType: "4-Seam Fastball", pitchTypeCode: "FF",
  //         call: "Called Strike", isBall: false, isStrike: true, isInPlay: false,
  //         speedMph: 97.4, countAfter: { balls: 0, strikes: 1 },
  //         tracking: { startSpeed: 97.4, endSpeed: 89.2, zone: 5, ... },
  //         hitData: null
  //       }
  //     ]
  //   },
  //   pitchHistory: [ /* all pitches thrown by currentPitcher this game */ ],
  //   venueFieldInfo: { venueId: 3313, leftLine: 318, center: 408, rightLine: 314, ... }
  // }
});

// Batch of completed-play events — emitted when enrichment detects new plays
socket.on('game-events', (payload) => {
  console.log(payload);
  // {
  //   gamePk: 745456,
  //   events: [
  //     {
  //       category: "plate-appearance-completed",
  //       atBatIndex: 42,
  //       eventType: "Home Run",
  //       description: "Judge homers (28) on a fly ball to left field.",
  //       isScoringPlay: true, rbi: 2,
  //       batter: { id: 592450, fullName: "Aaron Judge" },
  //       pitcher: { id: 543037, fullName: "Gerrit Cole" },
  //       pitchSequence: [ /* full at-bat pitch sequence with Statcast */ ]
  //     }
  //   ]
  // }
});

// Final game summary — emitted once when trackingMode transitions to 'final'
socket.on('game-summary', (summary) => {
  console.log(summary);
  // {
  //   gamePk: 745456,
  //   finalScore: { away: 4, home: 7 },
  //   winningPitcher: { id: 543037, fullName: "Gerrit Cole" },
  //   losingPitcher: { id: 592662, fullName: "Chris Sale" },
  //   savePitcher: null,
  //   nextGame: { gameDate: "2026-04-24T23:07:00Z", opponent: "BOS", isHome: true }
  // }
});
```

## Troubleshooting

### Port already in use

```bash
PORT=5000 npm start

# Or kill process on port 4000
lsof -ti:4000 | xargs kill -9
```

### Team not found

```bash
# List all valid abbreviations
TEAM=INVALID npm run dev
# Server prints the full list and exits

# Or look up numeric IDs
curl "https://statsapi.mlb.com/api/v1/teams?sportId=1" | jq '.teams[] | {id, abbreviation, teamName}'
```

### Connection refused

- Ensure server is running: `curl http://localhost:4000/health`
- Check `CORS_ORIGIN` in `.env` matches your client origin
