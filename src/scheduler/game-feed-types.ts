/**
 * Minimal raw MLB API response types for the live game feed, boxscore,
 * and next-game schedule endpoints.
 *
 * Only the fields consumed by our parsers and clients are typed.
 * Extra fields returned by the API are silently ignored.
 */

// ---------------------------------------------------------------------------
// Live feed / diffPatch endpoint
// ---------------------------------------------------------------------------

export interface GameFeedResponse {
  metaData: {
    /**
     * UTC timestamp of this response, formatted as "YYYYMMDD_HHmmss".
     * Persisted as `EnrichmentState.lastTimestamp` and passed as
     * `startTimecode` on the next diffPatch call.
     */
    timeStamp: string;
  };
  gameData: {
    teams: {
      away: GameFeedTeam;
      home: GameFeedTeam;
    };
    /**
     * Full roster for both teams, keyed as `ID${playerId}` (e.g. "ID660271").
     * Used to resolve a player's `fullName` for substitution events, where
     * the action `playEvent.player` field contains only `{ id }`.
     */
    players: Record<string, GameFeedPlayer>;
  };
  liveData: {
    plays: {
      /**
       * Completed plays since the requested timecode.
       * The MLB diffPatch endpoint may omit or null this on some edge-case
       * delta responses (e.g. very early timecodes or partial payloads).
       * Treat as empty when absent.
       */
      allPlays: AllPlay[] | null;
    };
    /**
     * Present in the final game feed response.
     * Absent for in-progress games (use optional chaining when accessing).
     */
    decisions?: GameFeedDecisions;
  };
}

export interface GameFeedTeam {
  id: number;
  abbreviation: string;
}

export interface GameFeedPlayer {
  id: number;
  fullName: string;
}

export interface AllPlay {
  /** Stable sequential integer assigned by the MLB API once a play is complete. */
  atBatIndex: number;
  result: {
    /** Raw MLB event type string (e.g. "strikeout", "home_run"). */
    eventType: string;
    /** Human-readable description of the play outcome. */
    description: string;
    /** RBI credited on this play. */
    rbi: number;
  };
  about: {
    atBatIndex: number;
    /**
     * "top" for the away-team half-inning, "bottom" for the home-team half-inning.
     * Matches the `halfInning` field in our emitted `GameEvent` payloads.
     */
    halfInning: 'top' | 'bottom';
    inning: number;
    /** true once the at-bat is fully resolved. Only complete plays are processed. */
    isComplete: boolean;
    /** true when at least one run scored on this play. */
    isScoringPlay: boolean;
  };
  matchup: {
    batter: { id: number; fullName: string };
    pitcher: { id: number; fullName: string };
  };
  playEvents: PlayEvent[];
}

export interface PitchDataBreaks {
  breakAngle: number;
  breakVertical: number;
  breakVerticalInduced: number;
  breakHorizontal: number;
  spinRate: number;
  spinDirection: number;
}

export interface PitchDataCoordinates {
  pX: number;
  pZ: number;
  x: number;
  y: number;
  x0: number;
  y0: number;
  z0: number;
  vX0: number;
  vY0: number;
  vZ0: number;
  aX: number;
  aY: number;
  aZ: number;
  pfxX: number;
  pfxZ: number;
}

export interface PitchData {
  startSpeed: number;
  endSpeed: number;
  strikeZoneTop: number;
  strikeZoneBottom: number;
  strikeZoneWidth: number;
  strikeZoneDepth: number;
  plateTime: number;
  extension: number;
  zone: number;
  coordinates: PitchDataCoordinates;
  breaks: PitchDataBreaks;
}

export interface HitData {
  launchSpeed: number | null;
  launchAngle: number | null;
  totalDistance: number | null;
  trajectory: string | null;
  hardness: string | null;
  location: string | null;
  coordinates: { coordX: number; coordY: number } | null;
}

