import type { EventCategory } from '../scheduler/known-event-types.ts';
import type { PitcherGameStats } from '../scheduler/pitcher-stats.ts';
import type { VenueFieldInfo } from '../scheduler/venue-client.ts';
export type {
  PitcherGameStats,
  PitchTypeUsage,
} from '../scheduler/pitcher-stats.ts';
export type { VenueFieldInfo } from '../scheduler/venue-client.ts';

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
 * A base runner on the field, enriched with season stolen-base stats sourced
 * from the live boxscore (`liveData.boxscore`).
 */
export interface RunnerState {
  id: number;
  fullName: string;
  /** Season stolen bases to date. */
  seasonSb: number;
  /**
   * Season caught-stealing attempts (SB + CS). Used to compute SB%.
   * 0 means no attempts — percentage should not be shown.
   */
  seasonSbAttempts: number;
}

/**
 * One slot in the batting order, sourced from the live boxscore.
 * Reflects the current occupant of each slot (including pinch-hitters/runners).
 */
export interface LineupEntry {
  id: number;
  fullName: string;
  /**
   * Batting order slot encoded as slot×100 (100=1st, …, 900=9th).
   * Display slot: `Math.floor(battingOrder / 100)`.
   */
  battingOrder: number;
  /** Today's at-bats in this game (from boxscore stats.batting). */
  atBats: number;
  /** Today's hits in this game (from boxscore stats.batting). */
  hits: number;
  /**
   * Season OPS as a decimal string (e.g. ".752").
   * null when unavailable in the boxscore seasonStats.
   */
  seasonOps: string | null;
}

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
  first: RunnerState | null;
  /** Runner on second base. null when unoccupied. */
  second: RunnerState | null;
  /** Runner on third base. null when unoccupied. */
  third: RunnerState | null;
  /** Live ball/strike count for this plate appearance. */
  count: { balls: number; strikes: number };
  /**
   * Partial pitch sequence for the current in-progress at-bat, in
   * chronological order. Empty at the start of a new at-bat. Grows as
   * pitches are thrown. Reuses the same PitchEvent type as
   * PlateAppearanceCompletedEvent.pitchSequence.
   */
  pitchSequence: PitchEvent[];
  /**
   * Full batting order for the batting team, ordered by batting slot.
   * Nine entries reflecting live substitutions — the current occupant of
   * each slot. Empty array when unavailable (first poll before boxscore
   * resolves).
   */
  lineup: LineupEntry[];
}

// ---------------------------------------------------------------------------
// game-update Socket.IO event payload
// ---------------------------------------------------------------------------

export interface TeamInfo {
  id: number;
  name: string;
  abbreviation: string;
}

/**
 * Payload emitted on the `game-update` Socket.IO event.
 * Emitted every tick during 'live', once on 'between-innings' and 'final' transitions.
 */
export interface GameUpdate {
  gameStatus: string;
  /** MLB game identifier — used by clients to correlate `game-update` with `game-events` batches. */
  gamePk: number;
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
    half: 'Top' | 'Middle' | 'Bottom' | 'End';
    ordinal: string;
  };
  outs: number;
  /** Abbreviation of the team currently on defense (or defending next, during between-innings) */
  defendingTeam: string;
  /** Abbreviation of the team currently batting (or batting next, during between-innings) */
  battingTeam: string;
  /** true when the game is paused due to a rain delay, suspension, or similar */
  isDelayed: boolean;
  /** Human-readable delay reason from the API (e.g. "Delayed: Rain"), null when not delayed */
  delayDescription: string | null;
  /** true when the current inning exceeds scheduledInnings */
  isExtraInnings: boolean;
  /** Number of innings originally scheduled (usually 9) */
  scheduledInnings: number;
  /**
   * 'live'            – game is in active play; emitted every tick.
   *                     Encompasses all active half-innings (offense and defense).
   * 'between-innings' – half-inning just ended; emitted once on transition.
   * 'final'           – game has ended; emitted once, scheduler transitions to idle polling.
   */
  trackingMode: 'live' | 'between-innings' | 'final';
  /** 3 − current outs when defending, null otherwise */
  outsRemaining: number | null;
  /**
   * Total defensive outs remaining for the rest of the game.
   * Accounts for all future half-innings the team will defend.
   * For the away team, excludes the bottom of the final scheduled inning
   * when they are currently losing (home team won't need to bat).
   * null in extra innings and when tracking runs.
   */
  totalOutsRemaining: number | null;
  /** Runs needed for the lead when batting in extras, null otherwise */
  runsNeeded: number | null;
  /**
   * Pitcher currently on the mound during active play.
   * Includes computed stats (populated by the scheduler each tick).
   * null when not defending or during between-innings.
   */
  currentPitcher: (PitcherGameStats & { id: number; fullName: string }) | null;
  /**
   * All pitches thrown by the current pitcher this game, in chronological
   * order. Populated by the scheduler each tick. Empty array until the
   * first enrichment tick resolves.
   */
  pitchHistory: PitchEvent[];
  /**
   * Pitcher scheduled to take the mound for the next half-inning.
   * Sourced from `linescore.defense.pitcher`, which the MLB API rotates to
   * the next defender as soon as a half-inning ends.
   * Only set when trackingMode === 'between-innings', null otherwise.
   */
  upcomingPitcher: { id: number; fullName: string } | null;
  /**
   * Live at-bat snapshot. null during between-innings, final, pre-game,
   * or when the feed/live fetch is unavailable.
   * Populated by the scheduler after the feed/live fetch resolves.
   */
  atBat: AtBatState | null;
  /**
   * Abbreviation of the team being tracked (i.e. the team tied to CONFIG.teamId).
   * Constant for the lifetime of a game session. Used by the monitor to
   * determine celebration polarity (win/loss, HR for us vs opponent).
   */
  trackedTeamAbbr: string;
  /**
   * MLB venue identifier for the current game's ballpark.
   * Used to fetch real fence dimensions for the SprayChart.
   * null when the schedule response does not include venue data.
   */
  venueId: number | null;
  /**
   * Real ballpark fence distances fetched from the MLB venues API.
   * Populated by the scheduler after the venue fetch resolves.
   * null until fetched (or if the fetch fails) — callers treat null as
   * "use fallback constants".
   */
  venueFieldInfo: VenueFieldInfo | null;
}
