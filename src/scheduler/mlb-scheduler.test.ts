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
    CORS_ORIGIN: '*',
    PORT: 4000,
    DEV_MODE: false,
  },
}));

// VenueClient is a class — use vi.hoisted so the mock fn reference is available
// inside the vi.mock factory and in test bodies.
const mockFetchFieldInfo = vi.hoisted(() => vi.fn());
vi.mock('./venue-client.ts', () => ({
  VenueClient: class {
    fetchFieldInfo = mockFetchFieldInfo;
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
import type {
  GameFeedResponse,
  AllPlay,
  LiveBoxscorePlayer,
  GameFeedLiveResponse,
} from './game-feed-types.ts';
import type { VenueFieldInfo } from './venue-client.ts';
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
  // Default: venue fetch returns null (no venue data). Tests that exercise
  // venue behaviour override this per-test.
  mockFetchFieldInfo.mockResolvedValue(null);
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
      expect.objectContaining({ gamePk: GAME_PK, trackingMode: 'live' })
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
    expect(lastUpdate?.trackingMode).toBe('live');
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
describe('poll interval scheduling', () => {
  it('schedules next tick at ACTIVE_POLL_INTERVAL when trackingMode is live', async () => {
    // ACTIVE_POLL_INTERVAL: 10s — 'live' mode polls at the active rate every tick
    mockFetchSchedule.mockResolvedValue(makeLiveSchedule());
    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks();
    expect(mockFetchSchedule).toHaveBeenCalledTimes(1);

    // Advance to just before the 10s threshold — second tick must not have fired
    vi.advanceTimersByTime(9_999);
    await drainMicrotasks();
    expect(mockFetchSchedule).toHaveBeenCalledTimes(1);

    // Cross the threshold — second tick fires
    vi.advanceTimersByTime(1);
    await drainMicrotasks();
    expect(mockFetchSchedule).toHaveBeenCalledTimes(2);

    scheduler.stop();
  });

  it('schedules next tick at IDLE_POLL_INTERVAL when trackingMode is between-innings', async () => {
    // IDLE_POLL_INTERVAL: 60s — breaks last 2+ minutes; no need to poll at
    // the active rate when no new live tick can possibly be emitted.
    mockFetchSchedule.mockResolvedValue(makeBetweenInningsSchedule());
    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks(); // first tick settles
    expect(mockFetchSchedule).toHaveBeenCalledTimes(1);

    // Advance to just before the 60s threshold — second tick must not have fired
    vi.advanceTimersByTime(59_999);
    await drainMicrotasks();
    expect(mockFetchSchedule).toHaveBeenCalledTimes(1);

    // Cross the threshold — second tick fires
    vi.advanceTimersByTime(1);
    await drainMicrotasks();
    expect(mockFetchSchedule).toHaveBeenCalledTimes(2);

    scheduler.stop();
  });

  it('emits between-innings at most once per transition (single-emit guard)', async () => {
    // Tick 1: between-innings → emits once
    mockFetchSchedule.mockResolvedValueOnce(makeBetweenInningsSchedule());
    // Tick 2: still between-innings (same state) → must NOT emit again
    mockFetchSchedule.mockResolvedValueOnce(makeBetweenInningsSchedule());

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks(); // tick 1

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 2

    const updateCalls = (io.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([event]) => event === SOCKET_EVENTS.GAME_UPDATE
    );
    // between-innings is a single-emit mode — a second consecutive tick with
    // the same trackingMode must not produce a second emission.
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]![1]).toMatchObject({
      trackingMode: 'between-innings',
    });
    scheduler.stop();
  });
});

// ---------------------------------------------------------------------------
// AtBat state persistence
// ---------------------------------------------------------------------------

describe('atBat state persistence', () => {
  it('emits previous atBat when parseCurrentPlay returns null during live mode', async () => {
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule());
    // Tick 1: populated atBat
    mockFetchGameFeedLive.mockResolvedValueOnce(
      makeGameFeedLiveResponse({
        currentPlay: {
          about: {
            atBatIndex: 5,
            halfInning: 'top',
            inning: 3,
            isComplete: false,
          },
          count: { balls: 1, strikes: 1, outs: 1 },
          matchup: {
            batter: { id: 100, fullName: 'Batter One' },
            pitcher: { id: 660271, fullName: 'Shohei Ohtani' },
            batSide: { code: 'R' },
            pitchHand: { code: 'R' },
          },
          playEvents: [],
        },
      })
    );
    // Tick 2: live feed returns null (completed play gap)
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(2));
    mockFetchGameFeedLive.mockResolvedValueOnce(makeGameFeedLiveResponse());

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks(); // tick 1

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 2

    const updateCalls = (io.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([event]) => event === SOCKET_EVENTS.GAME_UPDATE
    );
    const tick2Update = updateCalls[updateCalls.length - 1]![1] as {
      trackingMode: string;
      atBat: { batter: { id: number } } | null;
    };
    expect(tick2Update.trackingMode).toBe('live');
    // Previous atBat persisted — not null
    expect(tick2Update.atBat).not.toBeNull();
    expect(tick2Update.atBat?.batter.id).toBe(100);
    scheduler.stop();
  });

  it('emits atBat: null when parseCurrentPlay returns null during between-innings', async () => {
    // First tick: live with atBat populated
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule());
    mockFetchGameFeedLive.mockResolvedValueOnce(
      makeGameFeedLiveResponse({
        currentPlay: {
          about: {
            atBatIndex: 5,
            halfInning: 'top',
            inning: 3,
            isComplete: false,
          },
          count: { balls: 1, strikes: 1, outs: 1 },
          matchup: {
            batter: { id: 100, fullName: 'Batter One' },
            pitcher: { id: 660271, fullName: 'Shohei Ohtani' },
            batSide: { code: 'R' },
            pitchHand: { code: 'R' },
          },
          playEvents: [],
        },
      })
    );
    // Second tick: between-innings (feed/live not called; atBat is null)
    // Linescore delta fires between tick 1 (outs=1) and tick 2 (outs=3), so
    // enrichment is triggered — supply an empty feed response to satisfy the mock.
    mockFetchSchedule.mockResolvedValueOnce(makeBetweenInningsSchedule());
    mockFetchGameFeed.mockResolvedValueOnce(makeEmptyFeedResponse());

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks(); // tick 1

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 2 (between-innings)

    const updateCalls = (io.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([event]) => event === SOCKET_EVENTS.GAME_UPDATE
    );
    const tick2Update = updateCalls[updateCalls.length - 1]![1] as {
      trackingMode: string;
      atBat: unknown;
    };
    expect(tick2Update.trackingMode).toBe('between-innings');
    expect(tick2Update.atBat).toBeNull();
    scheduler.stop();
  });

  it('emits atBat: null during final even when lastAtBat is set', async () => {
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(1));
    mockFetchGameFeedLive.mockResolvedValueOnce(
      makeGameFeedLiveResponse({
        currentPlay: {
          about: {
            atBatIndex: 5,
            halfInning: 'top',
            inning: 9,
            isComplete: false,
          },
          count: { balls: 0, strikes: 2, outs: 2 },
          matchup: {
            batter: { id: 200, fullName: 'Batter Two' },
            pitcher: { id: 660271, fullName: 'Shohei Ohtani' },
            batSide: { code: 'L' },
            pitchHand: { code: 'R' },
          },
          playEvents: [],
        },
      })
    );
    mockFetchSchedule.mockResolvedValueOnce(makeFinalSchedule());
    mockFetchGameFeed.mockResolvedValueOnce(makeFeedResponse(5));
    mockFetchBoxscore.mockResolvedValueOnce(makeBoxscoreResponse());
    mockFetchNextGame.mockResolvedValueOnce(makeNextGameResponse());

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks(); // tick 1

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 2 (final)

    const updateCalls = (io.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([event]) => event === SOCKET_EVENTS.GAME_UPDATE
    );
    const finalUpdate = updateCalls.find(
      ([, payload]) =>
        (payload as { trackingMode: string }).trackingMode === 'final'
    );
    expect(finalUpdate).toBeDefined();
    expect((finalUpdate![1] as { atBat: unknown }).atBat).toBeNull();
    scheduler.stop();
  });

  it('updates lastAtBat when parseCurrentPlay returns a new atBat', async () => {
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule());
    mockFetchGameFeedLive.mockResolvedValueOnce(
      makeGameFeedLiveResponse({
        currentPlay: {
          about: {
            atBatIndex: 7,
            halfInning: 'top',
            inning: 4,
            isComplete: false,
          },
          count: { balls: 2, strikes: 0, outs: 0 },
          matchup: {
            batter: { id: 300, fullName: 'New Batter' },
            pitcher: { id: 660271, fullName: 'Shohei Ohtani' },
            batSide: { code: 'L' },
            pitchHand: { code: 'R' },
          },
          playEvents: [],
        },
      })
    );

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks();

    expect(io.emit).toHaveBeenCalledWith(
      SOCKET_EVENTS.GAME_UPDATE,
      expect.objectContaining({
        atBat: expect.objectContaining({
          batter: expect.objectContaining({ id: 300 }),
        }),
      })
    );
    scheduler.stop();
  });

  it('clears lastAtBat on transition to between-innings (stale data must not leak)', async () => {
    // Tick 1: live with atBat
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule());
    mockFetchGameFeedLive.mockResolvedValueOnce(
      makeGameFeedLiveResponse({
        currentPlay: {
          about: {
            atBatIndex: 3,
            halfInning: 'top',
            inning: 2,
            isComplete: false,
          },
          count: { balls: 0, strikes: 0, outs: 0 },
          matchup: {
            batter: { id: 400, fullName: 'Old Batter' },
            pitcher: { id: 660271, fullName: 'Shohei Ohtani' },
            batSide: { code: 'R' },
            pitchHand: { code: 'R' },
          },
          playEvents: [],
        },
      })
    );
    // Tick 2: between-innings
    // Linescore delta fires (outs=1 → outs=3), so enrichment is triggered —
    // supply an empty feed response to prevent a mock-not-set-up error.
    mockFetchSchedule.mockResolvedValueOnce(makeBetweenInningsSchedule());
    mockFetchGameFeed.mockResolvedValueOnce(makeEmptyFeedResponse());
    // Tick 3: back to live with null atBat (should not reuse tick 1 atBat).
    // outs=2 on tick 3 vs outs=3 on tick 2 triggers linescore delta; supply an
    // empty feed response to prevent a mock-not-set-up error.
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(2));
    mockFetchGameFeed.mockResolvedValueOnce(makeEmptyFeedResponse());
    mockFetchGameFeedLive.mockResolvedValueOnce(makeGameFeedLiveResponse());

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks(); // tick 1

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 2 (between-innings — clears lastAtBat)

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 3 (live, no current atBat)

    const updateCalls = (io.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([event]) => event === SOCKET_EVENTS.GAME_UPDATE
    );
    const tick3Update = updateCalls[updateCalls.length - 1]![1] as {
      trackingMode: string;
      atBat: unknown;
    };
    expect(tick3Update.trackingMode).toBe('live');
    // lastAtBat was cleared on between-innings — must not reuse tick 1's atBat
    expect(tick3Update.atBat).toBeNull();
    scheduler.stop();
  });

  it('emits atBat: null when feed/live fetch fails (stale atBat must not be served)', async () => {
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule());
    // Tick 1: live feed succeeds with a populated atBat
    mockFetchGameFeedLive.mockResolvedValueOnce(
      makeGameFeedLiveResponse({
        currentPlay: {
          about: {
            atBatIndex: 5,
            halfInning: 'top',
            inning: 3,
            isComplete: false,
          },
          count: { balls: 1, strikes: 1, outs: 1 },
          matchup: {
            batter: { id: 100, fullName: 'Batter One' },
            pitcher: { id: 660271, fullName: 'Shohei Ohtani' },
            batSide: { code: 'R' },
            pitchHand: { code: 'R' },
          },
          playEvents: [],
        },
      })
    );
    // Tick 2: same linescore (no delta → shouldEnrich=false, avoiding an
    // unmocked fetchGameFeed call). Live feed throws — stale atBat must NOT be served.
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule());
    mockFetchGameFeedLive.mockRejectedValueOnce(new Error('network error'));

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks(); // tick 1

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 2

    const updateCalls = (io.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([event]) => event === SOCKET_EVENTS.GAME_UPDATE
    );
    const tick2Update = updateCalls[updateCalls.length - 1]![1] as {
      trackingMode: string;
      atBat: unknown;
    };
    expect(tick2Update.trackingMode).toBe('live');
    // Fetch failure must not serve stale atBat
    expect(tick2Update.atBat).toBeNull();
    scheduler.stop();
  });

  it('clears lastAtBat when gamePk changes (new game)', async () => {
    // Tick 1: game 823963 with atBat
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule());
    mockFetchGameFeedLive.mockResolvedValueOnce(
      makeGameFeedLiveResponse({
        currentPlay: {
          about: {
            atBatIndex: 1,
            halfInning: 'top',
            inning: 1,
            isComplete: false,
          },
          count: { balls: 0, strikes: 0, outs: 0 },
          matchup: {
            batter: { id: 500, fullName: 'Old Game Batter' },
            pitcher: { id: 660271, fullName: 'Shohei Ohtani' },
            batSide: { code: 'R' },
            pitchHand: { code: 'R' },
          },
          playEvents: [],
        },
      })
    );
    // Tick 2: new game (824100), null atBat — must NOT reuse old game's atBat
    mockFetchSchedule.mockResolvedValueOnce(makeNewGameSchedule());
    mockFetchGameFeedLive.mockResolvedValueOnce(makeGameFeedLiveResponse());

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks(); // tick 1

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 2 (new game)

    const updateCalls = (io.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([event]) => event === SOCKET_EVENTS.GAME_UPDATE
    );
    const tick2Update = updateCalls[updateCalls.length - 1]![1] as {
      gamePk: number;
      atBat: unknown;
    };
    expect(tick2Update.gamePk).toBe(824100);
    expect(tick2Update.atBat).toBeNull();
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
      expect.objectContaining({ gamePk: GAME_PK, atBat: null })
    );
    scheduler.stop();
  });

  it('populates atBat from feed/live when game is active and currentPlay is present', async () => {
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule());
    mockFetchGameFeedLive.mockResolvedValueOnce(
      makeGameFeedLiveResponse({
        currentPlay: {
          about: {
            atBatIndex: 12,
            halfInning: 'top',
            inning: 3,
            isComplete: false,
          },
          count: { balls: 1, strikes: 0, outs: 1 },
          matchup: {
            batter: { id: 596019, fullName: 'Francisco Lindor' },
            pitcher: { id: 660271, fullName: 'Shohei Ohtani' },
            batSide: { code: 'R' },
            pitchHand: { code: 'R' },
          },
          playEvents: [],
        },
      })
    );

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks();

    expect(io.emit).toHaveBeenCalledWith(
      SOCKET_EVENTS.GAME_UPDATE,
      expect.objectContaining({
        gamePk: GAME_PK,
        atBat: expect.objectContaining({
          batter: expect.objectContaining({
            id: 596019,
            fullName: 'Francisco Lindor',
          }),
          pitcher: expect.objectContaining({
            id: 660271,
            fullName: 'Shohei Ohtani',
          }),
          batSide: 'R',
          pitchHand: 'R',
          count: { balls: 1, strikes: 0 },
          pitchSequence: [],
        }),
      })
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
      expect.objectContaining({ trackingMode: 'between-innings', atBat: null })
    );
    // feed/live is NOT called for the atBat path (shouldFetchAtBat=false).
    // It IS called by emitBreakSummary for highlights — exactly one call.
    expect(mockFetchGameFeedLive).toHaveBeenCalledOnce();
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

    const gameUpdateCalls = (
      io.emit as ReturnType<typeof vi.fn>
    ).mock.calls.filter(([event]) => event === SOCKET_EVENTS.GAME_UPDATE);
    const finalUpdate = gameUpdateCalls.find(
      ([, payload]) =>
        (payload as { trackingMode: string }).trackingMode === 'final'
    );
    expect(finalUpdate).toBeDefined();
    expect(finalUpdate![1]).toMatchObject({
      trackingMode: 'final',
      atBat: null,
    });
    scheduler.stop();
  });

  it('emits game-update with atBat: null and does not suppress it when feed/live throws', async () => {
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule());
    mockFetchGameFeedLive.mockRejectedValueOnce(
      new Error('live feed unavailable')
    );

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks();

    // game-update must still be emitted despite the feed/live failure
    expect(io.emit).toHaveBeenCalledWith(
      SOCKET_EVENTS.GAME_UPDATE,
      expect.objectContaining({ gamePk: GAME_PK, atBat: null })
    );
    scheduler.stop();
  });

  it('emits atBat: null when currentPlay.isComplete is true', async () => {
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule());
    mockFetchGameFeedLive.mockResolvedValueOnce(
      makeGameFeedLiveResponse({
        currentPlay: {
          about: {
            atBatIndex: 12,
            halfInning: 'top',
            inning: 3,
            isComplete: true,
          },
          count: { balls: 3, strikes: 2, outs: 2 },
          matchup: {
            batter: { id: 596019, fullName: 'Francisco Lindor' },
            pitcher: { id: 660271, fullName: 'Shohei Ohtani' },
            batSide: { code: 'L' },
            pitchHand: { code: 'R' },
          },
          playEvents: [],
        },
      })
    );

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks();

    expect(io.emit).toHaveBeenCalledWith(
      SOCKET_EVENTS.GAME_UPDATE,
      expect.objectContaining({ gamePk: GAME_PK, atBat: null })
    );
    scheduler.stop();
  });
});

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Venue field info
// ---------------------------------------------------------------------------