export interface PlayEvent {
  /**
   * "pitch" | "action" | "pickoff" | "no_pitch".
   * We process "pitch" for pitch sequences and "action" for substitutions.
   */
  type: string;
  /**
   * true when this event is a pitched ball (type === "pitch").
   * Matches `type === "pitch"` exactly — either can be used as a filter.
   */
  isPitch?: boolean;
  details: {
    /** Human-readable description of this in-at-bat event. */
    description: string;
    /**
     * Raw MLB event type string for action events (e.g. "pitching_substitution").
     * Absent on pitch and pickoff events.
     */
    eventType?: string;
    // Pitch-specific fields — present when type === "pitch"
    /**
     * Pitch classification from the MLB Statcast system.
     * e.g. { code: "FF", description: "Four-Seam Fastball" }.
     * Absent on action and pickoff events.
     */
    type?: { code: string; description: string };
    /** true when the call was a ball. */
    isBall?: boolean;
    /** true when the call was a strike (including foul balls that do not advance the count). */
    isStrike?: boolean;
    /** true for the final pitch of an at-bat that is put in play. */
    isInPlay?: boolean;
    hasReview?: boolean;
  };
  /** Sequential pitch number within the at-bat. Present when type === "pitch". */
  pitchNumber?: number;
  /** Ball/strike count after this pitch is resolved. Present when type === "pitch" or "no_pitch". */
  count?: { balls: number; strikes: number };
  /** Full Statcast pitch tracking data. Present when type === "pitch" and tracking is available. */
  pitchData?: PitchData;
  /** Batted-ball data. Present when isInPlay === true. */
  hitData?: HitData;
  isSubstitution?: boolean;
  /**
   * Present on action-type events that involve a specific player
   * (e.g. substitutions). Carries only `id`; look up `fullName` via
   * `gameData.players["ID${id}"]`.
   */
  player?: {
    id: number;
  };
}

export interface GameFeedDecisions {
  winner: { id: number; fullName: string };
  loser: { id: number; fullName: string };
  /** Absent when no save was recorded. */
  save?: { id: number; fullName: string };
}

// ---------------------------------------------------------------------------
// Boxscore endpoint  (/api/v1/game/{gamePk}/boxscore)
// ---------------------------------------------------------------------------

export interface BoxscoreResponse {
  topPerformers: BoxscoreTopPerformer[];
}

export interface BoxscoreTopPerformer {
  player: {
    person: { id: number; fullName: string };
    stats: {
      batting?: { summary?: string | null };
      pitching?: { summary?: string | null };
    };
  };
}

// ---------------------------------------------------------------------------
// Next-game schedule endpoint  (/api/v1/schedule?sportId=1&teamId=...&startDate=...)
// ---------------------------------------------------------------------------

export interface NextGameScheduleResponse {
  dates: Array<{
    games: Array<NextGameEntry>;
  }>;
}

export interface NextGameEntry {
  gamePk: number;
  /** ISO 8601 UTC game time (e.g. "2026-04-17T18:20:00Z"). */
  gameDate: string;
  venue: { name: string };
  teams: {
    away: {
      team: { id: number; name: string; abbreviation: string };
      /**
       * May be absent early in the week before the pitching matchup is set.
       * null when explicitly unset by the API; undefined when the hydration
       * parameter was not requested.
       */
      probablePitcher?: { id: number; fullName: string } | null;
    };
    home: {
      team: { id: number; name: string; abbreviation: string };
      probablePitcher?: { id: number; fullName: string } | null;
    };
  };
}

// ---------------------------------------------------------------------------
// Live feed endpoint  (/api/v1.1/game/{gamePk}/feed/live)
// ---------------------------------------------------------------------------

/**
 * Minimal shape of the MLB `/api/v1.1/game/{gamePk}/feed/live` response.
 * Only the fields consumed by `parseCurrentPlay` are typed.
 */
export interface GameFeedLiveResponse {
  liveData: {
    plays: {
      /**
       * All completed plate appearances since game start, in chronological
       * order by atBatIndex. Cumulative — always starts from atBatIndex 0 and
       * grows as plays complete. Reuses the same AllPlay type as the diffPatch
       * feed. Absent before the first play of the game.
       */
      allPlays?: AllPlay[];
      /**
       * The in-progress plate appearance.
       * Absent before the first pitch of the game and between half-innings.
       */
      currentPlay: LiveCurrentPlay | null | undefined;
    };
    /**
     * Live boxscore containing team lineups and per-player stats.
     * May be absent on very early or malformed responses — use optional
     * chaining when accessing.
     */
    boxscore?: LiveBoxscore;
  };
}

