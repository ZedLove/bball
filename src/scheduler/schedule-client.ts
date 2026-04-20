import axios from 'axios';
import { CONFIG } from '../config/env.ts';

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
  /** ISO 8601 UTC game start time (e.g. "2026-04-15T22:10:00Z"). */
  gameDate: string;
  status: {
    detailedState: string;
    abstractGameState: string;
  };
  teams: {
    away: ScheduleTeamEntry;
    home: ScheduleTeamEntry;
  };
  /** Standard between-half-inning break duration in seconds (usually 120). May be absent for older games. */
  inningBreakLength?: number;
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
  /**
   * 'Top'    – away batting, home defending
   * 'Middle' – between Top and Bottom (after top 3rd out)
   * 'Bottom' – home batting, away defending
   * 'End'    – between Bottom and next Top (after bottom 3rd out)
   */
  inningState: 'Top' | 'Middle' | 'Bottom' | 'End';
  scheduledInnings: number;
  outs: number;
  balls: number;
  strikes: number;
  teams: {
    home: { runs: number; hits: number; errors: number };
    away: { runs: number; hits: number; errors: number };
  };
  defense?: {
    pitcher: { id: number; fullName: string };
  };
  /**
   * Present when the game is live (inningState: 'Top' or 'Bottom').
   * Used by the change-detector to determine when a new batter has stepped up,
   * which signals that the previous at-bat completed and enrichment may be needed.
   */
  offense?: {
    batter?: { id: number; fullName: string };
    onDeck?: { id: number; fullName: string };
    inHole?: { id: number; fullName: string };
    /** Runner on first base. Absent when unoccupied. */
    first?: { id: number; fullName: string };
    /** Runner on second base. Absent when unoccupied. */
    second?: { id: number; fullName: string };
    /** Runner on third base. Absent when unoccupied. */
    third?: { id: number; fullName: string };
    /** Current batter's position in the batting order (1–9). */
    battingOrder?: number;
  };
}

const MLB_SCHEDULE_ENDPOINT = 'https://statsapi.mlb.com/api/v1/schedule';

/**
 * Calls the MLB schedule endpoint for the configured team
 * with linescore and team hydrations for richer data.
 */
export async function fetchSchedule(): Promise<ScheduleResponse> {
  const url = `${MLB_SCHEDULE_ENDPOINT}?sportId=1&teamId=${CONFIG.TEAM_ID}&hydrate=linescore,team`;
  const response = await axios.get<ScheduleResponse>(url, {
    timeout: 8_000,
    headers: {
      'User-Agent': 'mlb-gameday-ping/0.1',
    },
  });
  return response.data;
}
