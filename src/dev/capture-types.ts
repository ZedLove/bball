import type { GameUpdate } from '../scheduler/parser.ts';
import type {
  GameEventsPayload,
  GameSummary,
} from '../server/socket-events.ts';
import type { ScheduleResponse } from '../scheduler/schedule-client.ts';
import type {
  GameFeedLiveResponse,
  GameFeedResponse,
  BoxscoreResponse,
} from '../scheduler/game-feed-types.ts';

/** Raw API responses captured during one scheduler poll tick. */
export interface CapturedApiData {
  schedule: ScheduleResponse;
  gameFeedLive: GameFeedLiveResponse | null;
  diffPatch: GameFeedResponse | null;
  boxscore: BoxscoreResponse | null;
}

/** Socket.IO event payloads emitted during one scheduler poll tick. */
export interface CapturedEmittedData {
  gameUpdate: GameUpdate | null;
  gameEvents: GameEventsPayload | null;
  gameSummary: GameSummary | null;
}

/**
 * One captured scheduler poll tick.
 * Stored as a single newline-delimited JSON line in ticks.ndjson.
 */
export interface CapturedTick {
  seq: number;
  /** ISO 8601 wall-clock time at the start of this tick. */
  wallTime: string;
  /** Milliseconds elapsed since the capture session started. */
  elapsedMs: number;
  api: CapturedApiData;
  emitted: CapturedEmittedData;
}

/** Written to session.json in the capture directory. */
export interface CaptureSession {
  gamePk: number;
  /** Team abbreviation used to identify the game (e.g. "NYM"). */
  team: string;
  /** ISO 8601 wall-clock time the capture script started. */
  captureStart: string;
  /** ISO 8601 wall-clock time the capture ended, or null if still running. */
  captureEnd: string | null;
  tickCount: number;
}
