import type { ScheduleResponse } from './poller.ts';

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
  /** true when the current inning exceeds scheduledInnings */
  isExtraInnings: boolean;
  /** Number of innings originally scheduled (usually 9) */
  scheduledInnings: number;
  /**
   * 'outs' – target team is defending; frontend should show outsRemaining.
   * 'runs' – target team is batting in extras while tied/losing; show runsNeeded.
   */
  trackingMode: "outs" | "runs";
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
}

export interface TeamInfo {
  id: number;
  name: string;
  abbreviation: string;
}

/**
 * Walks through the schedule response and returns either:
 *   - a GameUpdate when the target team should be tracked, or
 *   - null (no game, game not in progress, or nothing to track)
 *
 * Tracking rules:
 *   1. Target team is on defense → trackingMode 'outs' (any inning)
 *   2. Target team is batting in extra innings while tied or losing → trackingMode 'runs'
 *   3. Otherwise → null (target team batting in regulation, or batting in extras with a lead)
 */
export function parseGameUpdate(
  schedule: ScheduleResponse,
  targetTeamId: number,
): GameUpdate | null {
  const today = schedule.dates?.[0];
  if (!today) return null;

  const game = today.games.find(
    (g) =>
      g.teams?.away?.team?.id === targetTeamId ||
      g.teams?.home?.team?.id === targetTeamId,
  );
  if (!game) return null;

  if (game.status?.detailedState !== 'In Progress') return null;

  const linescore = game.linescore;
  if (!linescore) return null;

  const isHomeDefending = linescore.inningState === 'Top';
  const defendingEntry = isHomeDefending ? game.teams.home : game.teams.away;
  const battingEntry = isHomeDefending ? game.teams.away : game.teams.home;

  const isExtraInnings = linescore.currentInning > linescore.scheduledInnings;
  const targetIsDefending = defendingEntry.team.id === targetTeamId;
  const targetIsBatting = battingEntry.team.id === targetTeamId;

  // Determine whether we should emit an update and which tracking mode to use
  let trackingMode: 'outs' | 'runs';
  let outsRemaining: number | null = null;
  let totalOutsRemaining: number | null = null;
  let runsNeeded: number | null = null;

  if (targetIsDefending) {
    trackingMode = 'outs';
    outsRemaining = 3 - linescore.outs;
    if (!isExtraInnings) {
      // For the away team (defending the Bottom half), the final scheduled Bottom
      // inning is skipped when they are currently losing — the home team won't
      // need to bat to finish the game.
      const awayDefendingAndLosing =
        !isHomeDefending && defendingEntry.score < battingEntry.score;
      const futureHalfInnings =
        linescore.scheduledInnings -
        linescore.currentInning -
        (awayDefendingAndLosing ? 1 : 0);
      totalOutsRemaining = outsRemaining + futureHalfInnings * 3;
    }
  } else if (targetIsBatting && isExtraInnings) {
    const targetScore = battingEntry.score;
    const opponentScore = defendingEntry.score;
    // Only track when the target team is tied or losing
    if (targetScore > opponentScore) return null;
    trackingMode = 'runs';
    runsNeeded = opponentScore - targetScore + 1;
  } else {
    return null;
  }

  return {
    gameStatus: game.status.detailedState,
    teams: {
      away: {
        id: game.teams.away.team.id,
        name: game.teams.away.team.name,
        abbreviation: game.teams.away.team.abbreviation,
      },
      home: {
        id: game.teams.home.team.id,
        name: game.teams.home.team.name,
        abbreviation: game.teams.home.team.abbreviation,
      },
    },
    score: {
      away: game.teams.away.score,
      home: game.teams.home.score,
    },
    inning: {
      number: linescore.currentInning,
      half: linescore.inningState,
      ordinal: linescore.currentInningOrdinal,
    },
    outs: linescore.outs,
    defendingTeam: defendingEntry.team.abbreviation,
    isExtraInnings,
    scheduledInnings: linescore.scheduledInnings,
    trackingMode,
    outsRemaining,
    totalOutsRemaining,
    runsNeeded,
  };
}
