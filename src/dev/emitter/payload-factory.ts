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

  // In the simulator the tracked team is always the home team.
  // During 'live', outsRemaining/totalOutsRemaining are only populated when
  // home is defending (Top half). During Bottom (home batting) they are null,
  // matching the production parser's "defending-only" semantics.
  const isLive = trackingMode === 'live';
  const homeDefending = state.inning.half === 'Top';
  const isDefending = isLive && homeDefending;

  const outsRemaining = isDefending ? 3 - state.outs : null;
  const totalOutsRemaining = isDefending ? computeTotalOutsRemaining(state) : null;
  const runsNeeded =
    isLive &&
    isExtraInnings &&
    !homeDefending &&
    state.score.home <= state.score.away
      ? computeRunsNeeded(state)
      : null;

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
          ? {
              ...state.currentPitcher,
              pitchesThrown: 0,
              strikes: 0,
              balls: 0,
              usage: [],
            }
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
    atBat:
      trackingMode === 'between-innings' || trackingMode === 'final'
        ? null
        : (state.currentAtBat ?? null),
    pitchHistory: [],
    venueId: null,
    venueFieldInfo: null,
    // In the simulator the tracked team is always the home team.
    trackedTeamAbbr: state.teams.home.abbreviation,
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
