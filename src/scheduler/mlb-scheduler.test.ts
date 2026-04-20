import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// ── Module mocks (hoisted before imports) ────────────────────────────────────
vi.mock('./schedule-client.ts', () => ({ fetchSchedule: vi.fn() }));
vi.mock('./game-feed-client.ts', () => ({ fetchGameFeed: vi.fn() }));
vi.mock('./game-feed-live-client.ts', () => ({ fetchGameFeedLive: vi.fn() }));
vi.mock('./boxscore-client.ts', () => ({ fetchBoxscore: vi.fn() }));
vi.mock('./next-game-client.ts', () => ({ fetchNextGame: vi.fn() }));
vi.mock('./logger.ts', () => ({ logUpdate: vi.fn() }));
vi.mock('../config/env.ts', () => ({
  CONFIG: {
    TEAM_ID: 121, // NYM
    MAX_RETRIES: 0, // Fail fast in tests — no retry delay
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
import { fetchGameFeedLive } from './game-feed-live-client.ts';
import { fetchBoxscore } from './boxscore-client.ts';
import { fetchNextGame } from './next-game-client.ts';
import * as summaryParserModule from './summary-parser.ts';
import type { ScheduleResponse } from './schedule-client.ts';
import type { GameFeedResponse } from './game-feed-types.ts';
import {
  createMockIo,
  drainMicrotasks,
  LAD_ID,
  NYM_ID,
  GAME_PK,
  GAME_DATE,
  SEED_TIMECODE,
  FEED_TIMESTAMP_1,
  FEED_TIMESTAMP_2,
  makeLiveSchedule,
  makeFinalSchedule,
  makeFeedResponse,
  makeBoxscoreResponse,
  makeNextGameResponse,
  makeGameFeedLiveResponse,
} from './mlb-scheduler.test-utils.ts';

const mockFetchSchedule = vi.mocked(fetchSchedule);
const mockFetchGameFeed = vi.mocked(fetchGameFeed);
const mockFetchGameFeedLive = vi.mocked(fetchGameFeedLive);
const mockFetchBoxscore = vi.mocked(fetchBoxscore);
const mockFetchNextGame = vi.mocked(fetchNextGame);

// ── File-specific schedule fixtures ──────────────────────────────────────────

function makeNewGameSchedule(): ScheduleResponse {
  return {
    dates: [
      {
        date: '2026-04-16',
        games: [
          {
            gamePk: 824100, // different gamePk
            gameDate: '2026-04-16T18:00:00Z',
            status: { detailedState: 'In Progress', abstractGameState: 'Live' },
            inningBreakLength: 120,
            teams: {
              away: {
                team: {
                  id: LAD_ID,
                  name: 'Los Angeles Dodgers',
                  abbreviation: 'LAD',
                },
                score: 0,
                leagueRecord: { wins: 4, losses: 3 },
              },
              home: {
                team: {
                  id: NYM_ID,
                  name: 'New York Mets',
                  abbreviation: 'NYM',
                },
                score: 0,
                leagueRecord: { wins: 5, losses: 2 },
              },
            },
            linescore: {
              currentInning: 1,
              currentInningOrdinal: '1st',
              inningState: 'Top',
              scheduledInnings: 9,
              outs: 0,
              balls: 0,
              strikes: 0,
              teams: {
                home: { runs: 0, hits: 0, errors: 0 },
                away: { runs: 0, hits: 0, errors: 0 },
              },
            },
          },
        ],
      },
    ],
  };
}

function makeEmptySchedule(): ScheduleResponse {
  return { dates: [] };
}

// ── File-specific feed fixtures ──────────────────────────────────────────────

function makeEmptyFeedResponse(timestamp = FEED_TIMESTAMP_1): GameFeedResponse {
  return {
    metaData: { timeStamp: timestamp },
    gameData: {
      teams: {
        away: { id: LAD_ID, abbreviation: 'LAD' },
        home: { id: NYM_ID, abbreviation: 'NYM' },
      },
      players: {},
    },
    liveData: { plays: { allPlays: [] } },
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  // Default: feed/live returns currentPlay: null → atBat: null on every game-update.
  // Tests that need a populated atBat override this per-test.
  mockFetchGameFeedLive.mockResolvedValue(makeGameFeedLiveResponse());
});

afterEach(() => {
  // resetAllMocks clears both call counts AND the mockResolvedValueOnce queues,
  // preventing leftover queued responses from contaminating subsequent tests.
  vi.resetAllMocks();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Baseline game-update behavior
// ---------------------------------------------------------------------------

describe('baseline game-update emission', () => {
  it('emits game-update when an active game is detected', async () => {
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule());
    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks();

    expect(io.emit).toHaveBeenCalledWith(
      SOCKET_EVENTS.GAME_UPDATE,
      expect.objectContaining({ gamePk: GAME_PK, trackingMode: 'outs' })
    );
    scheduler.stop();
  });

  it('does not emit game-update when no game is found in the schedule', async () => {
    mockFetchSchedule.mockResolvedValueOnce(makeEmptySchedule());
    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks();

    expect(io.emit).not.toHaveBeenCalledWith(
      SOCKET_EVENTS.GAME_UPDATE,
      expect.anything()
    );
    scheduler.stop();
  });
});

// ---------------------------------------------------------------------------
// Enrichment state management
// ---------------------------------------------------------------------------

describe('enrichment state management', () => {
  it('does not call fetchGameFeed on the first tick for a new gamePk (bootstrap skip)', async () => {
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule());
    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks();

    expect(mockFetchGameFeed).not.toHaveBeenCalled();
    scheduler.stop();
  });

  it('calls fetchGameFeed on the second tick when the linescore has changed', async () => {
    // Tick 1: outs=1 (seeds lastLinescoreSnapshot)
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(1));
    // Tick 2: outs=2 (delta detected → enrichment fires)
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(2));
    mockFetchGameFeed.mockResolvedValueOnce(makeEmptyFeedResponse());

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks(); // tick 1 settles

    vi.runOnlyPendingTimers(); // fire tick 2's setTimeout
    await drainMicrotasks(); // tick 2 settles

    expect(mockFetchGameFeed).toHaveBeenCalledOnce();
    expect(mockFetchGameFeed).toHaveBeenCalledWith(GAME_PK, SEED_TIMECODE);
    scheduler.stop();
  });

  it('does not call fetchGameFeed when the linescore is unchanged between ticks', async () => {
    const sameSchedule = makeLiveSchedule(1);
    // Both ticks return identical linescore → no delta
    mockFetchSchedule.mockResolvedValueOnce(sameSchedule);
    mockFetchSchedule.mockResolvedValueOnce(sameSchedule);

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks();

    vi.runOnlyPendingTimers();
    await drainMicrotasks();

    expect(mockFetchGameFeed).not.toHaveBeenCalled();
    scheduler.stop();
  });

  it('uses updated lastTimestamp as cursor on the second enrichment fetch', async () => {
    // Tick 1 seeds state
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(1));
    // Tick 2: outs changes → enrichment fires with SEED_TIMECODE; cursor advances to FEED_TIMESTAMP_1
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(2));
    mockFetchGameFeed.mockResolvedValueOnce(
      makeEmptyFeedResponse(FEED_TIMESTAMP_1)
    );
    // Tick 3: outs changes again → enrichment fires with FEED_TIMESTAMP_1 (the advanced cursor)
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(3));
    mockFetchGameFeed.mockResolvedValueOnce(
      makeEmptyFeedResponse(FEED_TIMESTAMP_2)
    );

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks(); // tick 1

    // Tick 2
    vi.runOnlyPendingTimers();
    await drainMicrotasks();

    // Tick 3
    vi.runOnlyPendingTimers();
    await drainMicrotasks();

    // Third call should use the timestamp from tick 2's feed response
    expect(mockFetchGameFeed).toHaveBeenNthCalledWith(
      1,
      GAME_PK,
      SEED_TIMECODE
    );
    expect(mockFetchGameFeed).toHaveBeenNthCalledWith(
      2,
      GAME_PK,
      FEED_TIMESTAMP_1
    );
    scheduler.stop();
  });

  it('resets enrichment state when the gamePk changes between ticks', async () => {
    // Tick 1: game 823963
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(1));
    // Tick 2: different game (824100) — new enrichment state, first tick for new gamePk → no enrichment
    mockFetchSchedule.mockResolvedValueOnce(makeNewGameSchedule());

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks();

    vi.runOnlyPendingTimers();
    await drainMicrotasks();

    // No enrichment on first tick for either gamePk
    expect(mockFetchGameFeed).not.toHaveBeenCalled();
    scheduler.stop();
  });

  it('clears enrichment state when the game drops out of scope', async () => {
    // Tick 1: active game
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(1));
    // Tick 2: empty schedule → enrichment state cleared
    mockFetchSchedule.mockResolvedValueOnce(makeEmptySchedule());
    // Tick 3: game returns with a different outs value — enrichment state is re-initialized,
    // so tick 3 is a "first tick" again and should NOT enrich
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(2));

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks(); // tick 1

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 2 (empty)

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 3 (game returns — first tick for new state)

    expect(mockFetchGameFeed).not.toHaveBeenCalled();
    scheduler.stop();
  });
});

