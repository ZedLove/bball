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

/** Physical coordinates of the pitch trajectory (Statcast). */
export interface PitchCoordinates {
  /** Horizontal plate location: feet from center. Negative = pitcher's arm side (catcher's left). */
  pX: number;
  /** Vertical plate location: feet above ground. */
  pZ: number;
  /** Legacy PITCHf/x pixel X coordinate. */
  x: number;
  /** Legacy PITCHf/x pixel Y coordinate. */
  y: number;
  /** Initial position X (feet from center) at 50ft from home plate. */
  x0: number;
  /** Initial position Y (feet from home plate). */
  y0: number;
  /** Initial position Z (feet above ground). */
  z0: number;
  /** Initial velocity X at release (ft/s). */
  vX0: number;
  /** Initial velocity Y at release (ft/s). Negative = toward home plate. */
  vY0: number;
  /** Initial velocity Z at release (ft/s). */
  vZ0: number;
  /** Lateral acceleration (ft/s²). */
  aX: number;
  /** Longitudinal acceleration / drag (ft/s²). */
  aY: number;
  /** Vertical acceleration (ft/s²). Combines gravity and Magnus lift. */
  aZ: number;
  /** Horizontal movement due to spin (inches, Pfx system). */
  pfxX: number;
  /** Vertical movement due to spin (inches, Pfx system). */
  pfxZ: number;
}

/** Spin and break metrics (Statcast). */
export interface PitchBreaks {
  /** Spin rate in RPM. */
  spinRate: number;
  /** Spin axis direction in degrees (0–360). */
  spinDirection: number;
  /** Break angle in degrees (0–360). */
  breakAngle: number;
  /** Total vertical break in inches vs a gravity-only trajectory. */
  breakVertical: number;
  /** Induced vertical break in inches (spin contribution only). */
  breakVerticalInduced: number;
  /** Horizontal break in inches. */
  breakHorizontal: number;
}

/** Full Statcast tracking data for a single pitch. */
export interface PitchTrackingData {
  /** Pitch velocity at release in mph. */
  startSpeed: number;
  /** Pitch velocity at plate crossing in mph. */
  endSpeed: number;
  /** Strike zone top in feet above ground (batter-specific, per-game). */
  strikeZoneTop: number;
  /** Strike zone bottom in feet above ground (batter-specific, per-game). */
  strikeZoneBottom: number;
  /** Strike zone width in inches (nominally 17). */
  strikeZoneWidth: number;
  /** Strike zone depth in inches. */
  strikeZoneDepth: number;
  /** Time from release to plate crossing in seconds. */
  plateTime: number;
  /** Pitcher's extension in feet. */
  extension: number;
  /**
   * Statcast zone identifier (1–9 = in zone, 11–14 = outside zone).
   * See: https://baseballsavant.mlb.com/leaderboard/zone for zone diagram.
   */
  zone: number;
  coordinates: PitchCoordinates;
  breaks: PitchBreaks;
}

/** Statcast batted-ball data. Present only on in-play pitches. */
export interface BattedBallData {
  /** Exit velocity in mph. */
  launchSpeed: number | null;
  /** Launch angle in degrees. Negative = ground ball; positive = fly ball. */
  launchAngle: number | null;
  /** Projected total distance in feet. */
  totalDistance: number | null;
  /** Ball flight path: "ground_ball" | "fly_ball" | "line_drive" | "popup". */
  trajectory: string | null;
  /** Contact quality: "soft" | "medium" | "hard". */
  hardness: string | null;
  /** Fielder position code where the ball was fielded (1–9 and extensions). */
  location: string | null;
  /** Spray chart coordinates in pixels. */
  coordinates: { coordX: number; coordY: number } | null;
}

/**
 * One pitch within a completed at-bat, in chronological order.
 * Sourced from `allPlays[].playEvents[]` where `type === "pitch"`.
 */
export interface PitchEvent {
  /** Sequential pitch number within the at-bat. */
  pitchNumber: number;
  /** Pitch classification from Statcast (e.g. "Four-Seam Fastball", "Curveball"). */
  pitchType: string;
  /**
   * Statcast pitch type code (e.g. "FF" = 4-seam fastball, "SI" = sinker,
   * "SL" = slider, "CH" = changeup, "ST" = sweeper, "KC" = knuckle curve).
   * null when type classification is unavailable.
   */
  pitchTypeCode: string | null;
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
  /**
   * Full Statcast tracking data for this pitch.
   * null when Statcast tracking is unavailable (outage, spring training, etc.).
   * When present, all sub-fields within PitchTrackingData are always populated.
   */
  tracking: PitchTrackingData | null;
  /**
   * Batted-ball data (exit velocity, launch angle, distance, etc.).
   * null unless isInPlay === true.
   * Individual fields within BattedBallData may be null when Statcast tracking
   * data is incomplete for the specific batted event.
   */
  hitData: BattedBallData | null;
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

export interface NextGame {
  gamePk: number;
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
