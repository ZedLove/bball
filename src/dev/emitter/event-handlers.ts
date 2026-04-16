import type { Server as SocketIOServer } from 'socket.io';
import type { GameUpdate } from '../../scheduler/parser.ts';
import type { StateStore } from '../state/store.ts';
import type {
  HandlerResult,
  PitchingChangeOptions,
  DelayOptions,
  SetInningOptions,
  SetScoreOptions,
} from '../types.ts';
import { toOrdinal } from '../types.ts';
import { validateTransition } from '../state/validator.ts';
import { buildPayload } from './payload-factory.ts';

// ---------------------------------------------------------------------------
// Internal helper – build payload, emit globally, and persist as last state.
// ---------------------------------------------------------------------------
function emitUpdate(
  io: SocketIOServer,
  store: StateStore,
  trackingMode: GameUpdate['trackingMode'],
  overrides?: Partial<GameUpdate>,
): void {
  const payload = buildPayload(store.getState(), trackingMode, overrides);
  io.emit('game-update', payload);
  store.setLastEmitted(payload);
}

// ---------------------------------------------------------------------------
// Game lifecycle events
// ---------------------------------------------------------------------------

export function handleGameStart(store: StateStore, io: SocketIOServer): HandlerResult {
  const state = store.getState();
  const error = validateTransition('game-start', state);
  if (error) return fail(error);

  store.reset();
  store.setState({ gameStarted: true });
  emitUpdate(io, store, 'outs');

  const s = store.getState();
  return ok(
    `✓ Game started | ${s.inning.ordinal} Top | ${s.teams.home.abbreviation} defending | Score 0-0 | 0 outs`,
  );
}

export function handleGameEnd(store: StateStore, io: SocketIOServer): HandlerResult {
  const state = store.getState();
  const error = validateTransition('game-end', state);
  if (error) return fail(error);

  store.setState({ gameEnded: true });
  emitUpdate(io, store, 'final');

  const s = store.getState();
  return ok(
    `✓ Game ended (final) | Score: ${s.teams.away.abbreviation} ${s.score.away}` +
      ` – ${s.teams.home.abbreviation} ${s.score.home}`,
  );
}

// ---------------------------------------------------------------------------
// In-game events
// ---------------------------------------------------------------------------

export function handleOut(store: StateStore, io: SocketIOServer): HandlerResult {
  const state = store.getState();
  const error = validateTransition('out', state);
  if (error) return fail(error);

  const newOuts = state.outs + 1;
  store.setState({ outs: newOuts });

  emitUpdate(io, store, 'outs');

  const sideNote =
    newOuts === 3 ? ' (side retired – use batting-begins to advance to next half)' : '';
  return ok(
    `✓ Out recorded | ${state.inning.ordinal} ${state.inning.half} | ${newOuts} outs${sideNote}`,
  );
}

export function handlePitchingChange(
  store: StateStore,
  io: SocketIOServer,
  options: PitchingChangeOptions,
): HandlerResult {
  const state = store.getState();
  const error = validateTransition('pitching-change', state);
  if (error) return fail(error);

  const pitcher = {
    id: options.pitcherId ?? randomPitcherId(),
    fullName: options.pitcherName ?? 'Unknown Pitcher',
  };
  store.setState({ currentPitcher: pitcher });
  emitUpdate(io, store, 'outs');

  return ok(
    `✓ Pitching change: ${pitcher.fullName} (#${pitcher.id}) enters` +
      ` | ${state.inning.ordinal} ${state.inning.half}`,
  );
}

export function handleBattingBegins(store: StateStore, io: SocketIOServer): HandlerResult {
  const state = store.getState();
  const error = validateTransition('batting-begins', state);
  if (error) return fail(error);

  store.advanceHalf();
  const s = store.getState();

  // In extra innings, emit 'runs' mode so the frontend can test that transition.
  const isExtras = s.inning.number > s.scheduledInnings;
  emitUpdate(io, store, isExtras ? 'runs' : 'batting');

  const battingTeam =
    s.inning.half === 'Top' ? s.teams.away.abbreviation : s.teams.home.abbreviation;
  return ok(`✓ ${s.inning.ordinal} ${s.inning.half} begins | ${battingTeam} batting | 0 outs`);
}