// ---------------------------------------------------------------------------
// game-events emission
// ---------------------------------------------------------------------------

describe('game-events emission', () => {
  it('emits a game-events batch when new plays are parsed from the feed', async () => {
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(1));
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(2)); // linescore delta
    mockFetchGameFeed.mockResolvedValueOnce(makeFeedResponse(0)); // atBatIndex 0

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks(); // tick 1

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 2

    expect(io.emit).toHaveBeenCalledWith(
      SOCKET_EVENTS.GAME_EVENTS,
      expect.objectContaining({
        gamePk: GAME_PK,
        events: expect.arrayContaining([
          expect.objectContaining({ atBatIndex: 0, eventType: 'strikeout' }),
        ]),
      })
    );
    scheduler.stop();
  });

  it('does not emit game-events when the feed returns no new plays', async () => {
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(1));
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(2));
    mockFetchGameFeed.mockResolvedValueOnce(makeEmptyFeedResponse());

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks();

    vi.runOnlyPendingTimers();
    await drainMicrotasks();

    expect(io.emit).not.toHaveBeenCalledWith(
      SOCKET_EVENTS.GAME_EVENTS,
      expect.anything()
    );
    scheduler.stop();
  });

  it('does not crash and does not advance the cursor when diffPatch returns empty (race condition)', async () => {
    // Tick 1: seed state
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(1));
    // Tick 2: linescore delta → enrichment fires, but API returns [] (not yet indexed)
    // Snapshot is deliberately NOT advanced so that tick 3 retries without needing
    // a further linescore change.
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(2));
    mockFetchGameFeed.mockResolvedValueOnce(null);
    // Tick 3: same linescore as tick 2 — enrichment still retries because snapshot is stale
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(2));
    mockFetchGameFeed.mockResolvedValueOnce(
      makeEmptyFeedResponse(FEED_TIMESTAMP_1)
    );

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks(); // tick 1

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 2: null response — no crash, snapshot held stale

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 3: retries with original cursor even though linescore unchanged

    expect(io.emit).not.toHaveBeenCalledWith(
      SOCKET_EVENTS.GAME_EVENTS,
      expect.anything()
    );
    // Cursor was not advanced after the null response, so tick 3 retries with SEED_TIMECODE
    expect(mockFetchGameFeed).toHaveBeenNthCalledWith(
      1,
      GAME_PK,
      SEED_TIMECODE
    );
    expect(mockFetchGameFeed).toHaveBeenNthCalledWith(
      2,
      GAME_PK,
      SEED_TIMECODE
    );
    scheduler.stop();
  });

  it('advances snapshot normally after a successful retry following a null response', async () => {
    // Tick 1: seed state
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(1));
    // Tick 2: linescore delta → enrichment fires, null response (race)
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(2));
    mockFetchGameFeed.mockResolvedValueOnce(null);
    // Tick 3: same linescore → enrichment retries (snapshot was stale), succeeds with an event
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(2));
    mockFetchGameFeed.mockResolvedValueOnce(
      makeFeedResponse(0, FEED_TIMESTAMP_1)
    );
    // Tick 4: same linescore → enrichment should NOT fire (snapshot now current after success)
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(2));

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks(); // tick 1

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 2: null → snapshot held stale

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 3: succeeds → snapshot advances

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 4: snapshot current → enrichment skipped

    // Only 2 fetchGameFeed calls: tick 2 (null) and tick 3 (success). Tick 4 skipped.
    expect(mockFetchGameFeed).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it('deduplicates plays: does not re-emit a play already processed in a previous tick', async () => {
    // Tick 1 → seed state
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(1));
    // Tick 2 → linescore change → atBatIndex 0 processed
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(2));
    mockFetchGameFeed.mockResolvedValueOnce(
      makeFeedResponse(0, FEED_TIMESTAMP_1)
    );
    // Tick 3 → another linescore change → feed returns same atBatIndex 0 (already seen)
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(3));
    mockFetchGameFeed.mockResolvedValueOnce(
      makeFeedResponse(0, FEED_TIMESTAMP_2)
    );

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks(); // tick 1

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 2 → emits game-events for atBatIndex 0

    (io.emit as ReturnType<typeof vi.fn>).mockClear(); // reset emit call count for clean tick 3 assertion

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 3 → atBatIndex 0 already processed, no emission

    expect(io.emit).not.toHaveBeenCalledWith(
      SOCKET_EVENTS.GAME_EVENTS,
      expect.anything()
    );
    scheduler.stop();
  });
});

