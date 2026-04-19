/**
 * Isolated error-path tests for mlb-scheduler that require mocking summary-parser
 * at the module level. Kept in a separate file so the mock does not affect the
 * main mlb-scheduler.test.ts suite, which relies on the real buildGameSummary
 * implementation for payload-shape assertions.
 */

// ── Module mocks (hoisted before imports) ────────────────────────────────────
vi.mock('./schedule-client.ts', () => ({ fetchSchedule: vi.fn() }));
vi.mock('./game-feed-client.ts', () => ({ fetchGameFeed: vi.fn() }));
vi.mock('./boxscore-client.ts', () => ({ fetchBoxscore: vi.fn() }));
vi.mock('./next-game-client.ts', () => ({ fetchNextGame: vi.fn() }));
vi.mock('./summary-parser.ts', () => ({ buildGameSummary: vi.fn() }));
vi.mock('./logger.ts', () => ({ logUpdate: vi.fn() }));
vi.mock('../config/env.ts', () => ({
  CONFIG: {
    TEAM_ID: 121,
    MAX_RETRIES: 0,
    RETRY_BACKOFF_MS: 0,
    IDLE_POLL_INTERVAL: 60,
    ACTIVE_POLL_INTERVAL: 10,
    BATTING_POLL_INTERVAL: 30,
    BETWEEN_INNINGS_BUFFER_S: 15,
    CORS_ORIGIN: '*',
    PORT: 4000,
    DEV_MODE: false,
  },
}));

import { startScheduler } from './mlb-scheduler.ts';
import { SOCKET_EVENTS } from '../server/socket-events.ts';
import { fetchSchedule } from './schedule-client.ts';
import { fetchGameFeed } from './game-feed-client.ts';
import { fetchBoxscore } from './boxscore-client.ts';
import { fetchNextGame } from './next-game-client.ts';
import { buildGameSummary } from './summary-parser.ts';
import {
  createMockIo,
  drainMicrotasks,
  makeLiveSchedule,
  makeFinalSchedule,
  makeFeedResponse,
  makeBoxscoreResponse,
  makeNextGameResponse,
} from './mlb-scheduler.test-utils.ts';

const mockFetchSchedule = vi.mocked(fetchSchedule);
const mockFetchGameFeed = vi.mocked(fetchGameFeed);
const mockFetchBoxscore = vi.mocked(fetchBoxscore);
const mockFetchNextGame = vi.mocked(fetchNextGame);
const mockBuildGameSummary = vi.mocked(buildGameSummary);

// ── Test lifecycle ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('buildGameSummary error handling', () => {
  it('does not emit game-summary when buildGameSummary throws', async () => {
    mockBuildGameSummary.mockImplementationOnce(() => {
      throw new Error('summary parse failure');
    });
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule());
    mockFetchSchedule.mockResolvedValueOnce(makeFinalSchedule());
    mockFetchGameFeed.mockResolvedValueOnce(makeFeedResponse(5));
    mockFetchBoxscore.mockResolvedValueOnce(makeBoxscoreResponse());
    mockFetchNextGame.mockResolvedValueOnce(makeNextGameResponse());

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks(); // tick 1: live game, bootstrap skip

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 2: final game, buildGameSummary throws

    expect(io.emit).not.toHaveBeenCalledWith(SOCKET_EVENTS.GAME_SUMMARY, expect.anything());
    scheduler.stop();
  });

  it('continues emitting game-update even when buildGameSummary throws', async () => {
    mockBuildGameSummary.mockImplementationOnce(() => {
      throw new Error('summary parse failure');
    });
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule());
    mockFetchSchedule.mockResolvedValueOnce(makeFinalSchedule());
    mockFetchGameFeed.mockResolvedValueOnce(makeFeedResponse(5));
    mockFetchBoxscore.mockResolvedValueOnce(makeBoxscoreResponse());
    mockFetchNextGame.mockResolvedValueOnce(makeNextGameResponse());

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks();

    vi.runOnlyPendingTimers();
    await drainMicrotasks();

    // Baseline game-update for the final game should still be emitted
    expect(io.emit).toHaveBeenCalledWith(
      SOCKET_EVENTS.GAME_UPDATE,
      expect.objectContaining({ trackingMode: 'final' }),
    );
    scheduler.stop();
  });
});
