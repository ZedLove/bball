# Quick Deployment Reference

## Local Development

```bash
npm install
cp .env.example .env
npm run dev
```

## Testing

```bash
npm test              # Watch mode
npm run test:ci       # Single run
npm run test:coverage # With coverage report
```

## Docker

### Build locally

```bash
docker build -t bball:latest .
docker run -p 4000:4000 -e TEAM_ID=141 bball:latest
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

socket.on('game-update', (update) => {
  console.log(update);
  // {
  //   gameStatus: "In Progress",
  //   teams: { away: {...}, home: {...} },
  //   score: { away: 2, home: 1 },
  //   inning: { number: 5, ordinal: "5th", half: "Top" },
  //   outs: 1,
  //   defendingTeam: "STL"
  // }
});
```

## Dependency Updates

Dependabot checks weekly for updates:

- **Dev dependencies:** Auto-group, review regularly
- **Major versions:** Separate PRs for careful review
- **Security updates:** Always prioritize

See new PRs in "Pull Requests" tab.

## Logs & Monitoring

### Locally

```bash
npm run dev 2>&1 | tee app.log
```

## Troubleshooting

### Port already in use

```bash
# Change port
PORT=5000 npm start

# Or kill process on port 4000
lsof -ti:4000 | xargs kill -9
```

### TEAM_ID not found

```bash
# List all MLB teams
curl https://statsapi.mlb.com/api/v1/teams?sportId=1 | jq '.teams[] | {id, teamName}'
```

### Connection refused

- Ensure server is running: `curl http://localhost:4000/health`
- Check firewall/network settings
- Verify CORS_ORIGIN matches client URL
