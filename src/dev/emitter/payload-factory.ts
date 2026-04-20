import type { GameUpdate } from '../../scheduler/parser.ts';
import type { SimulationState } from '../types.ts';

/**
 * Construct a complete GameUpdate payload from the current simulation state.
 *
 * @param state       Current simulation state.
 * @param trackingMode  Explicit tracking mode for this emission.
 * @param overrides   Optional field overrides applied last (e.g. pitchingChange: true).
 */
export function buildPayload(
  state: SimulationState,
  trackingMode: GameUpdate['trackingMode'],
  overrides?: Partial<GameUpdate>
): GameUpdate {
  const defending =
    state.inning.half === 'Top'
      ? state.teams.home.abbreviation
      : state.teams.away.abbreviation;
  const batting =
    state.inning.half === 'Top'
      ? state.teams.away.abbreviation
      : state.teams.home.abbreviation;

  const isExtraInnings = state.inning.number > state.scheduledInnings;

  // Use 'End' for the half field during a between-innings transition to match the real API.
  const half: GameUpdate['inning']['half'] =
    trackingMode === 'between-innings' ? 'End' : state.inning.half;

  const outsRemaining = trackingMode === 'outs' ? 3 - state.outs : null;
  const totalOutsRemaining =
    trackingMode === 'outs' || trackingMode === 'batting'
      ? computeTotalOutsRemaining(state)
      : null;
  const runsNeeded = trackingMode === 'runs' ? computeRunsNeeded(state) : null;

  const base: GameUpdate = {
    gameStatus: state.gameEnded ? 'Final' : 'In Progress',
    gamePk: state.gamePk,
    teams: {
      away: { ...state.teams.away },
      home: { ...state.teams.home },
    },
    score: { ...state.score },
    inning: {
      number: state.inning.number,
      half,
      ordinal: state.inning.ordinal,
    },
    outs: state.outs,
    defendingTeam: defending,
    battingTeam: batting,
    isDelayed: state.isDelayed,
    delayDescription: state.delayDescription,
    isExtraInnings,
    scheduledInnings: state.scheduledInnings,
    currentPitcher:
      trackingMode === 'between-innings'
        ? null
        : state.currentPitcher
          ? { ...state.currentPitcher }
          : null,
    upcomingPitcher:
      trackingMode === 'between-innings'
        ? state.currentPitcher
          ? { ...state.currentPitcher }
          : null
        : null,
    trackingMode,
    outsRemaining,
    totalOutsRemaining,
    runsNeeded,
    inningBreakLength: trackingMode === 'between-innings' ? 120 : null,
  };

  return overrides ? { ...base, ...overrides } : base;
}

function computeTotalOutsRemaining(state: SimulationState): number | null {
  if (state.inning.number > state.scheduledInnings) return null;
  // When the away team is defending the final half-inning and the home team is
  // winning, the bottom of that inning won't be played — subtract one half.
  const awayDefendingAndLosing =
    state.inning.half === 'Bottom' && state.score.away < state.score.home;
  const remainingInnings = state.scheduledInnings - state.inning.number;
  const adjustment = awayDefendingAndLosing ? 1 : 0;
  return 3 - state.outs + (remainingInnings - adjustment) * 3;
}

function computeRunsNeeded(state: SimulationState): number {
  const battingKey = state.inning.half === 'Top' ? 'away' : 'home';
  const defendingKey = battingKey === 'away' ? 'home' : 'away';
  const battingScore = state.score[battingKey];
  const defendingScore = state.score[defendingKey];
  if (battingScore >= defendingScore) return 1;
  return defendingScore - battingScore + 1;
}