export interface LiveCurrentPlay {
  about: {
    atBatIndex: number;
    halfInning: 'top' | 'bottom';
    inning: number;
    /** true once the at-bat is fully resolved. */
    isComplete: boolean;
  };
  /** Live count for the current plate appearance. */
  count: { balls: number; strikes: number; outs: number };
  matchup: {
    batter: { id: number; fullName: string };
    pitcher: { id: number; fullName: string };
    /** Batter stance. 'S' = switch hitter. */
    batSide: { code: 'L' | 'R' | 'S' };
    pitchHand: { code: 'L' | 'R' };
  };
  /**
   * All in-at-bat events so far. Reuses the existing `PlayEvent` type.
   * Filter to `type === 'pitch'` to get the pitch sequence.
   */
  playEvents: PlayEvent[];
}

// ---------------------------------------------------------------------------
// Live boxscore — nested inside feed/live at liveData.boxscore
// ---------------------------------------------------------------------------

/** Today's batting stats for a player (from boxscore stats.batting). */
export interface LiveBoxscoreBattingStats {
  atBats: number;
  hits: number;
  homeRuns: number;
}

/** Season-to-date batting stats for a player (from boxscore seasonStats.batting). */
export interface LiveBoxscoreSeasonStats {
  stolenBases: number;
  /** Season caught stealing. Used together with stolenBases to compute SB%. */
  caughtStealing: number;
  /**
   * Season OPS as a decimal string (e.g. ".752").
   * Empty string when unavailable.
   */
  ops: string;
  /** Season batting average as a decimal string (e.g. ".287"). */
  avg: string;
  homeRuns: number;
  strikeOuts: number;
  baseOnBalls: number;
  plateAppearances: number;
}

/** Today's pitching stats for a player (from boxscore stats.pitching). */
export interface LiveBoxscorePitchingStats {
  gamesPlayed: number;
  gamesStarted: number;
  inningsPitched: string;
  earnedRuns: number;
  strikeOuts: number;
  baseOnBalls: number;
  hits: number;
  pitchesThrown: number;
}

/** Season-to-date pitching stats for a player (from boxscore seasonStats.pitching). */
export interface LiveBoxscoreSeasonPitchingStats {
  era: string;
  inningsPitched: string;
  strikeoutsPer9Inn: string;
  walksPer9Inn: string;
}

/** One player entry inside liveData.boxscore.teams.{side}.players. */
export interface LiveBoxscorePlayer {
  person: { id: number; fullName: string };
  /**
   * Batting order slot encoded as slot×100 (100=1st, …, 900=9th).
   * 0 when the player is not in the batting order (e.g. a pitcher in AL).
   */
  battingOrder: number;
  stats: {
    batting: LiveBoxscoreBattingStats;
    /**
     * Present for pitchers; an empty object `{}` for position players.
     * Access only when you've identified the player as a pitcher via gamesStarted.
     */
    pitching: LiveBoxscorePitchingStats;
  };
  seasonStats: {
    batting: LiveBoxscoreSeasonStats;
    /** Season pitching stats. Empty/zero-valued for position players. */
    pitching: LiveBoxscoreSeasonPitchingStats;
  };
}

/** One team's live boxscore data. */
export interface LiveBoxscoreTeam {
  /**
   * Player IDs in batting slot order (9 entries for a full lineup).
   * Reflects live substitutions — the current occupant of each slot.
   */
  battingOrder: number[];
  /**
   * All players on the roster for this team, keyed as `ID${playerId}`.
   * Includes position players, pitchers, and substitutes.
   */
  players: Record<string, LiveBoxscorePlayer>;
}

/** Live boxscore snapshot embedded in the feed/live response. */
export interface LiveBoxscore {
  teams: {
    home: LiveBoxscoreTeam;
    away: LiveBoxscoreTeam;
  };
}
