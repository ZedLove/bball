import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Server as SocketIOServer } from 'socket.io';

// ── Module mocks (hoisted before imports) ────────────────────────────────────
vi.mock('./schedule-client.ts', () => ({ fetchSchedule: vi.fn() }));
vi.mock('./game-feed-client.ts', () => ({ fetchGameFeed: vi.fn() }));
vi.mock('./boxscore-client.ts', () => ({ fetchBoxscore: vi.fn() }));
vi.mock('./next-game-client.ts', () => ({ fetchNextGame: vi.fn() }));
vi.mock('./logger.ts', () => ({ logUpdate: vi.fn() }));
vi.mock('../config/env.ts', () => ({
  CONFIG: {
    TEAM_ID: 121,            // NYM
    MAX_RETRIES: 0,          // Fail fast in tests — no retry delay
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
import type { ScheduleResponse } from './schedule-client.ts';
import type { GameFeedResponse, BoxscoreResponse, NextGameScheduleResponse } from './game-feed-types.ts';

const mockFetchSchedule = vi.mocked(fetchSchedule);
const mockFetchGameFeed = vi.mocked(fetchGameFeed);
const mockFetchBoxscore = vi.mocked(fetchBoxscore);
const mockFetchNextGame = vi.mocked(fetchNextGame);

// ── Constants ────────────────────────────────────────────────────────────────
const NYM_ID = 121;
const LAD_ID = 119;
const GAME_PK = 823963;
const GAME_DATE = '2026-04-15T22:10:00Z';
const SEED_TIMECODE = '20260415_221000';
const FEED_TIMESTAMP_1 = '20260415_230000';
const FEED_TIMESTAMP_2 = '20260415_230500';

// ── Helpers ──────────────────────────────────────────────────────────────────

function createMockIo(): SocketIOServer {
  return { emit: vi.fn() } as unknown as SocketIOServer;
}

/**
 * Drains pending microtasks by yielding to the event loop multiple times.
 * Required because fake timers do not affect Promise resolution — we need to
 * explicitly let queued Promise callbacks settle after starting the scheduler
 * or firing a fake timer.
 */
async function drainMicrotasks(rounds = 15): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
}

// ── Schedule fixtures ────────────────────────────────────────────────────────

function makeLiveSchedule(outsOverride = 1): ScheduleResponse {
  return {
    dates: [{
      date: '2026-04-15',
      games: [{
        gamePk: GAME_PK,
        gameDate: GAME_DATE,
        status: { detailedState: 'In Progress', abstractGameState: 'Live' },
        inningBreakLength: 120,
        teams: {
          away: {
            team: { id: LAD_ID, name: 'Los Angeles Dodgers', abbreviation: 'LAD' },
            score: 0,
            leagueRecord: { wins: 3, losses: 2 },
          },
          home: {
            team: { id: NYM_ID, name: 'New York Mets', abbreviation: 'NYM' },
            score: 1,
            leagueRecord: { wins: 4, losses: 1 },
          },
        },
        linescore: {
          currentInning: 3,
          currentInningOrdinal: '3rd',
          inningState: 'Top', // LAD batting, NYM defending → trackingMode 'outs'
          scheduledInnings: 9,
          outs: outsOverride,
          balls: 0,
          strikes: 0,
          teams: {
            home: { runs: 1, hits: 2, errors: 0 },
            away: { runs: 0, hits: 1, errors: 0 },
          },
          defense: { pitcher: { id: 660271, fullName: 'Shohei Ohtani' } },
          offense: { batter: { id: 596019, fullName: 'Francisco Lindor' } },
        },
      }],
    }],
  };
}

function makeFinalSchedule(): ScheduleResponse {
  return {
    dates: [{
      date: '2026-04-15',
      games: [{
        gamePk: GAME_PK,
        gameDate: GAME_DATE,
        status: { detailedState: 'Final', abstractGameState: 'Final' },
        inningBreakLength: 120,
        teams: {
          away: {
            team: { id: LAD_ID, name: 'Los Angeles Dodgers', abbreviation: 'LAD' },
            score: 2,
            leagueRecord: { wins: 3, losses: 3 },
          },
          home: {
            team: { id: NYM_ID, name: 'New York Mets', abbreviation: 'NYM' },
            score: 4,
            leagueRecord: { wins: 5, losses: 1 },
          },
        },
        linescore: {
          currentInning: 9,
          currentInningOrdinal: '9th',
          inningState: 'End',
          scheduledInnings: 9,
          outs: 3,
          balls: 0,
          strikes: 0,
          teams: {
            home: { runs: 4, hits: 8, errors: 0 },
            away: { runs: 2, hits: 6, errors: 1 },
          },
        },
      }],
    }],
  };
}

function makeNewGameSchedule(): ScheduleResponse {
  return {
    dates: [{
      date: '2026-04-16',
      games: [{
        gamePk: 824100, // different gamePk
        gameDate: '2026-04-16T18:00:00Z',
        status: { detailedState: 'In Progress', abstractGameState: 'Live' },
        inningBreakLength: 120,
        teams: {
          away: {
            team: { id: LAD_ID, name: 'Los Angeles Dodgers', abbreviation: 'LAD' },
            score: 0,
            leagueRecord: { wins: 4, losses: 3 },
          },
          home: {
            team: { id: NYM_ID, name: 'New York Mets', abbreviation: 'NYM' },
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
      }],
    }],
  };
}

function makeEmptySchedule(): ScheduleResponse {
  return { dates: [] };
}

// ── Feed fixtures ────────────────────────────────────────────────────────────

function makeFeedResponse(atBatIndex: number, timestamp = FEED_TIMESTAMP_1): GameFeedResponse {
  return {
    metaData: { timeStamp: timestamp },
    gameData: {
      teams: { away: { id: LAD_ID, abbreviation: 'LAD' }, home: { id: NYM_ID, abbreviation: 'NYM' } },
      players: {
        ID596019: { id: 596019, fullName: 'Francisco Lindor' },
        ID660271: { id: 660271, fullName: 'Shohei Ohtani' },
      },
    },
    liveData: {
      plays: {
        allPlays: [{
          atBatIndex,
          result: { eventType: 'strikeout', description: 'Francisco Lindor strikes out swinging.', rbi: 0 },
          about: { atBatIndex, halfInning: 'top', inning: 3, isComplete: true, isScoringPlay: false },
          matchup: {
            batter: { id: 596019, fullName: 'Francisco Lindor' },
            pitcher: { id: 660271, fullName: 'Shohei Ohtani' },
          },
          playEvents: [],
        }],
      },
      decisions: {
        winner: { id: 660271, fullName: 'Shohei Ohtani' },
        loser: { id: 605280, fullName: 'Clay Holmes' },
      },
    },
  };
}

function makeEmptyFeedResponse(timestamp = FEED_TIMESTAMP_1): GameFeedResponse {
  return {
    metaData: { timeStamp: timestamp },
    gameData: {
      teams: { away: { id: LAD_ID, abbreviation: 'LAD' }, home: { id: NYM_ID, abbreviation: 'NYM' } },
      players: {},
    },
    liveData: { plays: { allPlays: [] } },
  };
}

function makeBoxscoreResponse(): BoxscoreResponse {
  return { topPerformers: [] };
}

function makeNextGameResponse(): NextGameScheduleResponse {
  return {
    dates: [{
      games: [{
        gamePk: 824693,
        gameDate: '2026-04-17T18:20:00Z',
        venue: { name: 'Citi Field' },
        teams: {
          away: {
            team: { id: LAD_ID, name: 'Los Angeles Dodgers', abbreviation: 'LAD' },
            probablePitcher: null,
          },
          home: {
            team: { id: NYM_ID, name: 'New York Mets', abbreviation: 'NYM' },
            probablePitcher: null,
          },
        },
      }],
    }],
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
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
      expect.objectContaining({ gamePk: GAME_PK, trackingMode: 'outs' }),
    );
    scheduler.stop();
  });

  it('does not emit game-update when no game is found in the schedule', async () => {
    mockFetchSchedule.mockResolvedValueOnce(makeEmptySchedule());
    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks();

    expect(io.emit).not.toHaveBeenCalledWith(SOCKET_EVENTS.GAME_UPDATE, expect.anything());
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
    await drainMicrotasks();  // tick 2 settles

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
    mockFetchGameFeed.mockResolvedValueOnce(makeEmptyFeedResponse(FEED_TIMESTAMP_1));
    // Tick 3: outs changes again → enrichment fires with FEED_TIMESTAMP_1 (the advanced cursor)
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(3));
    mockFetchGameFeed.mockResolvedValueOnce(makeEmptyFeedResponse(FEED_TIMESTAMP_2));

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
    expect(mockFetchGameFeed).toHaveBeenNthCalledWith(1, GAME_PK, SEED_TIMECODE);
    expect(mockFetchGameFeed).toHaveBeenNthCalledWith(2, GAME_PK, FEED_TIMESTAMP_1);
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
      }),
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

    expect(io.emit).not.toHaveBeenCalledWith(SOCKET_EVENTS.GAME_EVENTS, expect.anything());
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
    mockFetchGameFeed.mockResolvedValueOnce(makeEmptyFeedResponse(FEED_TIMESTAMP_1));

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks(); // tick 1

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 2: null response — no crash, snapshot held stale

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 3: retries with original cursor even though linescore unchanged

    expect(io.emit).not.toHaveBeenCalledWith(SOCKET_EVENTS.GAME_EVENTS, expect.anything());
    // Cursor was not advanced after the null response, so tick 3 retries with SEED_TIMECODE
    expect(mockFetchGameFeed).toHaveBeenNthCalledWith(1, GAME_PK, SEED_TIMECODE);
    expect(mockFetchGameFeed).toHaveBeenNthCalledWith(2, GAME_PK, SEED_TIMECODE);
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
    mockFetchGameFeed.mockResolvedValueOnce(makeFeedResponse(0, FEED_TIMESTAMP_1));
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
    mockFetchGameFeed.mockResolvedValueOnce(makeFeedResponse(0, FEED_TIMESTAMP_1));
    // Tick 3 → another linescore change → feed returns same atBatIndex 0 (already seen)
    mockFetchSchedule.mockResolvedValueOnce(makeLiveSchedule(3));
    mockFetchGameFeed.mockResolvedValueOnce(makeFeedResponse(0, FEED_TIMESTAMP_2));

    const io = createMockIo();
    const scheduler = startScheduler(io);

    await drainMicrotasks(); // tick 1

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 2 → emits game-events for atBatIndex 0

    (io.emit as ReturnType<typeof vi.fn>).mockClear(); // reset emit call count for clean tick 3 assertion

    vi.runOnlyPendingTimers();
    await drainMicrotasks(); // tick 3 → atBatIndex 0 already processed, no emission

    expect(io.emit).not.toHaveBeenCalledWith(SOCKET_EVENTS.GAME_EVENTS, expect.anything());
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
      expect.objectContaining({ gamePk: GAME_PK }),
    );
    // No game-events should be emitted
    expect(io.emit).not.toHaveBeenCalledWith(SOCKET_EVENTS.GAME_EVENTS, expect.anything());
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
      }),
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

    const gameSummaryCalls = (io.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([event]) => event === SOCKET_EVENTS.GAME_SUMMARY,
    );
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
      expect.objectContaining({ topPerformers: [] }),
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
      expect.objectContaining({ nextGame: null }),
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

    expect(io.emit).not.toHaveBeenCalledWith(SOCKET_EVENTS.GAME_SUMMARY, expect.anything());
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
    expect(io.emit).not.toHaveBeenCalledWith(SOCKET_EVENTS.GAME_SUMMARY, expect.anything());
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

    expect(io.emit).toHaveBeenCalledWith(SOCKET_EVENTS.GAME_UPDATE, expect.objectContaining({ trackingMode: 'final' }));
    expect(io.emit).not.toHaveBeenCalledWith(SOCKET_EVENTS.GAME_EVENTS, expect.anything());
    expect(io.emit).not.toHaveBeenCalledWith(SOCKET_EVENTS.GAME_SUMMARY, expect.anything());
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
