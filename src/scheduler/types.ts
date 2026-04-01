/** Enriched game update emitted via Socket.IO and logged for observability. */
export interface GameUpdate {
  gameStatus: string;
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
    half: "Top" | "Bottom";
    ordinal: string;
  };
  outs: number;
  /** Abbreviation of the team currently on defense */
  defendingTeam: string;
}

export interface TeamInfo {
  id: number;
  name: string;
  abbreviation: string;
}

/**
 * Minimal shape of the MLB schedule API response with `hydrate=linescore,team`.
 * Only the fields we actually read are typed; the rest stays unknown.
 */
export interface ScheduleResponse {
  dates: ScheduleDate[];
}

export interface ScheduleDate {
  date: string;
  games: ScheduleGame[];
}

export interface ScheduleGame {
  gamePk: number;
  status: {
    detailedState: string;
    abstractGameState: string;
  };
  teams: {
    away: ScheduleTeamEntry;
    home: ScheduleTeamEntry;
  };
  linescore?: Linescore;
}

export interface ScheduleTeamEntry {
  team: {
    id: number;
    name: string;
    abbreviation: string;
  };
  score: number;
  leagueRecord: {
    wins: number;
    losses: number;
  };
}

export interface Linescore {
  currentInning: number;
  currentInningOrdinal: string;
  inningState: "Top" | "Bottom";
  scheduledInnings: number;
  outs: number;
  balls: number;
  strikes: number;
  teams: {
    home: { runs: number; hits: number; errors: number };
    away: { runs: number; hits: number; errors: number };
  };
}
