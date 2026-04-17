import type { Server as SocketIOServer } from 'socket.io';
import type { GameUpdate } from '../../scheduler/parser.ts';
import type { StateStore } from '../state/store.ts';
import type {
  HandlerResult,
  PitchingChangeOptions,
  PlateAppearanceOptions,
  ScoreOptions,
  SubstitutionOptions,
  DelayOptions,
  SetInningOptions,
  SetScoreOptions,
} from '../types.ts';
import { toOrdinal } from '../types.ts';
import { validateTransition } from '../state/validator.ts';
import { buildPayload } from './payload-factory.ts';
import { SOCKET_EVENTS } from '../../server/socket-events.ts';
import type {
  GameEventsPayload,
  PlateAppearanceCompletedEvent,
  PitchingSubstitutionEvent,
  OffensiveSubstitutionEvent,
  DefensiveSubstitutionEvent,
  GameSummary,
} from '../../server/socket-events.ts';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
function emitUpdate(
  io: SocketIOServer,
  store: StateStore,
  trackingMode: GameUpdate['trackingMode'],
  overrides?: Partial<GameUpdate>,
): void {
  const payload = buildPayload(store.getState(), trackingMode, overrides);
  io.emit(SOCKET_EVENTS.GAME_UPDATE, payload);
  store.setLastEmitted(payload);
}

