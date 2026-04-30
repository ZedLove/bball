import type {
  ScheduleResponse,
  ScheduleGame,
  Linescore,
} from './schedule-client.ts';
import type { GameUpdate } from '../server/socket-events.ts';

/** detailedState values the API uses when the game is paused mid-game */
function isDelayedState(detailedState: string): boolean {
  return (
    detailedState.toLowerCase().includes('delay') ||
    detailedState === 'Suspended'
  );
}

/**
 * Priority rank for game status — lower number = higher priority.
 * Used to prefer the active game in a doubleheader over a completed one.
 */
function gameStatusPriority(detailedState: string): number {
  if (detailedState.startsWith('In Progress')) return 0;
  if (isDelayedState(detailedState)) return 1;
  if (detailedState === 'Final') return 2;
  return 3; // Pre-Game, Scheduled, Postponed, etc.
}

/**
 * Type guard: game is in a trackable state (in-progress, delayed, or final)
 * AND the linescore is present. Narrows linescore to non-optional so downstream
 * code can use it without a null check.
 */
function isTrackableGame(
  g: ScheduleGame
): g is ScheduleGame & { linescore: Linescore } {
  const state = g.status?.detailedState ?? '';
  return (
    (state.startsWith('In Progress') ||
      isDelayedState(state) ||
      state === 'Final') &&
    g.linescore !== undefined
  );
}

/**
 * Walks through the schedule response and returns either:
 *   - a GameUpdate for any live, delayed, or final game involving the target team, or
 *   - null (no game found, no linescore, or non-live state such as pre-game/scheduled)
 *
 * Tracking rules:
 *   1. API says Final → trackingMode 'final', emitted once
 *   2. Linescore game-over: half-inning at or beyond scheduledInnings ends with home
 *      leading → trackingMode 'final' (client-side detection before API catches up).
 *      Applies in both regular season (9th Middle with home ahead) and extras (any
 *      inning > scheduledInnings Middle/End with home ahead). Delayed games are
 *      excluded via the !isDelayed guard — a suspended game is not yet over.
 *   3. Between half-innings (Middle/End) → trackingMode 'between-innings', emitted once
 *   4. Active play → trackingMode 'live', emitted every tick
 *      - outsRemaining/totalOutsRemaining populated only when target team is defending
 *      - runsNeeded populated only when target team is batting in extras while tied/losing
 *   5. Game is delayed → isDelayed: true on any update
 */
