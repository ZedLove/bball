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
     * e.g. { description: "Four-Seam Fastball" }, { description: "Curveball" }.
     * Absent on action and pickoff events.
     */
    type?: { description: string };
    /** true when the call was a ball. */
    isBall?: boolean;
    /** true when the call was a strike (including foul balls that do not advance the count). */
    isStrike?: boolean;
    /** true for the final pitch of an at-bat that is put in play. */
    isInPlay?: boolean;
  };
  /** Sequential pitch number within the at-bat. Present when type === "pitch". */
  pitchNumber?: number;
  /** Ball/strike count after this pitch is resolved. Present when type === "pitch" or "no_pitch". */
  count?: { balls: number; strikes: number };
  /** Pitch tracking data. Present when type === "pitch". */
  pitchData?: {
    /** Pitch velocity in mph from Statcast tracking. null when tracking data is unavailable. */
    startSpeed: number | null;
  };
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
       * The in-progress plate appearance.
       * Absent before the first pitch of the game and between half-innings.
       */
      currentPlay: LiveCurrentPlay | null | undefined;
    };
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
