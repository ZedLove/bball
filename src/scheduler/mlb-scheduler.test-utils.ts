/**
 * Shared test utilities and fixtures for mlb-scheduler tests.
 * These helpers are used across multiple test suites to create mocks and test data.
 */

import { vi } from 'vitest';
import type { Server as SocketIOServer } from 'socket.io';
import type { ScheduleResponse } from './schedule-client.ts';
import type {
  GameFeedResponse,
  BoxscoreResponse,
  NextGameScheduleResponse,
  GameFeedLiveResponse,
} from './game-feed-types.ts';

// ── Test constants ───────────────────────────────────────────────────────────

export const NYM_ID = 121;
export const LAD_ID = 119;
export const GAME_PK = 823963;
export const GAME_DATE = '2026-04-15T22:10:00Z';
export const SEED_TIMECODE = '20260415_221000';
export const FEED_TIMESTAMP_1 = '20260415_230000';
export const FEED_TIMESTAMP_2 = '20260415_230500';

// ── Mock factories ───────────────────────────────────────────────────────────

/**
 * Creates a mocked Socket.IO server instance for testing.
 */
export function createMockIo(): SocketIOServer {
  return { emit: vi.fn() } as unknown as SocketIOServer;
}

/**
 * Drains pending microtasks by yielding to the event loop multiple times.
 * Required because fake timers do not affect Promise resolution — we need to
 * explicitly let queued Promise callbacks settle after starting the scheduler
 * or firing a fake timer.
 */
export async function drainMicrotasks(rounds = 15): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
}

// ── Schedule fixtures ────────────────────────────────────────────────────────

/**
 * Creates a mock live schedule response with one active game (NYM vs LAD).
 * @param outsOverride - Optional override for the number of outs in the game.
 */
export function makeLiveSchedule(outsOverride = 1): ScheduleResponse {
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
          },
        ],
      },
    ],
  };
}

/**
 * Creates a mock final schedule response with one completed game (NYM wins 4-2).
 */
export function makeFinalSchedule(): ScheduleResponse {
  return {
    dates: [
      {
        date: '2026-04-15',
        games: [
          {
            gamePk: GAME_PK,
            gameDate: GAME_DATE,
            status: { detailedState: 'Final', abstractGameState: 'Final' },
            inningBreakLength: 120,
            teams: {
              away: {
                team: {
                  id: LAD_ID,
                  name: 'Los Angeles Dodgers',
                  abbreviation: 'LAD',
                },
                score: 2,
                leagueRecord: { wins: 3, losses: 3 },
              },
              home: {
                team: {
                  id: NYM_ID,
                  name: 'New York Mets',
                  abbreviation: 'NYM',
                },
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
          },
        ],
      },
    ],
  };
}

// ── Feed fixtures ────────────────────────────────────────────────────────────

/**
 * Creates a mock game feed response with one play (strikeout by Francisco Lindor).
 * @param atBatIndex - The at-bat index for the play.
 * @param timestamp - Optional override for the response timestamp.
 */
export function makeFeedResponse(
  atBatIndex: number,
  timestamp = FEED_TIMESTAMP_1
): GameFeedResponse {
  return {
    metaData: { timeStamp: timestamp },
    gameData: {
      teams: {
        away: { id: LAD_ID, abbreviation: 'LAD' },
        home: { id: NYM_ID, abbreviation: 'NYM' },
      },
      players: {
        ID596019: { id: 596019, fullName: 'Francisco Lindor' },
        ID660271: { id: 660271, fullName: 'Shohei Ohtani' },
      },
    },
    liveData: {
      plays: {
        allPlays: [
          {
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
              pitcher: { id: 660271, fullName: 'Shohei Ohtani' },
            },
            playEvents: [],
          },
        ],
      },
      decisions: {
        winner: { id: 660271, fullName: 'Shohei Ohtani' },
        loser: { id: 605280, fullName: 'Clay Holmes' },
      },
    },
  };
}

/**
 * Creates a mock boxscore response with empty top performers.
 */
export function makeBoxscoreResponse(): BoxscoreResponse {
  return { topPerformers: [] };
}

/**
 * Creates a mock next-game response for the day after the game.
 */
export function makeNextGameResponse(): NextGameScheduleResponse {
  return {
    dates: [
      {
        games: [
          {
            gamePk: 824693,
            gameDate: '2026-04-17T18:20:00Z',
            venue: { name: 'Citi Field' },
            teams: {
              away: {
                team: {
                  id: LAD_ID,
                  name: 'Los Angeles Dodgers',
                  abbreviation: 'LAD',
                },
                probablePitcher: null,
              },
              home: {
                team: {
                  id: NYM_ID,
                  name: 'New York Mets',
                  abbreviation: 'NYM',
                },
                probablePitcher: null,
              },
            },
          },
        ],
      },
    ],
  };
}

/**
 * Creates a minimal `GameFeedLiveResponse` for use in scheduler tests.
 * By default, `currentPlay` is null — produces `atBat: null` from parseCurrentPlay.
 *
 * Pass `overrides` to supply a `currentPlay` for tests that assert a populated
 * `atBat`.
 */
export function makeGameFeedLiveResponse(
  overrides: Partial<GameFeedLiveResponse['liveData']['plays']> = {},
): GameFeedLiveResponse {
  return {
    liveData: {
      plays: {
        currentPlay: null,
        ...overrides,
      },
    },
  };
}
