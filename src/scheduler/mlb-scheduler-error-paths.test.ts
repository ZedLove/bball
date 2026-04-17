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
import type { ScheduleResponse } from './schedule-client.ts';
import type { GameFeedResponse, BoxscoreResponse, NextGameScheduleResponse } from './game-feed-types.ts';
import type { Server as SocketIOServer } from 'socket.io';

const mockFetchSchedule = vi.mocked(fetchSchedule);
const mockFetchGameFeed = vi.mocked(fetchGameFeed);
const mockFetchBoxscore = vi.mocked(fetchBoxscore);
const mockFetchNextGame = vi.mocked(fetchNextGame);
const mockBuildGameSummary = vi.mocked(buildGameSummary);

// ── Constants ────────────────────────────────────────────────────────────────
const NYM_ID = 121;
const LAD_ID = 119;
const GAME_PK = 823963;
const GAME_DATE = '2026-04-15T22:10:00Z';
const FEED_TIMESTAMP_1 = '20260415_230000';

// ── Test helpers ─────────────────────────────────────────────────────────────

function createMockIo(): SocketIOServer {
  return { emit: vi.fn() } as unknown as SocketIOServer;
}

async function drainMicrotasks(rounds = 15): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
}

function makeLiveSchedule(): ScheduleResponse {
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
          inningState: 'Top',
          scheduledInnings: 9,
          outs: 1,
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

function makeFeedResponse(atBatIndex: number): GameFeedResponse {
  return {
    metaData: { timeStamp: FEED_TIMESTAMP_1 },
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
          result: { eventType: 'strikeout', description: 'Strikes out swinging.', rbi: 0 },
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
        loser: { id: 596019, fullName: 'Francisco Lindor' },
      },
    },
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