// ---------------------------------------------------------------------------
// Enrichment failure resilience
// ---------------------------------------------------------------------------

describe('enrichment failure resilience', () => {
  it('still emits game-update when fetchGameFeed throws', async () => {
    // Tick 1 seeds the state
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(1));
    // Tick 2: linescore changes, but enrichment fails
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(2));
    mockFetchGameFeed.mockRejectedValueOnce(new Error('network timeout'));

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks(); // tick 1

    vi.clearAllMocks(); // reset so we can count tick 2 calls clearly
    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 2

    // Baseline update must still be emitted despite enrichment failure
    expect(io.emit).toHaveBeenCalledWith(
      SOCKET_EVENTS.GAME_UPDATE,
      expect.objectContaining({ gamePk: GAME_PK })
    );
    // No game-events should be emitted
    expect(io.emit).not.toHaveBeenCalledWith(
      SOCKET_EVENTS.GAME_EVENTS,
      expect.anything()
    );
    scheduler.stop();
  });
});

// ---------------------------------------------------------------------------
// Final game handling
// ---------------------------------------------------------------------------

describe('final game handling', () => {
  it('emits game-summary when trackingMode reaches final after a non-first tick', async () => {
    // Tick 1: live game → seeds enrichment state
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(1));
    // Tick 2: final → forces enrichment, then fetches boxscore + next-game
    mockFetchSchedule.mockResolvedValueOnce(makeFinalSchedule());
    mockFetchGameFeed.mockResolvedValueOnce(makeFeedResponse(5));
    mockFetchBoxscore.mockResolvedValueOnce(makeBoxscoreResponse());
    mockFetchNextGame.mockResolvedValueOnce(makeNextGameResponse());

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks(); // tick 1

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 2 (final)

    expect(io.emit).toHaveBeenCalledWith(
      SOCKET_EVENTS.GAME_SUMMARY,
      expect.objectContaining({
        gamePk: GAME_PK,
        finalScore: { away: 2, home: 4 },
        decisions: expect.objectContaining({
          winner: expect.objectContaining({ id: 660271 }),
          loser: expect.objectContaining({ id: 605280 }),
        }),
      })
    );
    scheduler.stop();
  });

  it('does not emit game-summary twice for consecutive final-state ticks', async () => {
    // Tick 1: live
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(1));
    // Tick 2: final → emits game-summary, tears down enrichment state
    mockFetchSchedule.mockResolvedValueOnce(makeFinalSchedule());
    mockFetchGameFeed.mockResolvedValueOnce(makeFeedResponse(5));
    mockFetchBoxscore.mockResolvedValueOnce(makeBoxscoreResponse());
    mockFetchNextGame.mockResolvedValueOnce(makeNextGameResponse());
    // Tick 3: still final → enrichment state is null, no game-summary re-emission
    mockFetchSchedule.mockResolvedValueOnce(makeFinalSchedule());

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks(); // tick 1

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 2 (final)

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 3 (still final)

    const gameSummaryCalls = (
      io.emit as ReturnType<typeof vi.fn>
    ).mock.calls.filter(([event]) => event === SOCKET_EVENTS.GAME_SUMMARY);
    expect(gameSummaryCalls).toHaveLength(1);
    scheduler.stop();
  });

  it('emits game-summary with empty topPerformers when boxscore fetch fails', async () => {
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(1));
    mockFetchSchedule.mockResolvedValueOnce(makeFinalSchedule());
    mockFetchGameFeed.mockResolvedValueOnce(makeFeedResponse(5));
    mockFetchBoxscore.mockRejectedValueOnce(new Error('boxscore unavailable'));
    mockFetchNextGame.mockResolvedValueOnce(makeNextGameResponse());

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks();

    vi.runOnlyPendingTimers();
    await drainMicrotasks();

    expect(io.emit).toHaveBeenCalledWith(
      SOCKET_EVENTS.GAME_SUMMARY,
      expect.objectContaining({ topPerformers: [] })
    );
    scheduler.stop();
  });

  it('emits game-summary with null nextGame when next-game fetch fails', async () => {
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(1));
    mockFetchSchedule.mockResolvedValueOnce(makeFinalSchedule());
    mockFetchGameFeed.mockResolvedValueOnce(makeFeedResponse(5));
    mockFetchBoxscore.mockResolvedValueOnce(makeBoxscoreResponse());
    mockFetchNextGame.mockRejectedValueOnce(new Error('schedule unavailable'));

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks();

    vi.runOnlyPendingTimers();
    await drainMicrotasks();

    expect(io.emit).toHaveBeenCalledWith(
      SOCKET_EVENTS.GAME_SUMMARY,
      expect.objectContaining({ nextGame: null })
    );
    scheduler.stop();
  });

  it('does not emit game-summary when the final enrichment fetch fails', async () => {
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(1));
    mockFetchSchedule.mockResolvedValueOnce(makeFinalSchedule());
    mockFetchGameFeed.mockRejectedValueOnce(new Error('feed unavailable'));
    mockFetchBoxscore.mockResolvedValueOnce(makeBoxscoreResponse());
    mockFetchNextGame.mockResolvedValueOnce(makeNextGameResponse());

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks();

    vi.runOnlyPendingTimers();
    await drainMicrotasks();

    expect(io.emit).not.toHaveBeenCalledWith(
      SOCKET_EVENTS.GAME_SUMMARY,
      expect.anything()
    );
    scheduler.stop();
  });

  it('does not emit game-summary when buildGameSummary throws', async () => {
    vi.spyOn(summaryParserModule, 'buildGameSummary').mockImplementationOnce(
      () => {
        throw new Error('parse error');
      }
    );
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(1));
    mockFetchSchedule.mockResolvedValueOnce(makeFinalSchedule());
    mockFetchGameFeed.mockResolvedValueOnce(makeFeedResponse(5));
    mockFetchBoxscore.mockResolvedValueOnce(makeBoxscoreResponse());
    mockFetchNextGame.mockResolvedValueOnce(makeNextGameResponse());

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks();

    vi.runOnlyPendingTimers();
    await drainMicrotasks();

    expect(io.emit).not.toHaveBeenCalledWith(
      SOCKET_EVENTS.GAME_SUMMARY,
      expect.anything()
    );
    scheduler.stop();
  });

  it('does not call fetchGameFeed when game is final on the very first tick (bootstrap guard)', async () => {
    // Service restart scenario: first tick already sees a final game.
    // Enrichment must be skipped (first tick = no snapshot) so no game-summary is emitted.
    mockFetchSchedule.mockResolvedValueOnce(makeFinalSchedule());

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks();

    expect(mockFetchGameFeed).not.toHaveBeenCalled();
    expect(io.emit).not.toHaveBeenCalledWith(
      SOCKET_EVENTS.GAME_SUMMARY,
      expect.anything()
    );
    scheduler.stop();
  });

  it('emits game-update(final) but neither game-events nor game-summary when game is already final on first tick', async () => {
    // The service may restart after a game has ended. The scheduler should
    // surface the final state to clients via game-update, but must not emit
    // game-events or game-summary — enrichment state is never initialised for
    // a game that arrives in final state on the first tick.
    mockFetchSchedule.mockResolvedValueOnce(makeFinalSchedule());

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks();

    expect(io.emit).toHaveBeenCalledWith(
      SOCKET_EVENTS.GAME_UPDATE,
      expect.objectContaining({ trackingMode: 'final' })
    );
    expect(io.emit).not.toHaveBeenCalledWith(
      SOCKET_EVENTS.GAME_EVENTS,
      expect.anything()
    );
    expect(io.emit).not.toHaveBeenCalledWith(
      SOCKET_EVENTS.GAME_SUMMARY,
      expect.anything()
    );
    scheduler.stop();
  });
});