export function handleBattingEnds(store: StateStore, io: SocketIOServer): HandlerResult {
  const state = store.getState();
  const error = validateTransition('batting-ends', state);
  if (error) return fail(error);

  emitUpdate(io, store, 'between-innings');
  return ok(
    `✓ Half-inning ended | Between-innings break | ${state.inning.ordinal} ${state.inning.half}`,
  );
}

export function handleBetweenInnings(store: StateStore, io: SocketIOServer): HandlerResult {
  const state = store.getState();
  const error = validateTransition('between-innings', state);
  if (error) return fail(error);

  emitUpdate(io, store, 'between-innings');
  return ok(`✓ Between-innings emitted | ${state.inning.ordinal} ${state.inning.half}`);
}

export function handleDelay(
  store: StateStore,
  io: SocketIOServer,
  options: DelayOptions,
): HandlerResult {
  const state = store.getState();
  const error = validateTransition('delay', state);
  if (error) return fail(error);

  const desc = options.reason ? `Delayed: ${options.reason}` : 'Game Delayed';
  store.setState({ isDelayed: true, delayDescription: desc });
  emitUpdate(io, store, 'outs');

  return ok(`✓ Game delayed: ${desc} | ${state.inning.ordinal} ${state.inning.half}`);
}

export function handleClearDelay(store: StateStore, io: SocketIOServer): HandlerResult {
  const state = store.getState();
  const error = validateTransition('clear-delay', state);
  if (error) return fail(error);

  store.setState({ isDelayed: false, delayDescription: null });
  emitUpdate(io, store, 'outs');

  return ok(`✓ Delay cleared | Game resumed | ${state.inning.ordinal} ${state.inning.half}`);
}

// ---------------------------------------------------------------------------
// State control commands (no socket emission)
// ---------------------------------------------------------------------------

export function handleSetInning(store: StateStore, options: SetInningOptions): HandlerResult {
  const n = options.inning;
  if (n === undefined || !Number.isInteger(n) || n < 1 || n > 30) {
    return fail('Inning must be a whole number between 1 and 30.');
  }

  const current = store.getState().inning;
  store.setState({ outs: 0, inning: { number: n, half: current.half, ordinal: toOrdinal(n) } });
  return ok(`✓ Inning set to ${toOrdinal(n)} ${current.half} | Outs reset to 0`);
}

export function handleSetScore(store: StateStore, options: SetScoreOptions): HandlerResult {
  const current = store.getState().score;
  const away = options.away ?? current.away;
  const home = options.home ?? current.home;

  if (!Number.isInteger(away) || away < 0 || !Number.isInteger(home) || home < 0) {
    return fail('Scores must be non-negative whole numbers.');
  }

  store.setState({ score: { away, home } });
  const s = store.getState();
  return ok(`✓ Score set: ${s.teams.away.abbreviation} ${away} – ${s.teams.home.abbreviation} ${home}`);
}

export function handleSetTeamBatting(store: StateStore): HandlerResult {
  const state = store.getState();
  const newHalf = state.inning.half === 'Top' ? 'Bottom' : 'Top';
  store.setState({ outs: 0, inning: { ...state.inning, half: newHalf } });

  const s = store.getState();
  const batting =
    s.inning.half === 'Top' ? s.teams.away.abbreviation : s.teams.home.abbreviation;
  return ok(`✓ Batting side swapped | ${batting} now batting | Outs reset to 0`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ok(message: string): HandlerResult {
  return { success: true, message };
}

function fail(reason: string): HandlerResult {
  return { success: false, message: `⚠  ${reason}` };
}

function randomPitcherId(): number {
  return Math.floor(Math.random() * 900_000) + 100_000;
}
