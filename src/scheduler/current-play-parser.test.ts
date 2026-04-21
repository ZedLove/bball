import { describe, it, expect } from 'vitest';
import { parseCurrentPlay } from './current-play-parser.ts';
import type { GameFeedLiveResponse } from './game-feed-types.ts';
import type { Linescore } from './schedule-client.ts';
import type { AtBatState } from '../server/socket-events.ts';
import fixture from './__fixtures__/game-feed-live.json' with { type: 'json' };

const feed = fixture as unknown as GameFeedLiveResponse;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLinescore(
  overrides: Partial<NonNullable<Linescore['offense']>> = {}
): Linescore {
  return {
    currentInning: 7,
    currentInningOrdinal: '7th',
    inningState: 'Bottom',
    scheduledInnings: 9,
    outs: 2,
    balls: 1,
    strikes: 2,
    teams: {
      home: { runs: 3, hits: 5, errors: 0 },
      away: { runs: 2, hits: 4, errors: 0 },
    },
    offense: {
      batter: { id: 678554, fullName: 'Curtis Mead' },
      onDeck: { id: 691781, fullName: 'Brady House' },
      inHole: { id: 682928, fullName: 'CJ Abrams' },
      battingOrder: 2,
      ...overrides,
    },
  };
}

function withCurrentPlay(
  overrides: Partial<
    NonNullable<GameFeedLiveResponse['liveData']['plays']['currentPlay']>
  >
): GameFeedLiveResponse {
  return {
    liveData: {
      plays: {
        currentPlay: {
          ...feed.liveData.plays.currentPlay!,
          ...overrides,
        },
      },
      // Preserve the boxscore so lineup/runner enrichment still works.
      boxscore: feed.liveData.boxscore,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseCurrentPlay', () => {
  describe('happy path', () => {
    it('returns a correctly shaped AtBatState from the fixture', () => {
      const result = parseCurrentPlay(feed, makeLinescore());

      expect(result).not.toBeNull();
      const state = result as AtBatState;

      expect(state.batter).toEqual({
        id: 678554,
        fullName: 'Curtis Mead',
        battingOrder: 2,
      });
      expect(state.pitcher).toEqual({ id: 676775, fullName: 'Keaton Winn' });
      expect(state.batSide).toBe('R');
      expect(state.pitchHand).toBe('R');
      expect(state.onDeck).toEqual({ id: 691781, fullName: 'Brady House' });
      expect(state.inHole).toEqual({ id: 682928, fullName: 'CJ Abrams' });
      expect(state.count).toEqual({ balls: 1, strikes: 2 });
    });

    it('returns only pitch events in pitchSequence, excluding action and pickoff events', () => {
      const result = parseCurrentPlay(feed, makeLinescore()) as AtBatState;

      // Fixture has 3 pitches, 1 action (mound_visit), 1 pickoff — only pitches should appear
      expect(result.pitchSequence).toHaveLength(3);
      expect(result.pitchSequence[0]).toMatchObject({
        pitchNumber: 1,
        pitchType: 'Sinker',
        pitchTypeCode: 'SI',
        call: 'Called Strike',
        isStrike: true,
        isBall: false,
        speedMph: 96.8,
        countAfter: { balls: 0, strikes: 1 },
        hitData: null,
      });
      expect(result.pitchSequence[0].tracking).not.toBeNull();
      expect(result.pitchSequence[0].tracking!.startSpeed).toBe(96.8);
      expect(result.pitchSequence[0].tracking!.breaks.spinRate).toBe(2290);
      expect(result.pitchSequence[1]).toMatchObject({
        pitchNumber: 2,
        pitchType: 'Four-Seam Fastball',
        call: 'Ball',
        isBall: true,
        isStrike: false,
        speedMph: 98.1,
      });
      expect(result.pitchSequence[2]).toMatchObject({
        pitchNumber: 3,
        pitchType: 'Slider',
        call: 'Swinging Strike',
        isStrike: true,
        speedMph: 88.3,
      });
    });
  });

  describe('null conditions', () => {
    it('returns null when currentPlay is null', () => {
      const noPlay: GameFeedLiveResponse = {
        liveData: { plays: { currentPlay: null } },
      };
      expect(parseCurrentPlay(noPlay, makeLinescore())).toBeNull();
    });

    it('returns null when currentPlay is undefined', () => {
      const noPlay: GameFeedLiveResponse = {
        liveData: { plays: { currentPlay: undefined } },
      };
      expect(parseCurrentPlay(noPlay, makeLinescore())).toBeNull();
    });

    it('returns null when currentPlay.about.isComplete is true', () => {
      const completedPlay = withCurrentPlay({
        about: {
          atBatIndex: 57,
          halfInning: 'bottom',
          inning: 7,
          isComplete: true,
        },
      });
      expect(parseCurrentPlay(completedPlay, makeLinescore())).toBeNull();
    });
  });

  describe('base runners', () => {
    it('populates first, second, third when all bases are occupied', () => {
      const linescore = makeLinescore({
        first: { id: 656555, fullName: 'Rhys Hoskins' },
        second: { id: 671218, fullName: 'Heliot Ramos' },
        third: { id: 669065, fullName: 'Kyle Stowers' },
      });
      const result = parseCurrentPlay(feed, linescore) as AtBatState;

      // RunnerState — id and fullName preserved
      expect(result.first).toMatchObject({
        id: 656555,
        fullName: 'Rhys Hoskins',
      });
      expect(result.second).toMatchObject({
        id: 671218,
        fullName: 'Heliot Ramos',
      });
      expect(result.third).toMatchObject({
        id: 669065,
        fullName: 'Kyle Stowers',
      });
    });

    it('sets first, second, third to null when all bases are empty', () => {
      const result = parseCurrentPlay(feed, makeLinescore()) as AtBatState;

      expect(result.first).toBeNull();
      expect(result.second).toBeNull();
      expect(result.third).toBeNull();
    });

    it('handles a partial bases-occupied scenario (first and third only)', () => {
      const linescore = makeLinescore({
        first: { id: 656555, fullName: 'Rhys Hoskins' },
        third: { id: 669065, fullName: 'Kyle Stowers' },
      });
      const result = parseCurrentPlay(feed, linescore) as AtBatState;

      expect(result.first).toMatchObject({
        id: 656555,
        fullName: 'Rhys Hoskins',
      });
      expect(result.second).toBeNull();
      expect(result.third).toMatchObject({
        id: 669065,
        fullName: 'Kyle Stowers',
      });
    });

    it('enriches runner with season SB stats from fixture boxscore (home team batting)', () => {
      // Kyle Stowers (669065) is on the home team in the fixture;
      // fixture has stolenBases: 5, caughtStealing: 2 → attempts = 7
      const linescore = makeLinescore({
        third: { id: 669065, fullName: 'Kyle Stowers' },
      });
      const result = parseCurrentPlay(feed, linescore) as AtBatState;

      expect(result.third).toEqual({
        id: 669065,
        fullName: 'Kyle Stowers',
        seasonSb: 5,
        seasonSbAttempts: 7,
      });
    });

    it('defaults seasonSb and seasonSbAttempts to 0 when runner is not in boxscore player map', () => {
      // Player id 999999 is not in the fixture boxscore
      const linescore = makeLinescore({
        first: { id: 999999, fullName: 'Unknown Runner' },
      });
      const result = parseCurrentPlay(feed, linescore) as AtBatState;

      expect(result.first).toEqual({
        id: 999999,
        fullName: 'Unknown Runner',
        seasonSb: 0,
        seasonSbAttempts: 0,
      });
    });
  });

  describe('lineup', () => {
    it('returns a 9-player lineup from the fixture boxscore', () => {
      const result = parseCurrentPlay(feed, makeLinescore()) as AtBatState;
      // Fixture home team has 9 players in battingOrder
      expect(result.lineup).toHaveLength(9);
    });

    it('orders lineup by battingOrder ascending', () => {
      const result = parseCurrentPlay(feed, makeLinescore()) as AtBatState;
      const orders = result.lineup.map((e) => e.battingOrder);
      expect(orders).toEqual([100, 200, 300, 400, 500, 600, 700, 800, 900]);
    });

    it('populates atBats, hits, and seasonOps from boxscore stats', () => {
      const result = parseCurrentPlay(feed, makeLinescore()) as AtBatState;
      // Curtis Mead (678554) is at slot 300 in fixture: atBats: 2, hits: 0, ops: ".743"
      const mead = result.lineup.find((e) => e.id === 678554);
      expect(mead).toBeDefined();
      expect(mead!.atBats).toBe(2);
      expect(mead!.hits).toBe(0);
      expect(mead!.seasonOps).toBe('.743');
    });

    it('sets seasonOps to null when ops string is empty', () => {
      // Keaton Winn (676775) is on the away team (pitcher) — not in home lineup
      // but verify a home player with empty ops would be null. Use away-half fixture.
      // For this test: halfInning 'bottom' → home team; all home players have non-empty ops
      // except a player with empty string. We test indirectly via the away team.
      // Build a feed with halfInning: 'top' so away team is batting; Keaton Winn has ops: ""
      const awayBatting = withCurrentPlay({
        about: {
          atBatIndex: 57,
          halfInning: 'top',
          inning: 7,
          isComplete: false,
        },
      });
      const result2 = parseCurrentPlay(
        awayBatting,
        makeLinescore()
      ) as AtBatState;
      const winn = result2.lineup.find((e) => e.id === 676775);
      expect(winn).toBeDefined();
      expect(winn!.seasonOps).toBeNull();
    });

    it('returns empty lineup when boxscore is absent', () => {
      const noBoxscore: GameFeedLiveResponse = {
        liveData: {
          plays: { currentPlay: feed.liveData.plays.currentPlay },
          // boxscore intentionally absent
        },
      };
      const result = parseCurrentPlay(
        noBoxscore,
        makeLinescore()
      ) as AtBatState;
      expect(result.lineup).toEqual([]);
    });
  });

  describe('optional linescore fields', () => {
    it('defaults battingOrder to 0 when absent from linescore', () => {
      const linescore = makeLinescore({ battingOrder: undefined });
      const result = parseCurrentPlay(feed, linescore) as AtBatState;

      expect(result.batter.battingOrder).toBe(0);
    });

    it('defaults onDeck to null when absent from linescore', () => {
      const linescore = makeLinescore({ onDeck: undefined });
      const result = parseCurrentPlay(feed, linescore) as AtBatState;

      expect(result.onDeck).toBeNull();
    });

    it('defaults inHole to null when absent from linescore', () => {
      const linescore = makeLinescore({ inHole: undefined });
      const result = parseCurrentPlay(feed, linescore) as AtBatState;

      expect(result.inHole).toBeNull();
    });

    it('returns null fields gracefully when offense is entirely absent', () => {
      const linescore = makeLinescore();
      delete linescore.offense;

      const result = parseCurrentPlay(feed, linescore) as AtBatState;

      expect(result.batter.battingOrder).toBe(0);
      expect(result.onDeck).toBeNull();
      expect(result.inHole).toBeNull();
      expect(result.first).toBeNull();
      expect(result.second).toBeNull();
      expect(result.third).toBeNull();
    });
  });

  describe('pitch sequence edge cases', () => {
    it('returns an empty pitchSequence when playEvents is empty', () => {
      const emptyEvents = withCurrentPlay({ playEvents: [] });
      const result = parseCurrentPlay(
        emptyEvents,
        makeLinescore()
      ) as AtBatState;

      expect(result.pitchSequence).toEqual([]);
    });

    it('returns an empty pitchSequence when all playEvents are non-pitch types', () => {
      const onlyActions = withCurrentPlay({
        playEvents: [
          {
            type: 'action',
            isPitch: false,
            details: { description: 'Mound Visit.', eventType: 'mound_visit' },
          },
          {
            type: 'pickoff',
            isPitch: false,
            details: {
              description: 'Pickoff Attempt 1B',
              eventType: 'pickoff_1b',
            },
          },
        ],
      });
      const result = parseCurrentPlay(
        onlyActions,
        makeLinescore()
      ) as AtBatState;

      expect(result.pitchSequence).toEqual([]);
    });
  });
});
