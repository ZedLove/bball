import { useReducer } from 'react';
import type {
  DashboardAction,
  DashboardDispatch,
  DashboardState,
  HitDisplay,
} from '../types.ts';
import { HIT_DISPLAY_MS, MAX_EVENTS } from '../types.ts';
import type {
  GameEvent,
  PlateAppearanceCompletedEvent,
} from '../../server/socket-events.ts';

const INITIAL_STATE: DashboardState = {
  lastUpdate: null,
  events: [],
  summary: null,
  lastHit: null,
  filter: 'all',
  pitchDisplay: 'all',
  connectedAt: null,
};

/**
 * Scans a batch of game events for the most recent ball put in play that has
 * Statcast hit data. Returns a populated HitDisplay or null if none found.
 */
function detectHit(events: GameEvent[]): HitDisplay | null {
  for (const event of events) {
    if (event.category !== 'plate-appearance-completed') continue;
    const e = event as PlateAppearanceCompletedEvent;
    const inPlayPitch = e.pitchSequence.find(
      (p) => p.isInPlay && p.hitData !== null
    );
    const hitData = inPlayPitch?.hitData;
    if (!hitData) continue;
    return {
      hitData,
      batter: e.batter,
      eventType: e.eventType,
      isHomeRun: e.eventType === 'Home Run',
      expiresAt: Date.now() + HIT_DISPLAY_MS,
    };
  }
  return null;
}

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
      // Detect and surface any ball-in-play with Statcast hit data.
      const newHit = detectHit(incoming);
      return { ...state, events: combined, lastHit: newHit ?? state.lastHit };
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

    case 'dismiss-hit':
      return { ...state, lastHit: null };
  }
}

export function useDashboardState(): [DashboardState, DashboardDispatch] {
  return useReducer(dashboardReducer, INITIAL_STATE);
}