// ---------------------------------------------------------------------------
// toTimecode utility
// ---------------------------------------------------------------------------

describe('toTimecode', () => {
  it('converts ISO 8601 UTC to YYYYMMDD_HHmmss format', async () => {
    const { toTimecode } = await import('./mlb-scheduler.ts');
    expect(toTimecode('2026-04-15T22:10:00Z')).toBe('20260415_221000');
    expect(toTimecode('2026-01-01T00:00:00Z')).toBe('20260101_000000');
    expect(toTimecode('2026-12-31T23:59:59Z')).toBe('20261231_235959');
  });
});

// ---------------------------------------------------------------------------
// Scheduler API — getLastUpdate
// ---------------------------------------------------------------------------

describe('getLastUpdate', () => {
  it('returns null before any game-update is emitted', async () => {
    mockFetchSchedule.mockResolvedValueOnce(makeEmptySchedule());
    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks();

    expect(scheduler.getLastUpdate()).toBeNull();
    scheduler.stop();
  });

  it('returns the most recently emitted game-update payload', async () => {
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule());
    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks();

    const lastUpdate = scheduler.getLastUpdate();
    expect(lastUpdate).not.toBeNull();
    expect(lastUpdate?.gamePk).toBe(GAME_PK);
    expect(lastUpdate?.trackingMode).toBe('outs');
    scheduler.stop();
  });
});

