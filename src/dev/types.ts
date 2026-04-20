// ---------------------------------------------------------------------------
// Shared types for the dev event simulator
// ---------------------------------------------------------------------------

import type { AtBatState } from '../server/socket-events.ts';

export type EventType =
  | 'game-start'
  | 'game-end'
  | 'out'
  | 'pitching-change'
  | 'batting-begins'
  | 'batting-ends'
  | 'between-innings'
  | 'delay'
  | 'clear-delay'
  | 'plate-appearance'
  | 'score'
  | 'offensive-sub'
  | 'defensive-sub'
  | 'game-summary';

export interface SimulationState {
  teams: {
    away: { id: number; name: string; abbreviation: string };
    home: { id: number; name: string; abbreviation: string };
  };
  inning: {
    number: number;
    half: 'Top' | 'Bottom';
    ordinal: string;
  };
  outs: number;
  score: {
    away: number;
    home: number;
  };
  currentPitcher: { id: number; fullName: string } | null;
  isDelayed: boolean;
  delayDescription: string | null;
  scheduledInnings: number;
  gameStarted: boolean;
  gameEnded: boolean;
  /** Placeholder game identifier used to shape-match production `game-update` payloads. */
  gamePk: number;
  /** Live at-bat snapshot for the current plate appearance. null when no at-bat is in progress. */
  currentAtBat: AtBatState | null;
}

export interface HandlerResult {
  success: boolean;
  message: string;
}

export interface PitchingChangeOptions {
  pitcherId?: number;
  pitcherName?: string;
}

export interface PlateAppearanceOptions {
  /** Override the randomly selected out-type with any catalogued eventType. */
  type?: string;
}

export interface ScoreOptions {
  /** Override the randomly selected scoring eventType. */
  type?: string;
  /** Number of runs to add (default: 1). */
  runs?: number;
}

export interface SubstitutionOptions {
  playerName?: string;
  playerId?: number;
}

export interface DelayOptions {
  reason?: string;
}

export interface SetInningOptions {
  inning?: number;
}

export interface SetScoreOptions {
  away?: number;
  home?: number;
}

export interface NewBatterOptions {
  batterName?: string;
  batterId?: number;
  pitcherName?: string;
  pitcherId?: number;
}

export interface PitchOptions {
  /** Pitch type description, e.g. "Four-Seam Fastball". Defaults to "Four-Seam Fastball". */
  type?: string;
  /** Velocity in mph. Defaults to 93. */
  speed?: number;
  /** Call result: "Ball", "Strike", "Foul", or "In play". Defaults to "Ball". */
  call?: 'Ball' | 'Strike' | 'Foul' | 'In play';
}

/** Convert an integer to its ordinal string representation (1 → "1st", 11 → "11th", etc.) */
export function toOrdinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  const rem = n % 10;
  if (rem === 1) return `${n}st`;
  if (rem === 2) return `${n}nd`;
  if (rem === 3) return `${n}rd`;
  return `${n}th`;
}
