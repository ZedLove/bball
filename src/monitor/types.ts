import type { Dispatch } from 'react';
import type { GameUpdate } from '../scheduler/parser.ts';
import type {
  GameEvent,
  GameEventsPayload,
  GameSummary,
} from '../server/socket-events.ts';

export type FilterMode = 'all' | 'scoring';
export type PitchDisplayMode = 'all' | 'last';

export const MAX_EVENTS = 20;

export interface DashboardState {
  lastUpdate: GameUpdate | null;
  events: GameEvent[];
  summary: GameSummary | null;
  filter: FilterMode;
  pitchDisplay: PitchDisplayMode;
  connectedAt: Date | null;
}

export type DashboardAction =
  | { type: 'game-update'; payload: GameUpdate }
  | { type: 'game-events'; payload: GameEventsPayload }
  | { type: 'game-summary'; payload: GameSummary }
  | { type: 'connected' }
  | { type: 'disconnected' }
  | { type: 'set-filter'; filter: FilterMode }
  | { type: 'toggle-pitch-display' };

export type DashboardDispatch = Dispatch<DashboardAction>;
