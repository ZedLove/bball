import { useReducer } from 'react';
import type {
  DashboardAction,
  DashboardDispatch,
  DashboardState,
} from '../types.ts';
import { MAX_EVENTS } from '../types.ts';

const INITIAL_STATE: DashboardState = {
  lastUpdate: null,
  events: [],
  summary: null,
  filter: 'all',
  pitchDisplay: 'all',
  connectedAt: null,
};

export function dashboardReducer(
  state: DashboardState,
  action: DashboardAction
): DashboardState {
  switch (action.type) {
    case 'game-update':
      return { ...state, lastUpdate: action.payload };

    case 'game-events': {
      // Each payload carries an ordered batch; prepend newest events to the
      // buffer so that index 0 is always the most recent.
      const incoming = [...action.payload.events].reverse();
      const combined = [...incoming, ...state.events].slice(0, MAX_EVENTS);
      return { ...state, events: combined };
    }

    case 'game-summary':
      return { ...state, summary: action.payload };

    case 'connected':
      return { ...state, connectedAt: new Date() };

    case 'disconnected':
      return { ...state, connectedAt: null };

    case 'set-filter':
      return { ...state, filter: action.filter };

    case 'toggle-pitch-display':
      return {
        ...state,
        pitchDisplay: state.pitchDisplay === 'all' ? 'last' : 'all',
      };
  }
}

export function useDashboardState(): [DashboardState, DashboardDispatch] {
  return useReducer(dashboardReducer, INITIAL_STATE);
}
