import type { ScheduleResponse } from './schedule-client.ts';
import type { AtBatState, PitchEvent } from '../server/socket-events.ts';
import type { PitcherGameStats } from './pitcher-stats.ts';
import type { VenueFieldInfo } from './venue-client.ts';

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

export interface TeamInfo {
  id: number;
  name: string;
  abbreviation: string;
}

/** detailedState values the API uses when the game is paused mid-game */
function isDelayedState(detailedState: string): boolean {
  return (
    detailedState.toLowerCase().includes('delay') ||
    detailedState === 'Suspended'
  );
}

/**
 * Walks through the schedule response and returns either:
 *   - a GameUpdate when the target team should be tracked, or
 *   - null (no game, game not in valid state, or nothing to track)
 *
 * Tracking rules:
 *   1. API says Final → trackingMode 'final', emitted once
 *   2. Linescore game-over: top half ends with home leading, currentInning >= scheduledInnings
 *      → trackingMode 'final' (client-side detection before API catches up)
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

  const game = today.games.find(
    (g) =>
      g.teams?.away?.team?.id === targetTeamId ||
      g.teams?.home?.team?.id === targetTeamId
  );
  if (!game) return null;

  const detailedState = game.status?.detailedState ?? '';
  const isInProgress = detailedState.startsWith('In Progress');
  const isFinal = detailedState === 'Final';
  const isDelayed = isDelayedState(detailedState);

  // Only process live, delayed, and final games; ignore Pre-Game, Scheduled, etc.
  // "In Progress" catches both standard play and replay reviews (e.g., "In Progress - Review")
  if (!isInProgress && !isDelayed && !isFinal) return null;

  const linescore = game.linescore;
  if (!linescore) return null;

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

  // Client-side game-end detection (Bug S-1): when a half-inning at or beyond
  // scheduledInnings ends with the home team leading, the remaining half is
  // never played. This covers two real-world API states:
  //   'Middle' — top half just completed (home was already leading; bottom not needed)
  //   'End'    — bottom half just completed (home walked off)
  // Both are captured by isBetweenInnings. The 'End' && check was too narrow:
  // captured games show the API dwelling in 'Middle' for multiple polls before
  // reporting 'Final', making 'Middle' the dominant real-world case.
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
    // stays null — S-1 game-end detection handles the 'final' transition once
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
