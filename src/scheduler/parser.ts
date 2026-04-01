import type { ScheduleResponse, GameUpdate } from './types.ts';

/**
 * Walks through the schedule response and returns either:
 *   - a GameUpdate (game is in progress and target team is on defense) or
 *   - null (no game, game not in progress, or target team is batting)
 */
export function parseGameUpdate(
  schedule: ScheduleResponse,
  targetTeamId: number,
): GameUpdate | null {
  const today = schedule.dates?.[0];
  if (!today) return null;

  // Find a game that involves our team
  const game = today.games.find(
    (g) =>
      g.teams?.away?.team?.id === targetTeamId ||
      g.teams?.home?.team?.id === targetTeamId,
  );
  if (!game) return null;

  // Only report on in-progress games
  if (game.status?.detailedState !== 'In Progress') return null;

  const linescore = game.linescore;
  if (!linescore) return null;

  // Determine which side is on defense:
  //   Top    -> away batting, home defending
  //   Bottom -> home batting, away defending
  const isHomeDefending = linescore.inningState === 'Top';
  const defendingEntry = isHomeDefending ? game.teams.home : game.teams.away;

  // Only report when the target team is fielding
  if (defendingEntry.team.id !== targetTeamId) return null;

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
  };
}
