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
    battingTeam,
    trackingMode,
    outsRemaining,
    totalOutsRemaining,
    runsNeeded,
    isExtraInnings,
    isDelayed,
    delayDescription,
    currentPitcher,
    pitchingChange,
    inningBreakLength,
  } = update;

  const scoreStr = `${teams.away.abbreviation} ${score.away} – ${teams.home.abbreviation} ${score.home}`;
  const inningStr = `${inning.half} ${inning.ordinal}${isExtraInnings ? ' [EXTRAS]' : ''}`;
  const totalStr = totalOutsRemaining !== null ? ` - ${totalOutsRemaining} outs remaining` : '';
  const delayStr = isDelayed ? ` ⚠️  ${delayDescription ?? 'Delayed'}` : '';

  console.log(`⚾ ${scoreStr} | ${inningStr}${totalStr}${delayStr}`);

  if (trackingMode === 'outs') {
    const pitcherStr = currentPitcher ? ` | P: ${currentPitcher.fullName}` : '';
    const changeStr = pitchingChange ? ' 🔄 PITCHING CHANGE' : '';
    console.log(
      `   🛡️  ${defendingTeam} defending | Outs: ${outs} (${outsRemaining} remaining)${pitcherStr}${changeStr}\n`
    );
  } else if (trackingMode === 'runs') {
    console.log(
      `   🏃 ${battingTeam} batting (extras) | Need ${runsNeeded} run${runsNeeded !== 1 ? 's' : ''} to take the lead\n`
    );
  } else if (trackingMode === 'between-innings') {
    const breakStr = inningBreakLength != null ? ` (${inningBreakLength}s break)` : '';
    console.log(`   ⏸️  Between innings${breakStr}\n`);
  } else {
    console.log(`   🏏 ${battingTeam} batting\n`);
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
