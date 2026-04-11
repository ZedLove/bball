import type { GameUpdate } from '../../scheduler/parser.ts';
import type { SimulationState } from '../types.ts';
import { toOrdinal } from '../types.ts';

const DEFAULT_STATE: SimulationState = {
  teams: {
    away: { id: 121, name: 'New York Mets', abbreviation: 'NYM' },
    home: { id: 141, name: 'Toronto Blue Jays', abbreviation: 'TOR' },
  },
  inning: { number: 1, half: 'Top', ordinal: '1st' },
  outs: 0,
  score: { away: 0, home: 0 },
  currentPitcher: { id: 445127, fullName: 'Max Scherzer' },
  isDelayed: false,
  delayDescription: null,
  scheduledInnings: 9,
  gameStarted: false,
  gameEnded: false,
};

export interface StateStore {
  getState(): SimulationState;
  setState(partial: Partial<SimulationState>): void;
  /** Advance to the next half-inning and reset outs to 0. */
  advanceHalf(): void;
  reset(): void;
  getLastEmitted(): GameUpdate | null;
  setLastEmitted(update: GameUpdate): void;
}

export function createStateStore(): StateStore {
  let state: SimulationState = deepCopy(DEFAULT_STATE);
  let lastEmitted: GameUpdate | null = null;

  return {
    getState() {
      return {
        ...state,
        inning: { ...state.inning },
        teams: {
          away: { ...state.teams.away },
          home: { ...state.teams.home },
        },
        score: { ...state.score },
        currentPitcher: state.currentPitcher ? { ...state.currentPitcher } : null,
      };
    },

    setState(partial) {
      // Shallow-merge top-level fields; callers must pass complete nested objects.
      state = { ...state, ...partial };
    },

    advanceHalf() {
      if (state.inning.half === 'Top') {
        state.inning = { ...state.inning, half: 'Bottom' };
      } else {
        const next = state.inning.number + 1;
        state.inning = { number: next, half: 'Top', ordinal: toOrdinal(next) };
      }
      state.outs = 0;
    },

    reset() {
      state = deepCopy(DEFAULT_STATE);
      lastEmitted = null;
    },

    getLastEmitted() {
      return lastEmitted;
    },

    setLastEmitted(update) {
      lastEmitted = update;
    },
  };
}

function deepCopy(s: SimulationState): SimulationState {
  return {
    ...s,
    inning: { ...s.inning },
    teams: { away: { ...s.teams.away }, home: { ...s.teams.home } },
    score: { ...s.score },
    currentPitcher: s.currentPitcher ? { ...s.currentPitcher } : null,
  };
}
