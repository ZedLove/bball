import type { Dispatch } from 'react';
import type { GameUpdate } from '../scheduler/parser.ts';
import type {
  BattedBallData,
  GameEvent,
  GameEventsPayload,
  GameSummary,
} from '../server/socket-events.ts';

export type FilterMode = 'all' | 'scoring';
export type PitchDisplayMode = 'all' | 'last';

export const MAX_EVENTS = 20;

/** How long to display the hit result panel after a ball is put in play. */
export const HIT_DISPLAY_MS = 7_000;

/**
 * Transient state for the hit result panel shown after every ball in play.
 * Cleared by the 'dismiss-hit' action after HIT_DISPLAY_MS.
 */
export interface HitDisplay {
  hitData: BattedBallData;
  batter: { id: number; fullName: string };
  /** Raw MLB event type string, e.g. "Home Run", "Fly Out", "Single". */
  eventType: string;
  isHomeRun: boolean;
  /** Millisecond timestamp after which the panel should be dismissed. */
  expiresAt: number;
}

export interface DashboardState {
  lastUpdate: GameUpdate | null;
  events: GameEvent[];
  summary: GameSummary | null;
  /** Populated when a ball is put in play; cleared after HIT_DISPLAY_MS. */
  lastHit: HitDisplay | null;
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
  | { type: 'toggle-pitch-display' }
  | { type: 'dismiss-hit' };

export type DashboardDispatch = Dispatch<DashboardAction>;
