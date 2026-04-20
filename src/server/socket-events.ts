import type { EventCategory } from '../scheduler/known-event-types.ts';

/** Socket.IO event name constants shared by the scheduler and dev simulator. */
export const SOCKET_EVENTS = {
  GAME_UPDATE: 'game-update',
  GAME_EVENTS: 'game-events',
  GAME_SUMMARY: 'game-summary',
} as const;

export type SocketEventName =
  (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

// ---------------------------------------------------------------------------
// Shared base fields present on every game event
// ---------------------------------------------------------------------------

interface GameEventBase {
  gamePk: number;
  /**
   * Primary ordering and deduplication key for plate-appearance and
   * in-at-bat substitution events.  Stable integer once `isComplete: true`.
   * Sourced from `allPlays[].about.atBatIndex`.
   */
  atBatIndex: number;
  inning: number;
  /** Lowercase — matches the `halfInning` field in the MLB live feed. */
  halfInning: 'top' | 'bottom';
  battingTeam: string;
  defendingTeam: string;
  /** Raw MLB event type string passed through to clients unchanged. */
  eventType: string;
  /** Human-readable description from the API. */
  description: string;
  category: EventCategory;
}

// ---------------------------------------------------------------------------
// Plate-appearance-completed events
// ---------------------------------------------------------------------------

/**
 * One pitch within a completed at-bat, in chronological order.
 * Sourced from `allPlays[].playEvents[]` where `type === "pitch"`.
 */
export interface PitchEvent {
  /** Sequential pitch number within the at-bat. */
  pitchNumber: number;
  /** Pitch classification from Statcast (e.g. "Four-Seam Fastball", "Curveball"). */
  pitchType: string;
  /** Call result (e.g. "Called Strike", "Ball", "Foul", "In play, run(s)"). */
  call: string;
  isBall: boolean;
  isStrike: boolean;
  /** true on the final pitch of the at-bat when put in play. */
  isInPlay: boolean;
  /** Pitch velocity in mph. null when Statcast tracking data is unavailable. */
  speedMph: number | null;
  /** Ball/strike count after this pitch is resolved. */
  countAfter: { balls: number; strikes: number };
}

/**
 * Emitted for every completed at-bat (`allPlays[].about.isComplete === true`).
 * Scoring plays are a subset of this category — identified by `isScoringPlay: true`.
 * There is no separate scoring-play event type; clients filter by the boolean flag.
 */
export interface PlateAppearanceCompletedEvent extends GameEventBase {
  category: 'plate-appearance-completed';
  /** true when `allPlays[].about.isScoringPlay === true`. */
  isScoringPlay: boolean;
  /** RBI credited on this play. */
  rbi: number;
  batter: { id: number; fullName: string };
  pitcher: { id: number; fullName: string };
  /**
   * Full pitch sequence for this at-bat, in chronological order.
   * Empty array for `intent_walk`, which uses automatic no_pitch events with no velocity data.
   */
  pitchSequence: PitchEvent[];
}

// ---------------------------------------------------------------------------
// Substitution events
// ---------------------------------------------------------------------------

interface SubstitutionEventBase extends GameEventBase {
  /** The incoming player. */
  player: { id: number; fullName: string };
}

/** Sourced from `playEvents[].details.eventType === 'pitching_substitution'`. */
export interface PitchingSubstitutionEvent extends SubstitutionEventBase {
  category: 'pitching-substitution';
}

/** Sourced from `playEvents[].details.eventType === 'offensive_substitution'`. */
export interface OffensiveSubstitutionEvent extends SubstitutionEventBase {
  category: 'offensive-substitution';
}

/**
 * Sourced from `playEvents[].details.eventType === 'defensive_substitution'`
 * or `'defensive_switch'`.  Both are normalised to this category.
 */
export interface DefensiveSubstitutionEvent extends SubstitutionEventBase {
  category: 'defensive-substitution';
}

// ---------------------------------------------------------------------------
// GameEvent discriminated union
// ---------------------------------------------------------------------------

export type GameEvent =
  | PlateAppearanceCompletedEvent
  | PitchingSubstitutionEvent
  | OffensiveSubstitutionEvent
  | DefensiveSubstitutionEvent;

// ---------------------------------------------------------------------------
// game-events Socket.IO event payload
// ---------------------------------------------------------------------------

/**
 * Payload emitted on the `game-events` Socket.IO event.
 * Only emitted when `events` is non-empty.
 * One batch is emitted per poll window.
 */
export interface GameEventsPayload {
  gamePk: number;
  events: GameEvent[];
}

// ---------------------------------------------------------------------------
// game-summary Socket.IO event payload
// ---------------------------------------------------------------------------

export interface GameDecisions {
  winner: { id: number; fullName: string };
  loser: { id: number; fullName: string };
  /** null when no save was recorded. */
  save: { id: number; fullName: string } | null;
}

/** One entry from `boxscore.topPerformers[]`, API-curated (typically 2–3 per game). */
export interface TopPerformer {
  player: { id: number; fullName: string };
  /** `stats.batting.summary` or `stats.pitching.summary` as returned by the API. */
  summary: string;
}

export interface NextGame {  gamePk: number;
  opponent: { id: number; name: string; abbreviation: string };
  /** ISO 8601 UTC game time. */
  gameTime: string;
  venue: string;
  probablePitchers: {
    home: { id: number; fullName: string } | null;
    away: { id: number; fullName: string } | null;
  };
}

/**
 * Emitted once on the `game-summary` Socket.IO event when `trackingMode`
 * reaches `final` and all enrichment data has been gathered.
 */
export interface GameSummary {
  gamePk: number;
  finalScore: { away: number; home: number };
  /** Total innings played — 9 for regulation, higher for extra-innings games. */
  innings: number;
  isExtraInnings: boolean;
  /** Sourced from `liveData.decisions` in the final diffPatch response. */
  decisions: GameDecisions;
  /**
   * Sourced from `/api/v1/game/{gamePk}/boxscore`.
   * Empty array if the boxscore fetch fails.
   */
  topPerformers: TopPerformer[];
  /** `https://www.mlb.com/gameday/{gamePk}/final/box-score` */
  boxscoreUrl: string;
  /**
   * Next scheduled game for the tracked team.
   * null if the fetch fails or no upcoming game is found.
   */
  nextGame: NextGame | null;
}

// ---------------------------------------------------------------------------
// AtBatState — live plate appearance snapshot attached to game-update
// ---------------------------------------------------------------------------

/**
 * Snapshot of the current plate appearance, attached to every `game-update`
 * emission while a plate appearance is in progress.
 *
 * null when:
 * - trackingMode is 'between-innings' or 'final'
 * - No active gamePk
 * - currentPlay is absent or already complete (isComplete: true)
 * - The feed/live fetch failed
 */
export interface AtBatState {
  batter: { id: number; fullName: string; battingOrder: number };
  pitcher: { id: number; fullName: string };
  /** Batter's hitting stance. */
  batSide: 'L' | 'R' | 'S';
  /** Pitcher's throwing hand. */
  pitchHand: 'L' | 'R';
  onDeck: { id: number; fullName: string } | null;
  inHole: { id: number; fullName: string } | null;
  /** Runner on first base. null when unoccupied. */
  first: { id: number; fullName: string } | null;
  /** Runner on second base. null when unoccupied. */
  second: { id: number; fullName: string } | null;
  /** Runner on third base. null when unoccupied. */
  third: { id: number; fullName: string } | null;
  /** Live ball/strike count for this plate appearance. */
  count: { balls: number; strikes: number };
  /**
   * Partial pitch sequence for the current in-progress at-bat, in
   * chronological order. Empty at the start of a new at-bat. Grows as
   * pitches are thrown. Reuses the same PitchEvent type as
   * PlateAppearanceCompletedEvent.pitchSequence.
   */
  pitchSequence: PitchEvent[];
}