function emitGameEvents(io: SocketIOServer, payload: GameEventsPayload): void {
  io.emit(SOCKET_EVENTS.GAME_EVENTS, payload);
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

  const subEvent: PitchingSubstitutionEvent = {
    gamePk: state.gamePk,
    atBatIndex: 0,
    inning: state.inning.number,
    halfInning: state.inning.half === 'Top' ? 'top' : 'bottom',
    battingTeam:
      state.inning.half === 'Top' ? state.teams.away.abbreviation : state.teams.home.abbreviation,
    defendingTeam:
      state.inning.half === 'Top' ? state.teams.home.abbreviation : state.teams.away.abbreviation,
    eventType: 'pitching_substitution',
    description: `Pitching change: ${pitcher.fullName} replaces the previous pitcher.`,
    category: 'pitching-substitution',
    player: pitcher,
  };
  emitGameEvents(io, { gamePk: state.gamePk, events: [subEvent] });

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
// Rich-event commands (Phase 5A)
// ---------------------------------------------------------------------------

/** Default out-type event types for the plate-appearance command. */
const DEFAULT_OUT_TYPES = [
  'strikeout',
  'field_out',
  'flyout',
  'lineout',
  'grounded_into_double_play',
] as const;

/** Default scoring event types for the score command. */
const DEFAULT_SCORING_TYPES = ['single', 'double', 'home_run', 'walk', 'sac_fly'] as const;

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function handlePlateAppearance(
  store: StateStore,
  io: SocketIOServer,
  options: PlateAppearanceOptions,
): HandlerResult {
  const state = store.getState();
  const error = validateTransition('out', state); // requires game active, not final
  if (error) return fail(error);

  const eventType = options.type ?? pick(DEFAULT_OUT_TYPES);
  const batter = { id: randomPitcherId(), fullName: 'Simulated Batter' };
  const pitcher = state.currentPitcher ?? { id: randomPitcherId(), fullName: 'Simulated Pitcher' };

  const paEvent: PlateAppearanceCompletedEvent = {
    gamePk: state.gamePk,
    atBatIndex: randomAtBatIndex(),
    inning: state.inning.number,
    halfInning: state.inning.half === 'Top' ? 'top' : 'bottom',
    battingTeam:
      state.inning.half === 'Top' ? state.teams.away.abbreviation : state.teams.home.abbreviation,
    defendingTeam:
      state.inning.half === 'Top' ? state.teams.home.abbreviation : state.teams.away.abbreviation,
    eventType,
    description: `${batter.fullName} ${humanise(eventType)}.`,
    category: 'plate-appearance-completed',
    isScoringPlay: false,
    rbi: 0,
    batter,
    pitcher,
    pitchSequence: [],
  };

  emitGameEvents(io, { gamePk: state.gamePk, events: [paEvent] });
  return ok(`✓ Plate appearance: ${eventType} | ${state.inning.ordinal} ${state.inning.half}`);
}

export function handleScore(
  store: StateStore,
  io: SocketIOServer,
  options: ScoreOptions,
): HandlerResult {
  const state = store.getState();
  const error = validateTransition('out', state);
  if (error) return fail(error);

  const eventType = options.type ?? pick(DEFAULT_SCORING_TYPES);
  const runs = options.runs ?? 1;
  const batter = { id: randomPitcherId(), fullName: 'Simulated Batter' };
  const pitcher = state.currentPitcher ?? { id: randomPitcherId(), fullName: 'Simulated Pitcher' };

  // Increment the batting team's score.
  const isBattingAway = state.inning.half === 'Top';
  const newScore = {
    away: state.score.away + (isBattingAway ? runs : 0),
    home: state.score.home + (isBattingAway ? 0 : runs),
  };
  store.setState({ score: newScore });
  const isExtras = state.inning.number > state.scheduledInnings;
  emitUpdate(io, store, isExtras ? 'runs' : 'outs');

  const paEvent: PlateAppearanceCompletedEvent = {
    gamePk: state.gamePk,
    atBatIndex: randomAtBatIndex(),
    inning: state.inning.number,
    halfInning: state.inning.half === 'Top' ? 'top' : 'bottom',
    battingTeam: isBattingAway ? state.teams.away.abbreviation : state.teams.home.abbreviation,
    defendingTeam: isBattingAway ? state.teams.home.abbreviation : state.teams.away.abbreviation,
    eventType,
    description: `${batter.fullName} ${humanise(eventType)}. ${runs} run${runs !== 1 ? 's' : ''} score${runs !== 1 ? '' : 's'}.`,
    category: 'plate-appearance-completed',
    isScoringPlay: true,
    rbi: runs,
    batter,
    pitcher,
    pitchSequence: [],
  };

  emitGameEvents(io, { gamePk: state.gamePk, events: [paEvent] });

  const s = store.getState();
  return ok(
    `✓ Score: ${eventType} | +${runs} run${runs !== 1 ? 's' : ''}` +
      ` | ${s.teams.away.abbreviation} ${s.score.away} – ${s.teams.home.abbreviation} ${s.score.home}`,
  );
}

export function handleOffensiveSub(
  store: StateStore,
  io: SocketIOServer,
  options: SubstitutionOptions,
): HandlerResult {
  const state = store.getState();
  const error = validateTransition('out', state);
  if (error) return fail(error);

  const player = {
    id: options.playerId ?? randomPitcherId(),
    fullName: options.playerName ?? 'Simulated Pinch Hitter',
  };

  const subEvent: OffensiveSubstitutionEvent = {
    gamePk: state.gamePk,
    atBatIndex: 0,
    inning: state.inning.number,
    halfInning: state.inning.half === 'Top' ? 'top' : 'bottom',
    battingTeam:
      state.inning.half === 'Top' ? state.teams.away.abbreviation : state.teams.home.abbreviation,
    defendingTeam:
      state.inning.half === 'Top' ? state.teams.home.abbreviation : state.teams.away.abbreviation,
    eventType: 'offensive_substitution',
    description: `Offensive substitution: ${player.fullName} replaces the previous batter.`,
    category: 'offensive-substitution',
    player,
  };

  emitGameEvents(io, { gamePk: state.gamePk, events: [subEvent] });
  return ok(`✓ Offensive sub: ${player.fullName} (#${player.id}) enters | ${state.inning.ordinal} ${state.inning.half}`);
}

export function handleDefensiveSub(
  store: StateStore,
  io: SocketIOServer,
  options: SubstitutionOptions,
): HandlerResult {
  const state = store.getState();
  const error = validateTransition('out', state);
  if (error) return fail(error);

  const player = {
    id: options.playerId ?? randomPitcherId(),
    fullName: options.playerName ?? 'Simulated Defensive Sub',
  };

  const subEvent: DefensiveSubstitutionEvent = {
    gamePk: state.gamePk,
    atBatIndex: 0,
    inning: state.inning.number,
    halfInning: state.inning.half === 'Top' ? 'top' : 'bottom',
    battingTeam:
      state.inning.half === 'Top' ? state.teams.away.abbreviation : state.teams.home.abbreviation,
    defendingTeam:
      state.inning.half === 'Top' ? state.teams.home.abbreviation : state.teams.away.abbreviation,
    eventType: 'defensive_substitution',
    description: `Defensive substitution: ${player.fullName} enters the game.`,
    category: 'defensive-substitution',
    player,
  };

  emitGameEvents(io, { gamePk: state.gamePk, events: [subEvent] });
  return ok(`✓ Defensive sub: ${player.fullName} (#${player.id}) enters | ${state.inning.ordinal} ${state.inning.half}`);
}

export function handleSimGameSummary(
  store: StateStore,
  io: SocketIOServer,
): HandlerResult {
  const state = store.getState();

  const summary: GameSummary = {
    gamePk: state.gamePk,
    finalScore: { away: state.score.away, home: state.score.home },
    innings: state.inning.number,
    isExtraInnings: state.inning.number > state.scheduledInnings,
    decisions: {
      winner: { id: randomPitcherId(), fullName: 'Simulated Winner' },
      loser: { id: randomPitcherId(), fullName: 'Simulated Loser' },
      save: null,
    },
    topPerformers: [
      {
        player: { id: randomPitcherId(), fullName: 'Simulated Top Performer' },
        summary: '2-for-4, 1 HR, 2 RBI',
      },
    ],
    boxscoreUrl: `https://www.mlb.com/gameday/${state.gamePk}/final/box-score`,
    nextGame: {
      gamePk: randomAtBatIndex() + 800000,
      opponent: state.teams.away,
      gameTime: new Date(Date.now() + 86400000).toISOString(),
      venue: 'Simulated Stadium',
      probablePitchers: { home: null, away: null },
    },
  };

  io.emit(SOCKET_EVENTS.GAME_SUMMARY, summary);
  return ok(`✓ Game summary emitted | ${state.teams.away.abbreviation} ${state.score.away} – ${state.teams.home.abbreviation} ${state.score.home}`);
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

function randomAtBatIndex(): number {
  return Math.floor(Math.random() * 50);
}

/** Convert an eventType string like 'grounded_into_double_play' to human readable form. */
function humanise(eventType: string): string {
  return eventType.replace(/_/g, ' ');
}
