import { describe, it, expect } from 'vitest';
import { buildGameSummary } from './summary-parser.ts';
import type { GameFeedResponse } from './game-feed-types.ts';
import type { BoxscoreResponse } from './game-feed-types.ts';
import type { NextGameScheduleResponse } from './game-feed-types.ts';

import feedFixture from './__fixtures__/game-feed.json' with { type: 'json' };
import boxscoreFixture from './__fixtures__/boxscore.json' with { type: 'json' };
import nextGameFixture from './__fixtures__/next-game-schedule.json' with { type: 'json' };

const GAME_PK = 823963;
const NYM_ID = 121;
const LAD_ID = 119;
const CHC_ID = 112;

const feedResponse = feedFixture as unknown as GameFeedResponse;
const boxscoreResponse = boxscoreFixture as unknown as BoxscoreResponse;
const nextGameResponse = nextGameFixture as unknown as NextGameScheduleResponse;

const FINAL_SCORE = { away: 2, home: 4 };

describe('buildGameSummary', () => {
  describe('core fields', () => {
    it('includes gamePk, finalScore, innings, and isExtraInnings', () => {
      const summary = buildGameSummary(
        GAME_PK,
        FINAL_SCORE,
        9,
        false,
        feedResponse,
        boxscoreResponse,
        nextGameResponse,
        NYM_ID
      );

      expect(summary.gamePk).toBe(GAME_PK);
      expect(summary.finalScore).toEqual(FINAL_SCORE);
      expect(summary.innings).toBe(9);
      expect(summary.isExtraInnings).toBe(false);
    });

    it('derives the boxscore URL from gamePk', () => {
      const summary = buildGameSummary(
        GAME_PK,
        FINAL_SCORE,
        9,
        false,
        feedResponse,
        boxscoreResponse,
        nextGameResponse,
        NYM_ID
      );

      expect(summary.boxscoreUrl).toBe(
        `https://www.mlb.com/gameday/${GAME_PK}/final/box-score`
      );
    });
  });

  describe('decisions', () => {
    it('maps winner and loser from liveData.decisions', () => {
      const summary = buildGameSummary(
        GAME_PK,
        FINAL_SCORE,
        9,
        false,
        feedResponse,
        boxscoreResponse,
        nextGameResponse,
        NYM_ID
      );

      expect(summary.decisions.winner).toEqual({
        id: 660271,
        fullName: 'Shohei Ohtani',
      });
      expect(summary.decisions.loser).toEqual({
        id: 605280,
        fullName: 'Clay Holmes',
      });
    });

    it('sets save to null when no save is recorded', () => {
      const summary = buildGameSummary(
        GAME_PK,
        FINAL_SCORE,
        9,
        false,
        feedResponse,
        boxscoreResponse,
        nextGameResponse,
        NYM_ID
      );

      expect(summary.decisions.save).toBeNull();
    });

    it('maps save pitcher when present', () => {
      const withSave: GameFeedResponse = {
        ...feedResponse,
        liveData: {
          ...feedResponse.liveData,
          decisions: {
            winner: { id: 660271, fullName: 'Shohei Ohtani' },
            loser: { id: 605280, fullName: 'Clay Holmes' },
            save: { id: 642207, fullName: 'Devin Williams' },
          },
        },
      };

      const summary = buildGameSummary(
        GAME_PK,
        FINAL_SCORE,
        9,
        false,
        withSave,
        boxscoreResponse,
        nextGameResponse,
        NYM_ID
      );

      expect(summary.decisions.save).toEqual({
        id: 642207,
        fullName: 'Devin Williams',
      });
    });

    it('throws when liveData.decisions is absent', () => {
      const withoutDecisions: GameFeedResponse = {
        ...feedResponse,
        liveData: {
          ...feedResponse.liveData,
          decisions: undefined,
        },
      };

      expect(() =>
        buildGameSummary(
          GAME_PK,
          FINAL_SCORE,
          9,
          false,
          withoutDecisions,
          boxscoreResponse,
          nextGameResponse,
          NYM_ID
        )
      ).toThrow(
        `liveData.decisions missing from final feed response for gamePk ${GAME_PK}`
      );
    });
  });

  describe('topPerformers', () => {
    it('maps all three performers with the correct summary strings', () => {
      const summary = buildGameSummary(
        GAME_PK,
        FINAL_SCORE,
        9,
        false,
        feedResponse,
        boxscoreResponse,
        nextGameResponse,
        NYM_ID
      );

      expect(summary.topPerformers).toHaveLength(3);
      expect(summary.topPerformers[0]).toEqual({
        player: { id: 660271, fullName: 'Shohei Ohtani' },
        summary: '6.0 IP, ER, 10 K, 2 BB',
      });
      expect(summary.topPerformers[1]).toEqual({
        player: { id: 687221, fullName: 'Dalton Rushing' },
        summary: '2-4 | HR, 2B, 2 K',
      });
      expect(summary.topPerformers[2]).toEqual({
        player: { id: 606192, fullName: 'Teoscar Hernández' },
        summary: '2-4 | HR, RBI, 2 R',
      });
    });

    it('prefers pitching summary over batting summary for two-way players', () => {
      const summary = buildGameSummary(
        GAME_PK,
        FINAL_SCORE,
        9,
        false,
        feedResponse,
        boxscoreResponse,
        nextGameResponse,
        NYM_ID
      );

      // Ohtani has pitching summary; batting summary is null — pitching should win
      expect(summary.topPerformers[0].summary).toBe('6.0 IP, ER, 10 K, 2 BB');
    });

    it('filters out performers with no usable summary', () => {
      const noSummaryBoxscore: BoxscoreResponse = {
        topPerformers: [
          {
            player: {
              person: { id: 12345, fullName: 'No-Summary Player' },
              stats: {
                batting: { summary: null },
                pitching: { summary: null },
              },
            },
          },
        ],
      };

      const summary = buildGameSummary(
        GAME_PK,
        FINAL_SCORE,
        9,
        false,
        feedResponse,
        noSummaryBoxscore,
        nextGameResponse,
        NYM_ID
      );

      expect(summary.topPerformers).toHaveLength(0);
    });

    it('returns an empty array when boxscore has no topPerformers', () => {
      const emptyBoxscore: BoxscoreResponse = { topPerformers: [] };

      const summary = buildGameSummary(
        GAME_PK,
        FINAL_SCORE,
        9,
        false,
        feedResponse,
        emptyBoxscore,
        nextGameResponse,
        NYM_ID
      );

      expect(summary.topPerformers).toEqual([]);
    });
  });

  describe('next game', () => {
    it('identifies the opponent when the tracked team is away', () => {
      // NYM (121) is away; CHC (112) is home → opponent is CHC
      const summary = buildGameSummary(
        GAME_PK,
        FINAL_SCORE,
        9,
        false,
        feedResponse,
        boxscoreResponse,
        nextGameResponse,
        NYM_ID
      );

      expect(summary.nextGame).not.toBeNull();
      expect(summary.nextGame!.opponent).toEqual({
        id: CHC_ID,
        name: 'Chicago Cubs',
        abbreviation: 'CHC',
      });
    });

    it('identifies the opponent when the tracked team is home', () => {
      // Treat CHC (112) as the tracked team; opponent is NYM (121)
      const summary = buildGameSummary(
        GAME_PK,
        FINAL_SCORE,
        9,
        false,
        feedResponse,
        boxscoreResponse,
        nextGameResponse,
        CHC_ID
      );

      expect(summary.nextGame!.opponent).toEqual({
        id: NYM_ID,
        name: 'New York Mets',
        abbreviation: 'NYM',
      });
    });

    it('maps gameTime, venue, and gamePk', () => {
      const summary = buildGameSummary(
        GAME_PK,
        FINAL_SCORE,
        9,
        false,
        feedResponse,
        boxscoreResponse,
        nextGameResponse,
        NYM_ID
      );

      expect(summary.nextGame!.gamePk).toBe(824693);
      expect(summary.nextGame!.gameTime).toBe('2026-04-17T18:20:00Z');
      expect(summary.nextGame!.venue).toBe('Wrigley Field');
    });

    it('maps probable pitchers for both teams', () => {
      const summary = buildGameSummary(
        GAME_PK,
        FINAL_SCORE,
        9,
        false,
        feedResponse,
        boxscoreResponse,
        nextGameResponse,
        NYM_ID
      );

      expect(summary.nextGame!.probablePitchers).toEqual({
        away: { id: 673540, fullName: 'Kodai Senga' },
        home: { id: 665795, fullName: 'Edward Cabrera' },
      });
    });

    it('sets probable pitchers to null when not announced', () => {
      const noPitchers: NextGameScheduleResponse = {
        dates: [
          {
            games: [
              {
                gamePk: 824693,
                gameDate: '2026-04-17T18:20:00Z',
                venue: { name: 'Wrigley Field' },
                teams: {
                  away: {
                    team: {
                      id: NYM_ID,
                      name: 'New York Mets',
                      abbreviation: 'NYM',
                    },
                    probablePitcher: null,
                  },
                  home: {
                    team: {
                      id: CHC_ID,
                      name: 'Chicago Cubs',
                      abbreviation: 'CHC',
                    },
                    probablePitcher: null,
                  },
                },
              },
            ],
          },
        ],
      };

      const summary = buildGameSummary(
        GAME_PK,
        FINAL_SCORE,
        9,
        false,
        feedResponse,
        boxscoreResponse,
        noPitchers,
        NYM_ID
      );

      expect(summary.nextGame!.probablePitchers).toEqual({
        away: null,
        home: null,
      });
    });

    it('sets nextGame to null when schedule response is null', () => {
      const summary = buildGameSummary(
        GAME_PK,
        FINAL_SCORE,
        9,
        false,
        feedResponse,
        boxscoreResponse,
        null,
        NYM_ID
      );

      expect(summary.nextGame).toBeNull();
    });

    it('sets nextGame to null when schedule response has no dates', () => {
      const empty: NextGameScheduleResponse = { dates: [] };

      const summary = buildGameSummary(
        GAME_PK,
        FINAL_SCORE,
        9,
        false,
        feedResponse,
        boxscoreResponse,
        empty,
        NYM_ID
      );

      expect(summary.nextGame).toBeNull();
    });

    it('skips the just-completed game when it appears first in the response', () => {
      // Doubleheader / timezone edge case: today's response includes the current
      // game (GAME_PK) followed by a second game (824693).
      const withCurrentGameFirst: NextGameScheduleResponse = {
        dates: [
          {
            games: [
              {
                gamePk: GAME_PK, // the game that just ended — should be skipped
                gameDate: '2026-04-15T17:05:00Z',
                venue: { name: 'Dodger Stadium' },
                teams: {
                  away: {
                    team: {
                      id: NYM_ID,
                      name: 'New York Mets',
                      abbreviation: 'NYM',
                    },
                    probablePitcher: null,
                  },
                  home: {
                    team: {
                      id: LAD_ID,
                      name: 'Los Angeles Dodgers',
                      abbreviation: 'LAD',
                    },
                    probablePitcher: null,
                  },
                },
              },
              {
                gamePk: 824693, // the next game
                gameDate: '2026-04-17T18:20:00Z',
                venue: { name: 'Wrigley Field' },
                teams: {
                  away: {
                    team: {
                      id: NYM_ID,
                      name: 'New York Mets',
                      abbreviation: 'NYM',
                    },
                    probablePitcher: null,
                  },
                  home: {
                    team: {
                      id: CHC_ID,
                      name: 'Chicago Cubs',
                      abbreviation: 'CHC',
                    },
                    probablePitcher: null,
                  },
                },
              },
            ],
          },
        ],
      };

      const summary = buildGameSummary(
        GAME_PK,
        FINAL_SCORE,
        9,
        false,
        feedResponse,
        boxscoreResponse,
        withCurrentGameFirst,
        NYM_ID
      );

      expect(summary.nextGame).not.toBeNull();
      expect(summary.nextGame!.gamePk).toBe(824693);
      expect(summary.nextGame!.opponent).toEqual({
        id: CHC_ID,
        name: 'Chicago Cubs',
        abbreviation: 'CHC',
      });
    });

    it('sets nextGame to null when the only game in the response is the current game', () => {
      const onlyCurrentGame: NextGameScheduleResponse = {
        dates: [
          {
            games: [
              {
                gamePk: GAME_PK,
                gameDate: '2026-04-15T17:05:00Z',
                venue: { name: 'Dodger Stadium' },
                teams: {
                  away: {
                    team: {
                      id: NYM_ID,
                      name: 'New York Mets',
                      abbreviation: 'NYM',
                    },
                    probablePitcher: null,
                  },
                  home: {
                    team: {
                      id: LAD_ID,
                      name: 'Los Angeles Dodgers',
                      abbreviation: 'LAD',
                    },
                    probablePitcher: null,
                  },
                },
              },
            ],
          },
        ],
      };

      const summary = buildGameSummary(
        GAME_PK,
        FINAL_SCORE,
        9,
        false,
        feedResponse,
        boxscoreResponse,
        onlyCurrentGame,
        NYM_ID
      );

      expect(summary.nextGame).toBeNull();
    });
  });

  describe('extra-innings game', () => {
    it('reflects isExtraInnings: true and the actual innings count', () => {
      const summary = buildGameSummary(
        GAME_PK,
        FINAL_SCORE,
        11,
        true,
        feedResponse,
        boxscoreResponse,
        nextGameResponse,
        LAD_ID
      );

      expect(summary.innings).toBe(11);
      expect(summary.isExtraInnings).toBe(true);
    });
  });
});