const VENUE_ID = 3289; // Citi Field

/** Schedule fixture with a venueId for venue-fetch tests. */
function makeLiveScheduleWithVenue(
  venueId: number,
  outs = 1
): ScheduleResponse {
  const schedule = makeLiveSchedule(outs);
  schedule.dates[0]!.games[0]!.venue = { id: venueId, name: 'Citi Field' };
  return schedule;
}

/** A minimal VenueFieldInfo result. */
function makeVenueFieldInfo(venueId = VENUE_ID): VenueFieldInfo {
  return {
    venueId,
    leftLine: 335,
    leftCenter: 383,
    center: 404,
    rightCenter: 383,
    rightLine: 330,
  };
}

describe('venue field info', () => {
  it('calls fetchFieldInfo when a new venueId is seen', async () => {
    mockFetchSchedule.mockResolvedValueOnce(
      makeLiveScheduleWithVenue(VENUE_ID)
    );
    mockFetchFieldInfo.mockResolvedValueOnce(makeVenueFieldInfo());
    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks();

    expect(mockFetchFieldInfo).toHaveBeenCalledOnce();
    expect(mockFetchFieldInfo).toHaveBeenCalledWith(VENUE_ID);
    scheduler.stop();
  });

  it('populates venueFieldInfo on game-update when fetch succeeds', async () => {
    mockFetchSchedule.mockResolvedValueOnce(
      makeLiveScheduleWithVenue(VENUE_ID)
    );
    mockFetchFieldInfo.mockResolvedValueOnce(makeVenueFieldInfo());
    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks();

    expect(io.emit).toHaveBeenCalledWith(
      SOCKET_EVENTS.GAME_UPDATE,
      expect.objectContaining({
        venueFieldInfo: expect.objectContaining({
          venueId: VENUE_ID,
          center: 404,
        }),
      })
    );
    scheduler.stop();
  });

  it('retries fetchFieldInfo on the next tick when it returns null', async () => {
    // Tick 1: fetch returns null (transient failure)
    mockFetchSchedule.mockResolvedValueOnce(
      makeLiveScheduleWithVenue(VENUE_ID)
    );
    mockFetchFieldInfo.mockResolvedValueOnce(null);
    // Tick 2: same venueId — must retry
    mockFetchSchedule.mockResolvedValueOnce(
      makeLiveScheduleWithVenue(VENUE_ID)
    );
    mockFetchFieldInfo.mockResolvedValueOnce(makeVenueFieldInfo());
    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks(); // tick 1

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 2

    expect(mockFetchFieldInfo).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it('does not re-fetch after a successful result for the same venueId', async () => {
    // Tick 1: fetch succeeds
    mockFetchSchedule.mockResolvedValueOnce(
      makeLiveScheduleWithVenue(VENUE_ID)
    );
    mockFetchFieldInfo.mockResolvedValueOnce(makeVenueFieldInfo());
    // Tick 2: same venueId — must NOT re-fetch
    mockFetchSchedule.mockResolvedValueOnce(
      makeLiveScheduleWithVenue(VENUE_ID, 2)
    );
    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks(); // tick 1

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 2

    expect(mockFetchFieldInfo).toHaveBeenCalledOnce();
    scheduler.stop();
  });

  it('emits venueFieldInfo: null when venueId becomes null', async () => {
    // Tick 1: venueId present, fetch succeeds
    mockFetchSchedule.mockResolvedValueOnce(
      makeLiveScheduleWithVenue(VENUE_ID)
    );
    mockFetchFieldInfo.mockResolvedValueOnce(makeVenueFieldInfo());
    // Tick 2: no venueId → venueFieldInfo cleared
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule());
    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks(); // tick 1

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 2

    const updateCalls = (io.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([event]) => event === SOCKET_EVENTS.GAME_UPDATE
    );
    const tick2Update = updateCalls[updateCalls.length - 1]![1] as {
      venueFieldInfo: VenueFieldInfo | null;
    };
    expect(tick2Update.venueFieldInfo).toBeNull();
    scheduler.stop();
  });
});

// ---------------------------------------------------------------------------
// Pitcher stats accumulation
// ---------------------------------------------------------------------------

const PITCHER_ID = 660271; // Shohei Ohtani (matches makeLiveSchedule defense.pitcher)

/** Builds an AllPlay for PITCHER_ID with the given pitch sequence. */
function makeAllPlayWithPitches(
  atBatIndex: number,
  pitches: Array<{ isStrike: boolean; isBall: boolean; isInPlay?: boolean }>
): AllPlay {
  return {
    atBatIndex,
    result: {
      eventType: 'strikeout',
      description: 'Francisco Lindor strikes out swinging.',
      rbi: 0,
    },
    about: {
      atBatIndex,
      halfInning: 'top',
      inning: 3,
      isComplete: true,
      isScoringPlay: false,
    },
    matchup: {
      batter: { id: 596019, fullName: 'Francisco Lindor' },
      pitcher: { id: PITCHER_ID, fullName: 'Shohei Ohtani' },
    },
    playEvents: pitches.map((p, i) => ({
      type: 'pitch',
      isPitch: true,
      pitchNumber: i + 1,
      details: {
        description: p.isStrike
          ? 'Called Strike'
          : p.isInPlay
            ? 'In play, out(s)'
            : 'Ball',
        type: { code: 'FF', description: 'Four-Seam Fastball' },
        isStrike: p.isStrike,
        isBall: p.isBall,
        isInPlay: p.isInPlay ?? false,
      },
      count: { balls: 0, strikes: 0 },
    })),
  };
}

describe('pitcher stats accumulation', () => {
  it('reflects cumulative pitchesThrown from allPlays each tick', async () => {
    // Tick 1: seeds enrichment state, feed/live has no allPlays yet
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(1));
    // Tick 2: allPlays grows to 3 pitches (2 strikes, 1 ball)
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(2));
    mockFetchGameFeed.mockResolvedValueOnce(
      makeEmptyFeedResponse(FEED_TIMESTAMP_1)
    );
    // Tick 1 also fires feed/live — queue a default so tick 2's allPlays lands on tick 2.
    mockFetchGameFeedLive.mockResolvedValueOnce(makeGameFeedLiveResponse());
    mockFetchGameFeedLive.mockResolvedValueOnce(
      makeGameFeedLiveResponse({
        allPlays: [
          makeAllPlayWithPitches(0, [
            { isStrike: true, isBall: false },
            { isStrike: false, isBall: true },
            { isStrike: true, isBall: false },
          ]),
        ],
      })
    );
    // Tick 3: allPlays cumulates to 5 pitches total (2 more: 1 strike, 1 ball)
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(3));
    mockFetchGameFeed.mockResolvedValueOnce(
      makeEmptyFeedResponse(FEED_TIMESTAMP_2)
    );
    mockFetchGameFeedLive.mockResolvedValueOnce(
      makeGameFeedLiveResponse({
        allPlays: [
          makeAllPlayWithPitches(0, [
            { isStrike: true, isBall: false },
            { isStrike: false, isBall: true },
            { isStrike: true, isBall: false },
          ]),
          makeAllPlayWithPitches(1, [
            { isStrike: true, isBall: false },
            { isStrike: false, isBall: true },
          ]),
        ],
      })
    );

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks(); // tick 1: seeds state

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 2: 3 pitches in allPlays

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 3: 5 cumulative pitches in allPlays

    // After tick 3, currentPitcher.pitchesThrown must reflect all 5 pitches.
    const updateCalls = (io.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([event]) => event === SOCKET_EVENTS.GAME_UPDATE
    );
    const tick3Update = updateCalls[updateCalls.length - 1]![1] as {
      currentPitcher: {
        pitchesThrown: number;
        strikes: number;
        balls: number;
      } | null;
    };
    expect(tick3Update.currentPitcher).not.toBeNull();
    expect(tick3Update.currentPitcher!.pitchesThrown).toBe(5);
    expect(tick3Update.currentPitcher!.strikes).toBe(3);
    expect(tick3Update.currentPitcher!.balls).toBe(2);
    scheduler.stop();
  });

  it('reflects cumulative pitchHistory from allPlays each tick', async () => {
    // Tick 1: seeds state
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(1));
    // Tick 2: 2 pitches in allPlays
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(2));
    mockFetchGameFeed.mockResolvedValueOnce(
      makeEmptyFeedResponse(FEED_TIMESTAMP_1)
    );
    // Tick 1 also fires feed/live — queue a default so tick 2's allPlays lands on tick 2.
    mockFetchGameFeedLive.mockResolvedValueOnce(makeGameFeedLiveResponse());
    mockFetchGameFeedLive.mockResolvedValueOnce(
      makeGameFeedLiveResponse({
        allPlays: [
          makeAllPlayWithPitches(0, [
            { isStrike: true, isBall: false },
            { isStrike: false, isBall: true },
          ]),
        ],
      })
    );
    // Tick 3: 3 pitches total in allPlays
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(3));
    mockFetchGameFeed.mockResolvedValueOnce(
      makeEmptyFeedResponse(FEED_TIMESTAMP_2)
    );
    mockFetchGameFeedLive.mockResolvedValueOnce(
      makeGameFeedLiveResponse({
        allPlays: [
          makeAllPlayWithPitches(0, [
            { isStrike: true, isBall: false },
            { isStrike: false, isBall: true },
          ]),
          makeAllPlayWithPitches(1, [{ isStrike: true, isBall: false }]),
        ],
      })
    );

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks(); // tick 1

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 2

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 3

    const updateCalls = (io.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([event]) => event === SOCKET_EVENTS.GAME_UPDATE
    );
    const tick3Update = updateCalls[updateCalls.length - 1]![1] as {
      pitchHistory: unknown[];
    };
    expect(tick3Update.pitchHistory).toHaveLength(3);
    scheduler.stop();
  });

  it('merges in-progress currentPlay pitches into pitchesThrown', async () => {
    // Tick 1: seeds enrichment state
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(1));
    // Tick 2: feed/live returns 2 completed pitches in allPlays and 1 in-progress
    // pitch in currentPlay (isComplete: false). Total must be 3.
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(2));
    mockFetchGameFeed.mockResolvedValueOnce(
      makeEmptyFeedResponse(FEED_TIMESTAMP_1)
    );
    // Tick 1 also fires feed/live — queue a default so tick 2's allPlays+currentPlay
    // lands on tick 2, not tick 1.
    mockFetchGameFeedLive.mockResolvedValueOnce(makeGameFeedLiveResponse());
    mockFetchGameFeedLive.mockResolvedValueOnce(
      makeGameFeedLiveResponse({
        allPlays: [
          makeAllPlayWithPitches(0, [
            { isStrike: true, isBall: false },
            { isStrike: false, isBall: true },
          ]),
        ],
        currentPlay: {
          about: {
            atBatIndex: 1,
            halfInning: 'top',
            inning: 3,
            isComplete: false,
          },
          count: { balls: 1, strikes: 1, outs: 0 },
          matchup: {
            batter: { id: 596019, fullName: 'Francisco Lindor' },
            pitcher: { id: PITCHER_ID, fullName: 'Shohei Ohtani' },
            batSide: { code: 'R' },
            pitchHand: { code: 'R' },
          },
          playEvents: [
            {
              type: 'pitch',
              isPitch: true,
              pitchNumber: 1,
              details: {
                description: 'Called Strike',
                type: { code: 'FF', description: 'Four-Seam Fastball' },
                isStrike: true,
                isBall: false,
              },
              count: { balls: 0, strikes: 1 },
            },
          ],
        },
      })
    );

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks(); // tick 1

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 2

    const updateCalls = (io.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([event]) => event === SOCKET_EVENTS.GAME_UPDATE
    );
    const tick2Update = updateCalls[updateCalls.length - 1]![1] as {
      currentPitcher: { pitchesThrown: number } | null;
      pitchHistory: unknown[];
    };
    expect(tick2Update.currentPitcher?.pitchesThrown).toBe(3);
    expect(tick2Update.pitchHistory).toHaveLength(3);
    scheduler.stop();
  });

  it('does not double-count pitches when currentPlay is complete (isComplete: true)', async () => {
    // Tick 1: seeds enrichment state
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(1));
    // Tick 2: allPlays has the completed at-bat (3 pitches); currentPlay has the
    // same at-bat marked isComplete: true — must not be counted again.
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(2));
    mockFetchGameFeed.mockResolvedValueOnce(
      makeEmptyFeedResponse(FEED_TIMESTAMP_1)
    );
    // Tick 1 also fires feed/live — queue a default so tick 2's allPlays+currentPlay
    // lands on tick 2, not tick 1.
    mockFetchGameFeedLive.mockResolvedValueOnce(makeGameFeedLiveResponse());
    mockFetchGameFeedLive.mockResolvedValueOnce(
      makeGameFeedLiveResponse({
        allPlays: [
          makeAllPlayWithPitches(0, [
            { isStrike: true, isBall: false },
            { isStrike: false, isBall: true },
            { isStrike: true, isBall: false },
          ]),
        ],
        currentPlay: {
          about: {
            atBatIndex: 0,
            halfInning: 'top',
            inning: 3,
            isComplete: true, // ← completed — must not be counted a second time
          },
          count: { balls: 1, strikes: 2, outs: 1 },
          matchup: {
            batter: { id: 596019, fullName: 'Francisco Lindor' },
            pitcher: { id: PITCHER_ID, fullName: 'Shohei Ohtani' },
            batSide: { code: 'R' },
            pitchHand: { code: 'R' },
          },
          playEvents: [
            {
              type: 'pitch',
              isPitch: true,
              pitchNumber: 1,
              details: {
                description: 'Called Strike',
                type: { code: 'FF', description: 'Four-Seam Fastball' },
                isStrike: true,
                isBall: false,
              },
              count: { balls: 0, strikes: 1 },
            },
            {
              type: 'pitch',
              isPitch: true,
              pitchNumber: 2,
              details: {
                description: 'Ball',
                type: { code: 'FF', description: 'Four-Seam Fastball' },
                isStrike: false,
                isBall: true,
              },
              count: { balls: 1, strikes: 1 },
            },
            {
              type: 'pitch',
              isPitch: true,
              pitchNumber: 3,
              details: {
                description: 'Called Strike',
                type: { code: 'FF', description: 'Four-Seam Fastball' },
                isStrike: true,
                isBall: false,
              },
              count: { balls: 1, strikes: 2 },
            },
          ],
        },
      })
    );

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks(); // tick 1

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 2

    const updateCalls = (io.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([event]) => event === SOCKET_EVENTS.GAME_UPDATE
    );
    const tick2Update = updateCalls[updateCalls.length - 1]![1] as {
      currentPitcher: {
        pitchesThrown: number;
        strikes: number;
        balls: number;
      } | null;
      pitchHistory: unknown[];
    };
    // Must be 3 from allPlays only — not 6
    expect(tick2Update.currentPitcher?.pitchesThrown).toBe(3);
    expect(tick2Update.currentPitcher?.strikes).toBe(2);
    expect(tick2Update.currentPitcher?.balls).toBe(1);
    expect(tick2Update.pitchHistory).toHaveLength(3);
    scheduler.stop();
  });
});

