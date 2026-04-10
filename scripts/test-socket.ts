/**
 * Socket.IO client for testing game-update events during development.
 * Usage: npm run test:socket
 * 
 * Connect to the backend's Socket.IO server and log all game-update events
 * in a formatted, readable way. Useful for testing during actual MLB games.
 */

import { io } from 'socket.io-client';

const SOCKET_URL = process.env.SOCKET_URL || 'http://localhost:4000';

console.log(`\n🔌  Connecting to ${SOCKET_URL}…\n`);

const socket = io(SOCKET_URL, {
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  transports: ['websocket'],
});

socket.on('connect', () => {
  console.log('✅  Connected to backend\n');
});

socket.on('disconnect', () => {
  console.log('\n❌  Disconnected from backend\n');
});

socket.on('game-update', (update) => {
  const {
    teams,
    score,
    inning,
    outs,
    defendingTeam,
    trackingMode,
    outsRemaining,
    runsNeeded,
    isExtraInnings,
  } = update;

  const scoreStr = `${teams.away.abbreviation} ${score.away} – ${teams.home.abbreviation} ${score.home}`;
  const inningStr = `${inning.half} ${inning.ordinal}${isExtraInnings ? ' [EXTRAS]' : ''}`;

  console.log(`⚾ ${scoreStr} | ${inningStr}`);

  if (trackingMode === 'outs') {
    console.log(
      `   🛡️  ${defendingTeam} defending | Outs: ${outs} (${outsRemaining} remaining)\n`
    );
  } else {
    console.log(
      `   🏃 Batting | Need ${runsNeeded} run${runsNeeded !== 1 ? 's' : ''} to take the lead\n`
    );
  }
});

socket.on('error', (err) => {
  console.error('❌  Socket error:', err);
});

process.on('SIGINT', () => {
  console.log('\n\n👋  Closing…\n');
  socket.close();
  process.exit(0);
});