export function parseGameUpdate(
  schedule: ScheduleResponse,
  targetTeamId: number
): GameUpdate | null {
  const today = schedule.dates?.[0];
  if (!today) return null;

  const teamGames = today.games.filter(
    (g) =>
      g.teams?.away?.team?.id === targetTeamId ||
      g.teams?.home?.team?.id === targetTeamId
  );
  if (teamGames.length === 0) return null;

  // In a doubleheader, prefer the active game over a completed one.
  // Sort by status priority: In Progress > Delayed > Final > Pre-Game/other.
  // Tie-break by gamePk descending so Game 2 is preferred when both games share
  // the same status (e.g. both Final after a day-night doubleheader).
  // Only consider games that are in a trackable state AND have a linescore —
  // a high-priority game (e.g. Delayed Start) with no linescore yet should not
  // block tracking of a lower-priority game that does have one.
  const game = teamGames
    .sort((a, b) => {
      const priorityDiff =
        gameStatusPriority(a.status?.detailedState ?? '') -
        gameStatusPriority(b.status?.detailedState ?? '');
      if (priorityDiff !== 0) return priorityDiff;
      return b.gamePk - a.gamePk; // prefer later game (higher gamePk) on tie
    })
    .find(isTrackableGame);

  if (!game) return null;

  const detailedState = game.status?.detailedState ?? '';
  const isFinal = detailedState === 'Final';
  const isDelayed = isDelayedState(detailedState);

  const linescore = game.linescore;

  const state = linescore.inningState;
  const isBetweenInnings = state === 'Middle' || state === 'End';

  // Determine defending/batting entries for all 4 inning states.
  //   Top    – away batting,  home defending
  //   Middle – home bats next (Bottom starting), away defends next
  //   Bottom – home batting,  away defending
  //   End    – away bats next (Top starting),  home defends next
  const homeBatting = state === 'Bottom' || state === 'Middle';
  const battingEntry = homeBatting ? game.teams.home : game.teams.away;
  const defendingEntry = homeBatting ? game.teams.away : game.teams.home;

  const isExtraInnings = linescore.currentInning > linescore.scheduledInnings;
  // The MLB API rotates linescore.defense.pitcher to the next half-inning's
  // pitcher as soon as the current half ends. We therefore only expose it as
  // 'currentPitcher' during active play, and as 'upcomingPitcher' between
  // innings, so consumers always get semantically correct data.
  const linescorePitcher = linescore.defense?.pitcher ?? null;
  const currentPitcher = isBetweenInnings
    ? null
    : linescorePitcher !== null
      ? {
          ...linescorePitcher,
          pitchesThrown: 0,
          strikes: 0,
          balls: 0,
          usage: [],
        }
      : null;
  const upcomingPitcher = isBetweenInnings ? linescorePitcher : null;

  let trackingMode: GameUpdate['trackingMode'];
  let outsRemaining: number | null = null;
  let totalOutsRemaining: number | null = null;
  let runsNeeded: number | null = null;

  // Client-side game-end detection: when a half-inning at or beyond
  // scheduledInnings ends with the home team leading, the remaining half is
  // never played. This covers two real-world API states:
  //   'Middle' — top half just completed (home already leading; bottom half not needed).
  //              Applies in any qualifying inning: 9th in a 9-inning game AND any
  //              extra inning (10th+). If home leads after the top of any extra inning,
  //              they win — the home team never needs to bat in that inning.
  //   'End'    — bottom half just completed (home walked off)
  // Captured games show the API dwelling in 'Middle' for multiple polls before
  // reporting 'Final', making 'Middle' the dominant real-world case.
  // Delayed/suspended games are excluded by !isDelayed — a suspended game is not over.
  const gameOverFromLinescore =
    !isFinal &&
    isBetweenInnings &&
    !isDelayed &&
    linescore.currentInning >= linescore.scheduledInnings &&
    game.teams.home.score > game.teams.away.score;

  if (isFinal || gameOverFromLinescore) {
    trackingMode = 'final';
  } else if (isBetweenInnings) {
    trackingMode = 'between-innings';
  } else {
    trackingMode = 'live';

    // Populate defending-team context fields
    if (defendingEntry.team.id === targetTeamId) {
      outsRemaining = 3 - linescore.outs;
      if (!isExtraInnings) {
        const awayDefendingAndLosing =
          homeBatting && defendingEntry.score < battingEntry.score;
        const futureHalfInnings =
          linescore.scheduledInnings -
          linescore.currentInning -
          (awayDefendingAndLosing ? 1 : 0);
        totalOutsRemaining = outsRemaining + futureHalfInnings * 3;
      }
    }

    // Populate extras batting context when tracked team is batting in extras
    // while tied or losing. When leading (walk-off in progress), runsNeeded
    // stays null — game-end detection handles the 'final' transition once
    // the inning state transitions to 'End'.
    if (isExtraInnings && battingEntry.team.id === targetTeamId) {
      const targetScore = battingEntry.score;
      const opponentScore = defendingEntry.score;
      if (targetScore <= opponentScore) {
        runsNeeded = opponentScore - targetScore + 1;
      }
    }
  }

  return {
    gameStatus: detailedState,
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
    battingTeam: battingEntry.team.abbreviation,
    isDelayed,
    delayDescription: isDelayed ? detailedState : null,
    isExtraInnings,
    scheduledInnings: linescore.scheduledInnings,
    trackingMode,
    outsRemaining,
    totalOutsRemaining,
    runsNeeded,
    currentPitcher,
    upcomingPitcher,
    gamePk: game.gamePk,
    atBat: null,
    pitchHistory: [],
    trackedTeamAbbr:
      game.teams.home.team.id === targetTeamId
        ? game.teams.home.team.abbreviation
        : game.teams.away.team.abbreviation,
    venueId: game.venue?.id ?? null,
    venueFieldInfo: null,
  };
}