// ---------------------------------------------------------------------------
// Pitcher stats — null pitcher and cross-inning behavior
// ---------------------------------------------------------------------------

describe('pitcher stats — null pitcher and cross-inning behavior', () => {
  it('emits empty pitchHistory when currentPitcher is null even if previously cached', async () => {
    // Tick 1: seeds enrichment state (outs mode, pitcher present)
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(1));
    // Tick 2: linescore delta fires enrichment; feed/live has no allPlays so
    // pitcherStats = null (stats only come from allPlays now).
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(2));
    mockFetchGameFeed.mockResolvedValueOnce(
      makeEmptyFeedResponse(FEED_TIMESTAMP_1)
    );
    // Tick 3: between-innings — pitcherId is null; pitchHistory emits as [].
    // Linescore changed from tick 2 so enrichment fires; return empty feed.
    mockFetchSchedule.mockResolvedValueOnce(makeBetweenInningsSchedule());
    mockFetchGameFeed.mockResolvedValueOnce(makeEmptyFeedResponse());

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks(); // tick 1

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 2: pitches cached

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 3: between-innings

    const updateCalls = (io.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([event]) => event === SOCKET_EVENTS.GAME_UPDATE
    );
    const tick3Update = updateCalls[updateCalls.length - 1]![1] as {
      trackingMode: string;
      pitchHistory: unknown[];
    };
    expect(tick3Update.trackingMode).toBe('between-innings');
    expect(tick3Update.pitchHistory).toHaveLength(0);
    scheduler.stop();
  });

  it('preserves pitcher stats across a between-innings break', async () => {
    // allPlays is cumulative — stats for PITCHER_ID are always recomputed fresh
    // from the full allPlays array. After a between-innings break, the next
    // feed/live response still carries all historical plays, so stats are correct.
    const twoCompletedPitches = [
      makeAllPlayWithPitches(0, [
        { isStrike: true, isBall: false },
        { isStrike: false, isBall: true },
      ]),
    ];
    // Tick 1: seeds enrichment state, no allPlays yet
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(1));
    // Tick 2: 2 pitches visible in allPlays
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(2));
    mockFetchGameFeed.mockResolvedValueOnce(
      makeEmptyFeedResponse(FEED_TIMESTAMP_1)
    );
    // Tick 1 also fires feed/live — queue a default so tick 2's allPlays lands on tick 2.
    mockFetchGameFeedLive.mockResolvedValueOnce(makeGameFeedLiveResponse());
    mockFetchGameFeedLive.mockResolvedValueOnce(
      makeGameFeedLiveResponse({ allPlays: twoCompletedPitches })
    );
    // Tick 3: between-innings — shouldFetchAtBat is false, liveFeed not called
    // for atBat; but emitBreakSummary calls fetchGameFeedLive once for highlights.
    mockFetchSchedule.mockResolvedValueOnce(makeBetweenInningsSchedule());
    mockFetchGameFeed.mockResolvedValueOnce(
      makeEmptyFeedResponse(FEED_TIMESTAMP_2)
    );
    // Queue two responses for emitBreakSummary during tick 3:
    //   1. initial attempt (no boxscore → null → schedules 15s retry)
    //   2. retry fires inside the next vi.runOnlyPendingTimers() call
    mockFetchGameFeedLive.mockResolvedValueOnce(makeGameFeedLiveResponse());
    mockFetchGameFeedLive.mockResolvedValueOnce(makeGameFeedLiveResponse());
    // Tick 4: PITCHER_ID back on the mound — allPlays still includes the 2 prior pitches
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(1));
    mockFetchGameFeed.mockResolvedValueOnce(makeEmptyFeedResponse());
    mockFetchGameFeedLive.mockResolvedValueOnce(
      makeGameFeedLiveResponse({ allPlays: twoCompletedPitches })
    );

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks(); // tick 1

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 2: 2 pitches

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 3: between-innings

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 4: pitcher returns

    const updateCalls = (io.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([event]) => event === SOCKET_EVENTS.GAME_UPDATE
    );
    const tick4Update = updateCalls[updateCalls.length - 1]![1] as {
      trackingMode: string;
      currentPitcher: { pitchesThrown: number } | null;
      pitchHistory: unknown[];
    };

    expect(tick4Update.trackingMode).toBe('live');
    expect(tick4Update.currentPitcher?.pitchesThrown).toBe(2);
    expect(tick4Update.pitchHistory).toHaveLength(2);
    scheduler.stop();
  });
});

