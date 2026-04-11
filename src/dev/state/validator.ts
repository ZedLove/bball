import type { EventType, SimulationState } from '../types.ts';

/**
 * Validate whether an event transition is legal given the current state.
 * Returns an error message string if invalid, or null if the event can proceed.
 */
export function validateTransition(event: EventType, state: SimulationState): string | null {
  switch (event) {
    case 'game-start':
      if (state.gameStarted && !state.gameEnded) {
        return 'Game already in progress. Use reset first.';
      }
      return null;

    case 'game-end':
      if (!state.gameStarted) return 'No game has been started.';
      if (state.gameEnded) return 'Game has already ended.';
      return null;

    case 'out':
      if (!state.gameStarted || state.gameEnded) return 'No game in progress.';
      if (state.outs >= 3) {
        return 'Already at 3 outs. Use batting-begins to advance to the next half-inning.';
      }
      return null;

    case 'pitching-change':
    case 'batting-begins':
    case 'batting-ends':
    case 'between-innings':
      if (!state.gameStarted || state.gameEnded) return 'No game in progress.';
      return null;

    case 'delay':
      if (!state.gameStarted || state.gameEnded) return 'No game in progress.';
      if (state.isDelayed) return 'Game is already delayed.';
      return null;

    case 'clear-delay':
      if (!state.isDelayed) return 'Game is not currently delayed.';
      return null;

    default:
      return null;
  }
}
