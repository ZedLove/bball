import { useReducer } from 'react';
import type {
  CelebrationState,
  DashboardAction,
  DashboardDispatch,
  DashboardState,
  HitDisplay,
} from '../types.ts';
import {
  CELEBRATION_DURATION_MS,
  HIT_DISPLAY_MS,
  MAX_EVENTS,
} from '../types.ts';
import type {
  GameEvent,
  PlateAppearanceCompletedEvent,
} from '../../server/socket-events.ts';

const INITIAL_STATE: DashboardState = {
  lastUpdate: null,
  trackedTeamAbbr: null,
  events: [],
  summary: null,
  lastHit: null,
  celebration: null,
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

/**
 * Scans a batch of events for a home run. Returns a CelebrationState
 * reflecting whether it was hit by the preferred team (positive) or not
 * (negative). Returns null when no home run is in the batch.
 */
function detectHomeRun(
  events: GameEvent[],
  trackedTeamAbbr: string | null
): CelebrationState | null {
  for (const event of events) {
    if (event.category !== 'plate-appearance-completed') continue;
    const e = event as PlateAppearanceCompletedEvent;
    if (e.eventType !== 'Home Run') continue;
    const polarity =
      trackedTeamAbbr !== null && e.battingTeam === trackedTeamAbbr
        ? 'positive'
        : 'negative';
    return {
      kind: 'home-run',
      polarity,
      frame: 0,
      batterName: e.batter.fullName,
      expiresAt: Date.now() + CELEBRATION_DURATION_MS,
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
      return {
        ...state,
        lastUpdate: action.payload,
        // Latch the tracked team abbreviation from the first update.
        trackedTeamAbbr:
          state.trackedTeamAbbr ?? action.payload.trackedTeamAbbr,
      };

    case 'game-events': {
      const incoming = [...action.payload.events].reverse();
      const combined = [...incoming, ...state.events].slice(0, MAX_EVENTS);
      const newHit = detectHit(incoming);
      // HR celebrations take priority over any existing celebration.
      const newCelebration = detectHomeRun(incoming, state.trackedTeamAbbr);
      return {
        ...state,
        events: combined,
        lastHit: newHit ?? state.lastHit,
        celebration: newCelebration ?? state.celebration,
      };
    }

    case 'game-summary': {
      // Determine win/loss for the preferred team.
      let celebration: CelebrationState | null = state.celebration;
      if (state.trackedTeamAbbr !== null) {
        const trackedAbbr = state.trackedTeamAbbr;
        const isHome =
          state.lastUpdate?.teams.home.abbreviation === trackedAbbr;
        const home = action.payload.finalScore.home;
        const away = action.payload.finalScore.away;
        const weWon = isHome ? home > away : away > home;
        celebration = {
          kind: weWon ? 'win' : 'loss',
          polarity: weWon ? 'positive' : 'negative',
          frame: 0,
          batterName: '',
          expiresAt: Date.now() + CELEBRATION_DURATION_MS,
        };
      }
      return { ...state, summary: action.payload, celebration };
    }

    case 'advance-celebration-frame':
      if (!state.celebration) return state;
      return {
        ...state,
        celebration: {
          ...state.celebration,
          frame: state.celebration.frame + 1,
        },
      };

    case 'dismiss-celebration':
      return { ...state, celebration: null };

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