// ── Inning break summary emission ─────────────────────────────────────────────

/**
 * Build a minimal GameFeedLiveResponse that includes a valid LiveBoxscore so
 * that buildInningBreakSummary can return a non-null summary.
 *
 * NYM (home) batting order: players NYM_P1..NYM_P9 with IDs 9001..9009.
 * Pitcher on mound: LAD pitcher (ID 660271) in the away players map.
 */
function makeBreakFeedResponse() {
  function makePlayer(id: number, slot: number): [string, LiveBoxscorePlayer] {
    return [
      `ID${id}`,
      {
        person: { id, fullName: `Player ${id}` },
        battingOrder: slot * 100,
        stats: {
          batting: { atBats: 3, hits: 1, homeRuns: 0 },
          pitching: {
            gamesPlayed: 1,
            gamesStarted: 0,
            inningsPitched: '0.0',
            earnedRuns: 0,
            strikeOuts: 0,
            baseOnBalls: 0,
            hits: 0,
            pitchesThrown: 0,
          },
        },
        seasonStats: {
          batting: {
            stolenBases: 0,
            caughtStealing: 0,
            ops: '.750',
            avg: '.280',
            homeRuns: 5,
            strikeOuts: 30,
            baseOnBalls: 10,
            plateAppearances: 100,
          },
          pitching: {
            era: '0.00',
            inningsPitched: '0.0',
            strikeoutsPer9Inn: '0.0',
            walksPer9Inn: '0.0',
          },
        },
      },
    ];
  }

  const homePlayers = Object.fromEntries(
    [9001, 9002, 9003, 9004, 9005, 9006, 9007, 9008, 9009].map((id, i) =>
      makePlayer(id, i + 1)
    )
  );

  const pitcherId = 660271;
  const awayPitcherEntry: LiveBoxscorePlayer = {
    person: { id: pitcherId, fullName: 'Shohei Ohtani' },
    battingOrder: 0,
    stats: {
      batting: { atBats: 0, hits: 0, homeRuns: 0 },
      pitching: {
        gamesPlayed: 1,
        gamesStarted: 1,
        inningsPitched: '3.0',
        earnedRuns: 0,
        strikeOuts: 4,
        baseOnBalls: 1,
        hits: 2,
        pitchesThrown: 45,
      },
    },
    seasonStats: {
      batting: {
        stolenBases: 0,
        caughtStealing: 0,
        ops: '.000',
        avg: '.000',
        homeRuns: 0,
        strikeOuts: 0,
        baseOnBalls: 0,
        plateAppearances: 0,
      },
      pitching: {
        era: '2.50',
        inningsPitched: '30.0',
        strikeoutsPer9Inn: '10.5',
        walksPer9Inn: '2.1',
      },
    },
  };

  return {
    liveData: {
      plays: { currentPlay: null },
      boxscore: {
        teams: {
          home: {
            battingOrder: [
              9001, 9002, 9003, 9004, 9005, 9006, 9007, 9008, 9009,
            ],
            players: homePlayers,
          },
          away: {
            battingOrder: [],
            players: { [`ID${pitcherId}`]: awayPitcherEntry },
          },
        },
      },
    },
  } satisfies GameFeedLiveResponse;
}