// ---------------------------------------------------------------------------
// Poll interval scheduling
// ---------------------------------------------------------------------------

/** Schedule fixture that puts NYM (home, 121) in a between-innings state. */
function makeBetweenInningsSchedule(): ScheduleResponse {
  return {
    dates: [
      {
        date: '2026-04-15',
        games: [
          {
            gamePk: GAME_PK,
            gameDate: GAME_DATE,
            status: { detailedState: 'In Progress', abstractGameState: 'Live' },
            inningBreakLength: 120,
            teams: {
              away: {
                team: {
                  id: LAD_ID,
                  name: 'Los Angeles Dodgers',
                  abbreviation: 'LAD',
                },
                score: 0,
                leagueRecord: { wins: 3, losses: 2 },
              },
              home: {
                team: {
                  id: NYM_ID,
                  name: 'New York Mets',
                  abbreviation: 'NYM',
                },
                score: 0,
                leagueRecord: { wins: 3, losses: 2 },
              },
            },
            linescore: {
              currentInning: 3,
              currentInningOrdinal: '3rd',
              inningState: 'Middle', // ← between-innings
              scheduledInnings: 9,
              outs: 3,
              balls: 0,
              strikes: 0,
              teams: {
                home: { runs: 0, hits: 0, errors: 0 },
                away: { runs: 0, hits: 0, errors: 0 },
              },
              defense: { pitcher: { id: 660271, fullName: 'Shohei Ohtani' } },
            },
          },
        ],
      },
    ],
  };
}

