import type { Dispatch } from 'react';
import type { GameUpdate } from '../server/socket-events.ts';
import type {
  BattedBallData,
  GameEvent,
  GameEventsPayload,
  GameSummary,
} from '../server/socket-events.ts';

export type FilterMode = 'all' | 'scoring';
export type PitchDisplayMode = 'last' | 'at-bat' | 'all';

export const MAX_EVENTS = 20;

/** How long to display the hit result panel after a ball is put in play. */
export const HIT_DISPLAY_MS = 15_000;

/** Total duration of the celebration animation in milliseconds. */
export const CELEBRATION_DURATION_MS = 3_000;

/** Milliseconds between celebration animation frames (~12 fps). */
export const CELEBRATION_FRAME_MS = 80;

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

/**
 * Whether the event is positive (preferred team wins/hits HR) or negative
 * (preferred team loses/surrenders HR).
 */
export type CelebrationPolarity = 'positive' | 'negative';

export type CelebrationKind = 'home-run' | 'win' | 'loss';

/**
 * Transient state for the animated celebration/condolence panel.
 * Cleared by 'dismiss-celebration' after CELEBRATION_DURATION_MS.
 */
export interface CelebrationState {
  kind: CelebrationKind;
  polarity: CelebrationPolarity;
  /** Current animation frame index. Incremented by 'advance-celebration-frame'. */
  frame: number;
  /** Batter name — only meaningful for 'home-run'; empty string otherwise. */
  batterName: string;
  /** Millisecond timestamp after which the panel should be dismissed. */
  expiresAt: number;
}

export interface DashboardState {
  lastUpdate: GameUpdate | null;
  /**
   * Abbreviation of the preferred (tracked) team. Populated from the first
   * game-update received; null before the first update arrives.
   */
  trackedTeamAbbr: string | null;
  events: GameEvent[];
  summary: GameSummary | null;
  /** Populated when a ball is put in play; cleared after HIT_DISPLAY_MS. */
  lastHit: HitDisplay | null;
  /** Active celebration animation state; null when no celebration is running. */
  celebration: CelebrationState | null;
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
  | { type: 'dismiss-hit' }
  | { type: 'advance-celebration-frame' }
  | { type: 'dismiss-celebration' };

export type DashboardDispatch = Dispatch<DashboardAction>;