describe('inning break summary emission', () => {
  it('emits inning-break-summary after game-update on transition to between-innings', async () => {
    mockFetchSchedule.mockResolvedValueOnce(makeBetweenInningsSchedule());
    // emitBreakSummary will call fetchGameFeedLive once
    mockFetchGameFeedLive.mockResolvedValueOnce(makeBreakFeedResponse());

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks();

    expect(io.emit).toHaveBeenCalledWith(
      SOCKET_EVENTS.GAME_UPDATE,
      expect.objectContaining({ trackingMode: 'between-innings' })
    );
    expect(io.emit).toHaveBeenCalledWith(
      SOCKET_EVENTS.INNING_BREAK_SUMMARY,
      expect.objectContaining({ gamePk: GAME_PK })
    );
    // game-update must precede inning-break-summary
    const calls = (io.emit as ReturnType<typeof vi.fn>).mock.calls.map(
      ([event]) => event as string
    );
    const guIdx = calls.indexOf(SOCKET_EVENTS.GAME_UPDATE);
    const ibsIdx = calls.indexOf(SOCKET_EVENTS.INNING_BREAK_SUMMARY);
    expect(guIdx).toBeLessThan(ibsIdx);
    scheduler.stop();
  });

  it('does not re-emit inning-break-summary on a second between-innings tick', async () => {
    mockFetchSchedule.mockResolvedValue(makeBetweenInningsSchedule());
    // First tick: summary emitted
    mockFetchGameFeedLive.mockResolvedValueOnce(makeBreakFeedResponse());
    // Second tick: no fetchGameFeedLive queued — if called it would return undefined (default mock)

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks(); // tick 1

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 2 (still between-innings)

    const ibsCalls = (io.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([event]) => event === SOCKET_EVENTS.INNING_BREAK_SUMMARY
    );
    expect(ibsCalls).toHaveLength(1); // emitted exactly once
    scheduler.stop();
  });

  it('schedules a 15s retry when feed/live fetch throws', async () => {
    mockFetchSchedule.mockResolvedValueOnce(makeBetweenInningsSchedule());
    mockFetchGameFeedLive.mockRejectedValueOnce(new Error('network error'));

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks(); // tick 1 — fetch throws, retry scheduled

    // Before 15s: no summary emitted
    expect(io.emit).not.toHaveBeenCalledWith(
      SOCKET_EVENTS.INNING_BREAK_SUMMARY,
      expect.anything()
    );

    // After 15s retry fires: provide a valid response
    mockFetchGameFeedLive.mockResolvedValueOnce(makeBreakFeedResponse());
    vi.advanceTimersByTime(15_000);
    await drainMicrotasks();

    expect(io.emit).toHaveBeenCalledWith(
      SOCKET_EVENTS.INNING_BREAK_SUMMARY,
      expect.objectContaining({ gamePk: GAME_PK })
    );
    scheduler.stop();
  });

  it('does not schedule a second retry if one is already pending', async () => {
    mockFetchSchedule.mockResolvedValue(makeBetweenInningsSchedule());
    // Both ticks fail — only one timer should be pending at a time
    mockFetchGameFeedLive.mockRejectedValue(new Error('network error'));

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks(); // tick 1 — retry scheduled

    vi.runOnlyPendingTimers(); // advance scheduler tick
    await drainMicrotasks(); // tick 2 — retry already exists, no second one

    // Advance 15s: only the first retry fires
    let retryCallCount = 0;
    mockFetchGameFeedLive.mockImplementation(() => {
      retryCallCount++;
      return Promise.reject(new Error('still failing'));
    });
    vi.advanceTimersByTime(15_000);
    await drainMicrotasks();

    expect(retryCallCount).toBe(1); // only one retry fired
    scheduler.stop();
  });

  it('emits inning-break-summary on retry when first attempt returns null boxscore', async () => {
    mockFetchSchedule.mockResolvedValueOnce(makeBetweenInningsSchedule());
    // First attempt: no boxscore → buildInningBreakSummary returns null → retry scheduled
    mockFetchGameFeedLive.mockResolvedValueOnce(makeGameFeedLiveResponse());
    // Retry: valid boxscore → summary emitted
    mockFetchGameFeedLive.mockResolvedValueOnce(makeBreakFeedResponse());

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks(); // tick 1 — null summary, retry scheduled

    expect(io.emit).not.toHaveBeenCalledWith(
      SOCKET_EVENTS.INNING_BREAK_SUMMARY,
      expect.anything()
    );

    vi.advanceTimersByTime(15_000);
    await drainMicrotasks();

    expect(io.emit).toHaveBeenCalledWith(
      SOCKET_EVENTS.INNING_BREAK_SUMMARY,
      expect.objectContaining({ gamePk: GAME_PK })
    );
    scheduler.stop();
  });

  it('clears lastEmittedBreakSummary when transitioning out of between-innings', async () => {
    // Tick 1: between-innings → summary emitted
    mockFetchSchedule.mockResolvedValueOnce(makeBetweenInningsSchedule());
    mockFetchGameFeedLive.mockResolvedValueOnce(makeBreakFeedResponse());
    // Tick 2: back to live → break state cleared
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(1));
    mockFetchGameFeed.mockResolvedValueOnce(makeEmptyFeedResponse());
    mockFetchGameFeedLive.mockResolvedValueOnce(makeGameFeedLiveResponse());

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks(); // tick 1

    expect(scheduler.getLastBreakSummary()).not.toBeNull();

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 2 (live)

    expect(scheduler.getLastBreakSummary()).toBeNull();
    scheduler.stop();
  });

  it('clears lastEmittedBreakSummary when gamePk changes', async () => {
    // Tick 1: between-innings → summary emitted
    mockFetchSchedule.mockResolvedValueOnce(makeBetweenInningsSchedule());
    mockFetchGameFeedLive.mockResolvedValueOnce(makeBreakFeedResponse());
    // Tick 2: new gamePk → break state cleared
    mockFetchSchedule.mockResolvedValueOnce(makeNewGameSchedule());
    mockFetchGameFeedLive.mockResolvedValueOnce(makeGameFeedLiveResponse());

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks(); // tick 1

    expect(scheduler.getLastBreakSummary()).not.toBeNull();

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 2 (new game)

    expect(scheduler.getLastBreakSummary()).toBeNull();
    scheduler.stop();
  });

  it('cancels retry timer when scheduler is stopped', async () => {
    mockFetchSchedule.mockResolvedValueOnce(makeBetweenInningsSchedule());
    // First attempt throws → retry timer scheduled
    mockFetchGameFeedLive.mockRejectedValueOnce(new Error('network error'));

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks(); // tick 1 — retry timer set

    scheduler.stop();

    // Advance past retry delay — stopped flag prevents emission
    mockFetchGameFeedLive.mockResolvedValueOnce(makeBreakFeedResponse());
    vi.advanceTimersByTime(15_000);
    await drainMicrotasks();

    expect(io.emit).not.toHaveBeenCalledWith(
      SOCKET_EVENTS.INNING_BREAK_SUMMARY,
      expect.anything()
    );
  });
});