/** Schedule fixture where NYM (home, 121) is batting in regular innings. */
function makeBattingSchedule(): ScheduleResponse {
  return {
    dates: [
      {
        date: '2026-04-15',
        games: [
          {
            gamePk: GAME_PK,
            gameDate: GAME_DATE,
            status: { detailedState: 'In Progress', abstractGameState: 'Live' },
            inningBreakLength: 120,
            teams: {
              away: {
                team: {
                  id: LAD_ID,
                  name: 'Los Angeles Dodgers',
                  abbreviation: 'LAD',
                },
                score: 0,
                leagueRecord: { wins: 3, losses: 2 },
              },
              home: {
                team: {
                  id: NYM_ID,
                  name: 'New York Mets',
                  abbreviation: 'NYM',
                },
                score: 0,
                leagueRecord: { wins: 3, losses: 2 },
              },
            },
            linescore: {
              currentInning: 3,
              currentInningOrdinal: '3rd',
              inningState: 'Bottom', // ← NYM (home) batting
              scheduledInnings: 9,
              outs: 1,
              balls: 0,
              strikes: 0,
              teams: {
                home: { runs: 0, hits: 0, errors: 0 },
                away: { runs: 0, hits: 0, errors: 0 },
              },
              defense: {
                pitcher: { id: 596019, fullName: 'Francisco Lindor' },
              },
              offense: { batter: { id: 660271, fullName: 'Shohei Ohtani' } },
            },
          },
        ],
      },
    ],
  };
}

