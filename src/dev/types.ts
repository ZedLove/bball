// ---------------------------------------------------------------------------
// Shared types for the dev event simulator
// ---------------------------------------------------------------------------

export type EventType =
  | 'game-start'
  | 'game-end'
  | 'out'
  | 'pitching-change'
  | 'batting-begins'
  | 'batting-ends'
  | 'between-innings'
  | 'delay'
  | 'clear-delay';

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
}

export interface HandlerResult {
  success: boolean;
  message: string;
}

export interface PitchingChangeOptions {
  pitcherId?: number;
  pitcherName?: string;
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

/** Convert an integer to its ordinal string representation (1 → "1st", 11 → "11th", etc.) */
export function toOrdinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  const rem = n % 10;
  if (rem === 1) return `${n}st`;
  if (rem === 2) return `${n}nd`;
  if (rem === 3) return `${n}rd`;
  return `${n}th`;
}