describe('poll interval scheduling', () => {
  it('schedules next tick at between-innings interval when trackingMode is between-innings', async () => {
    // inningBreakLength:120 + BETWEEN_INNINGS_BUFFER_S:15 = 135s
    mockFetchSchedule.mockResolvedValue(makeBetweenInningsSchedule());
    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks(); // first tick settles
    expect(mockFetchSchedule).toHaveBeenCalledTimes(1);

    // Advance to just before the 135s threshold — second tick must not have fired
    vi.advanceTimersByTime(134_999);
    await drainMicrotasks();
    expect(mockFetchSchedule).toHaveBeenCalledTimes(1);

    // Cross the threshold — second tick fires
    vi.advanceTimersByTime(1);
    await drainMicrotasks();
    expect(mockFetchSchedule).toHaveBeenCalledTimes(2);

    scheduler.stop();
  });

  it('schedules next tick at batting interval when trackingMode is batting', async () => {
    // BATTING_POLL_INTERVAL: 30s
    mockFetchSchedule.mockResolvedValue(makeBattingSchedule());
    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks();
    expect(mockFetchSchedule).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(29_999);
    await drainMicrotasks();
    expect(mockFetchSchedule).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    await drainMicrotasks();
    expect(mockFetchSchedule).toHaveBeenCalledTimes(2);

    scheduler.stop();
  });
});

// ---------------------------------------------------------------------------
// Error handling — initial tick failure
// ---------------------------------------------------------------------------

describe('error handling', () => {
  it('swallows an unhandled error thrown during the initial loop tick', async () => {
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule());
    const io = createMockIo();

    // Make io.emit throw on its very first call (the game-update emission).
    // This simulates a broken socket connection on startup, causing loop() to
    // reject and triggering the outer catch at the bottom of startScheduler().
    (io.emit as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error('socket broken');
    });

    // startScheduler must not throw; the error is caught internally
    expect(() => startScheduler(io)).not.toThrow();
    const scheduler = startScheduler(io);
    await drainMicrotasks();

    // Stop the second scheduler (which ran cleanly) without error
    scheduler.stop();
  });
});

// ---------------------------------------------------------------------------
// Live at-bat state (atBat field on game-update)
// ---------------------------------------------------------------------------

describe('live at-bat state', () => {
  it('emits game-update with atBat: null when feed/live returns currentPlay: null', async () => {
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule());
    // Default mock returns currentPlay: null → atBat: null

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks();

    expect(io.emit).toHaveBeenCalledWith(
      SOCKET_EVENTS.GAME_UPDATE,
      expect.objectContaining({ gamePk: GAME_PK, atBat: null }),
    );
    scheduler.stop();
  });

  it('populates atBat from feed/live when game is active and currentPlay is present', async () => {
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule());
    mockFetchGameFeedLive.mockResolvedValueOnce(makeGameFeedLiveResponse({
      currentPlay: {
        about: { atBatIndex: 12, halfInning: 'top', inning: 3, isComplete: false },
        count: { balls: 1, strikes: 0, outs: 1 },
        matchup: {
          batter: { id: 596019, fullName: 'Francisco Lindor' },
          pitcher: { id: 660271, fullName: 'Shohei Ohtani' },
          batSide: { code: 'R' },
          pitchHand: { code: 'R' },
        },
        playEvents: [],
      },
    }));

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks();

    expect(io.emit).toHaveBeenCalledWith(
      SOCKET_EVENTS.GAME_UPDATE,
      expect.objectContaining({
        gamePk: GAME_PK,
        atBat: expect.objectContaining({
          batter: expect.objectContaining({ id: 596019, fullName: 'Francisco Lindor' }),
          pitcher: expect.objectContaining({ id: 660271, fullName: 'Shohei Ohtani' }),
          batSide: 'R',
          pitchHand: 'R',
          count: { balls: 1, strikes: 0 },
          pitchSequence: [],
        }),
      }),
    );
    scheduler.stop();
  });

  it('emits atBat: null when trackingMode is between-innings', async () => {
    mockFetchSchedule.mockResolvedValueOnce(makeBetweenInningsSchedule());

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks();

    expect(io.emit).toHaveBeenCalledWith(
      SOCKET_EVENTS.GAME_UPDATE,
      expect.objectContaining({ trackingMode: 'between-innings', atBat: null }),
    );
    // feed/live must NOT be called for between-innings
    expect(mockFetchGameFeedLive).not.toHaveBeenCalled();
    scheduler.stop();
  });

  it('emits atBat: null when trackingMode is final', async () => {
    // Skip enrichment on first tick, then final on second
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(1));
    mockFetchSchedule.mockResolvedValueOnce(makeFinalSchedule());
    mockFetchGameFeed.mockResolvedValueOnce(makeFeedResponse(5));
    mockFetchBoxscore.mockResolvedValueOnce(makeBoxscoreResponse());
    mockFetchNextGame.mockResolvedValueOnce(makeNextGameResponse());

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks(); // tick 1

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 2 (final)

    const gameUpdateCalls = (io.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([event]) => event === SOCKET_EVENTS.GAME_UPDATE,
    );
    const finalUpdate = gameUpdateCalls.find(
      ([, payload]) => (payload as { trackingMode: string }).trackingMode === 'final',
    );
    expect(finalUpdate).toBeDefined();
    expect(finalUpdate![1]).toMatchObject({ trackingMode: 'final', atBat: null });
    scheduler.stop();
  });

  it('emits game-update with atBat: null and does not suppress it when feed/live throws', async () => {
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule());
    mockFetchGameFeedLive.mockRejectedValueOnce(new Error('live feed unavailable'));

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks();

    // game-update must still be emitted despite the feed/live failure
    expect(io.emit).toHaveBeenCalledWith(
      SOCKET_EVENTS.GAME_UPDATE,
      expect.objectContaining({ gamePk: GAME_PK, atBat: null }),
    );
    scheduler.stop();
  });

  it('emits atBat: null when currentPlay.isComplete is true', async () => {
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule());
    mockFetchGameFeedLive.mockResolvedValueOnce(makeGameFeedLiveResponse({
      currentPlay: {
        about: { atBatIndex: 12, halfInning: 'top', inning: 3, isComplete: true },
        count: { balls: 3, strikes: 2, outs: 2 },
        matchup: {
          batter: { id: 596019, fullName: 'Francisco Lindor' },
          pitcher: { id: 660271, fullName: 'Shohei Ohtani' },
          batSide: { code: 'L' },
          pitchHand: { code: 'R' },
        },
        playEvents: [],
      },
    }));

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks();

    expect(io.emit).toHaveBeenCalledWith(
      SOCKET_EVENTS.GAME_UPDATE,
      expect.objectContaining({ gamePk: GAME_PK, atBat: null }),
    );
    scheduler.stop();
  });
});
