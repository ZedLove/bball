import { describe, it, expect } from 'vitest';
import { buildInningBreakSummary } from './inning-break-parser.ts';
import type {
  GameFeedLiveResponse,
  LiveBoxscorePlayer,
  LiveBoxscorePitchingStats,
  LiveBoxscoreSeasonPitchingStats,
  AllPlay,
} from './game-feed-types.ts';
import type { InningBreakBatter } from '../server/socket-events.ts';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

const HOME_ABBR = 'TOR';
const AWAY_ABBR = 'NYM';
const GAME_PK = 12345;

function makeAllPlay(overrides: Partial<AllPlay> = {}): AllPlay {
  return {
    atBatIndex: 0,
    result: {
      eventType: 'strikeout',
      description: 'Player A strikes out swinging.',
      rbi: 0,
    },
    about: {
      atBatIndex: 0,
      halfInning: 'top',
      inning: 1,
      isComplete: true,
      isScoringPlay: false,
    },
    matchup: {
      batter: { id: 100, fullName: 'Player A' },
      pitcher: { id: 200, fullName: 'Pitcher X' },
    },
    playEvents: [],
    ...overrides,
  };
}

function makePitchingStats(
  overrides: Partial<LiveBoxscorePitchingStats> = {}
): LiveBoxscorePitchingStats {
  return {
    gamesPlayed: 1,
    gamesStarted: 1,
    inningsPitched: '5.0',
    earnedRuns: 2,
    strikeOuts: 6,
    baseOnBalls: 1,
    hits: 4,
    pitchesThrown: 82,
    ...overrides,
  };
}

function makeSeasonPitchingStats(
  overrides: Partial<LiveBoxscoreSeasonPitchingStats> = {}
): LiveBoxscoreSeasonPitchingStats {
  return {
    era: '3.45',
    inningsPitched: '18.0',
    strikeOuts: 36,
    baseOnBalls: 9,
    battersFaced: 144,
    ...overrides,
  };
}

function makePlayer(
  id: number,
  fullName: string,
  battingOrderSlot: number,
  overrides: Partial<LiveBoxscorePlayer> = {}
): LiveBoxscorePlayer {
  return {
    person: { id, fullName },
    battingOrder: battingOrderSlot * 100, // encode as slot×100
    stats: {
      batting: { atBats: 3, hits: 1, homeRuns: 0 },
      pitching: makePitchingStats({ gamesStarted: 0 }),
    },
    seasonStats: {
      batting: {
        stolenBases: 5,
        caughtStealing: 1,
        ops: '.780',
        avg: '.265',
        homeRuns: 8,
        strikeOuts: 60,
        baseOnBalls: 30,
        plateAppearances: 200,
      },
      pitching: makeSeasonPitchingStats(),
    },
    ...overrides,
  };
}

/** Build a 9-player roster where battingOrder[i] is player ID = 1000 + i+1. */
function makeNinePlayers(): Record<string, LiveBoxscorePlayer> {
  const players: Record<string, LiveBoxscorePlayer> = {};
  for (let slot = 1; slot <= 9; slot++) {
    const id = 1000 + slot;
    const key = `ID${id}`;
    players[key] = makePlayer(id, `Batter ${slot}`, slot);
  }
  return players;
}

function makeNineBattingOrder(): number[] {
  return Array.from({ length: 9 }, (_, i) => 1000 + i + 1);
}

/** Make the pitcher player (ID 9001) as a starter with given gamesStarted. */
function makePitcherPlayer(
  id: number,
  fullName: string,
  gamesStarted: number
): LiveBoxscorePlayer {
  return makePlayer(id, fullName, 0, {
    battingOrder: 0,
    stats: {
      batting: { atBats: 0, hits: 0, homeRuns: 0 },
      pitching: makePitchingStats({ gamesStarted }),
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
      pitching: makeSeasonPitchingStats({
        era: '2.17',
        inningsPitched: '12.1',
      }),
    },
  });
}

function makeFeed(
  overrides: {
    allPlays?: AllPlay[];
    homePlayers?: Record<string, LiveBoxscorePlayer>;
    awayPlayers?: Record<string, LiveBoxscorePlayer>;
    homeBattingOrder?: number[];
    awayBattingOrder?: number[];
    noBoxscore?: boolean;
  } = {}
): GameFeedLiveResponse {
  const homePlayers = overrides.homePlayers ?? makeNinePlayers();
  const awayPlayers = overrides.awayPlayers ?? makeNinePlayers();
  const homeBattingOrder = overrides.homeBattingOrder ?? makeNineBattingOrder();
  const awayBattingOrder = overrides.awayBattingOrder ?? makeNineBattingOrder();

  return {
    liveData: {
      plays: {
        allPlays: overrides.allPlays ?? [],
        currentPlay: null,
      },
      boxscore: overrides.noBoxscore
        ? undefined
        : {
            teams: {
              home: { battingOrder: homeBattingOrder, players: homePlayers },
              away: { battingOrder: awayBattingOrder, players: awayPlayers },
            },
          },
    },
  };
}

/** Call the function with all required args using sensible defaults. */
function call(
  feed: GameFeedLiveResponse,
  opts: {
    upcomingBattingSide?: 'home' | 'away';
    upcomingBattingTeam?: string;
    pitcherId?: number | null;
    inningLabel?: string;
  } = {}
) {
  return buildInningBreakSummary(
    GAME_PK,
    feed,
    opts.inningLabel ?? 'End 3rd',
    opts.upcomingBattingTeam ?? HOME_ABBR,
    opts.upcomingBattingSide ?? 'home',
    opts.pitcherId !== undefined ? opts.pitcherId : null,
    HOME_ABBR,
    AWAY_ABBR
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildInningBreakSummary', () => {
  describe('null / malformed response', () => {
    it('returns null when boxscore is absent', () => {
      const feed = makeFeed({ noBoxscore: true });
      expect(call(feed)).toBeNull();
    });
  });

  describe('top-level shape', () => {
    it('returns correct gamePk and inningLabel', () => {
      const result = call(makeFeed(), { inningLabel: 'Middle 4th' });
      expect(result).not.toBeNull();
      expect(result!.gamePk).toBe(GAME_PK);
      expect(result!.inningLabel).toBe('Middle 4th');
    });

    it('returns correct upcomingBattingTeam', () => {
      const result = call(makeFeed(), {
        upcomingBattingTeam: 'NYY',
        upcomingBattingSide: 'away',
      });
      expect(result!.upcomingBattingTeam).toBe('NYY');
    });
  });

  describe('scoring plays', () => {
    it('returns empty array when no scoring plays have occurred', () => {
      const plays = [
        makeAllPlay({
          atBatIndex: 0,
          about: {
            atBatIndex: 0,
            halfInning: 'top',
            inning: 1,
            isComplete: true,
            isScoringPlay: false,
          },
        }),
      ];
      const result = call(makeFeed({ allPlays: plays }));
      expect(result!.scoringPlays).toEqual([]);
    });

    it('returns all plays when fewer than 5 scoring plays exist', () => {
      const plays = [
        makeAllPlay({
          atBatIndex: 0,
          about: {
            atBatIndex: 0,
            halfInning: 'bottom',
            inning: 1,
            isComplete: true,
            isScoringPlay: true,
          },
          result: {
            eventType: 'home_run',
            description: 'Torres homers.',
            rbi: 1,
          },
        }),
        makeAllPlay({
          atBatIndex: 1,
          about: {
            atBatIndex: 1,
            halfInning: 'top',
            inning: 2,
            isComplete: true,
            isScoringPlay: true,
          },
          result: {
            eventType: 'single',
            description: 'Smith singles.',
            rbi: 2,
          },
        }),
        makeAllPlay({
          atBatIndex: 2,
          about: {
            atBatIndex: 2,
            halfInning: 'bottom',
            inning: 2,
            isComplete: true,
            isScoringPlay: true,
          },
          result: {
            eventType: 'double',
            description: 'Jones doubles.',
            rbi: 1,
          },
        }),
      ];
      const result = call(makeFeed({ allPlays: plays }));
      expect(result!.scoringPlays).toHaveLength(3);
    });

    it('returns last 5 when more than 5 scoring plays exist', () => {
      const plays: AllPlay[] = [];
      for (let i = 0; i < 8; i++) {
        plays.push(
          makeAllPlay({
            atBatIndex: i,
            about: {
              atBatIndex: i,
              halfInning: 'bottom',
              inning: i + 1,
              isComplete: true,
              isScoringPlay: true,
            },
            result: {
              eventType: 'home_run',
              description: `Play ${i}.`,
              rbi: 1,
            },
          })
        );
      }
      const result = call(makeFeed({ allPlays: plays }));
      expect(result!.scoringPlays).toHaveLength(5);
    });

    it('returns scoring plays most recent first', () => {
      const plays = [
        makeAllPlay({
          atBatIndex: 0,
          about: {
            atBatIndex: 0,
            halfInning: 'bottom',
            inning: 1,
            isComplete: true,
            isScoringPlay: true,
          },
          result: { eventType: 'hr', description: 'First.', rbi: 1 },
        }),
        makeAllPlay({
          atBatIndex: 1,
          about: {
            atBatIndex: 1,
            halfInning: 'bottom',
            inning: 2,
            isComplete: true,
            isScoringPlay: true,
          },
          result: { eventType: 'hr', description: 'Second.', rbi: 1 },
        }),
      ];
      const result = call(makeFeed({ allPlays: plays }));
      expect(result!.scoringPlays[0].inning).toBe(2);
      expect(result!.scoringPlays[1].inning).toBe(1);
    });

    it('skips incomplete plays', () => {
      const plays = [
        makeAllPlay({
          atBatIndex: 0,
          about: {
            atBatIndex: 0,
            halfInning: 'bottom',
            inning: 1,
            isComplete: false,
            isScoringPlay: true,
          },
          result: { eventType: 'hr', description: 'Incomplete.', rbi: 1 },
        }),
      ];
      const result = call(makeFeed({ allPlays: plays }));
      expect(result!.scoringPlays).toEqual([]);
    });

    it('attributes scoring plays to the correct team based on halfInning', () => {
      const plays = [
        makeAllPlay({
          atBatIndex: 0,
          about: {
            atBatIndex: 0,
            halfInning: 'top',
            inning: 1,
            isComplete: true,
            isScoringPlay: true,
          },
          result: { eventType: 'hr', description: 'Away scores.', rbi: 1 },
        }),
        makeAllPlay({
          atBatIndex: 1,
          about: {
            atBatIndex: 1,
            halfInning: 'bottom',
            inning: 1,
            isComplete: true,
            isScoringPlay: true,
          },
          result: { eventType: 'hr', description: 'Home scores.', rbi: 2 },
        }),
      ];
      const result = call(makeFeed({ allPlays: plays }));
      // Most recent first: bottom inning 1 then top inning 1
      expect(result!.scoringPlays[0].battingTeam).toBe(HOME_ABBR);
      expect(result!.scoringPlays[1].battingTeam).toBe(AWAY_ABBR);
    });
  });

  describe('upcoming batters', () => {
    it('starts from slot 0 (leadoff) when no plays exist for the upcoming team', () => {
      // No plays in feed — upcoming team is home (bottom-batting side)
      const result = call(makeFeed({ allPlays: [] }), {
        upcomingBattingSide: 'home',
      });
      // lastSlotIndex = -1, so next 3 start at slot index 0, 1, 2
      expect(result!.upcomingBatters).toHaveLength(3);
      expect(result!.upcomingBatters[0].lineupPosition).toBe(1);
      expect(result!.upcomingBatters[1].lineupPosition).toBe(2);
      expect(result!.upcomingBatters[2].lineupPosition).toBe(3);
    });

    it('returns next 3 batters after the last batter in the correct half', () => {
      // Last home (bottom) batter was at slot index 4 (slot 5 = battingOrder 500)
      // So upcoming = slots 5, 6, 7 (0-based indices), lineupPosition 6, 7, 8
      const homePlayers = makeNinePlayers();
      // Give last batter (ID 1005, slot 5) a recent play in 'bottom' half
      const plays = [
        makeAllPlay({
          atBatIndex: 10,
          about: {
            atBatIndex: 10,
            halfInning: 'bottom',
            inning: 3,
            isComplete: true,
            isScoringPlay: false,
          },
          matchup: {
            batter: { id: 1005, fullName: 'Batter 5' },
            pitcher: { id: 200, fullName: 'P' },
          },
        }),
      ];
      const result = call(makeFeed({ allPlays: plays, homePlayers }), {
        upcomingBattingSide: 'home',
      });
      expect(result!.upcomingBatters).toHaveLength(3);
      expect(result!.upcomingBatters[0].lineupPosition).toBe(6);
      expect(result!.upcomingBatters[1].lineupPosition).toBe(7);
      expect(result!.upcomingBatters[2].lineupPosition).toBe(8);
    });

    it('wraps around correctly when last batter was slot 8 (9th batter)', () => {
      const homePlayers = makeNinePlayers();
      // Last home batter: slot 9 = battingOrder 900, slot index 8
      const plays = [
        makeAllPlay({
          atBatIndex: 5,
          about: {
            atBatIndex: 5,
            halfInning: 'bottom',
            inning: 2,
            isComplete: true,
            isScoringPlay: false,
          },
          matchup: {
            batter: { id: 1009, fullName: 'Batter 9' },
            pitcher: { id: 200, fullName: 'P' },
          },
        }),
      ];
      const result = call(makeFeed({ allPlays: plays, homePlayers }), {
        upcomingBattingSide: 'home',
      });
      // Slot index 8 was last → next 3: index 0 (LP 1), 1 (LP 2), 2 (LP 3)
      expect(result!.upcomingBatters[0].lineupPosition).toBe(1);
      expect(result!.upcomingBatters[1].lineupPosition).toBe(2);
      expect(result!.upcomingBatters[2].lineupPosition).toBe(3);
    });

    it('wraps around correctly when last batter was slot 7 (two wraps needed for 3rd batter)', () => {
      const homePlayers = makeNinePlayers();
      const plays = [
        makeAllPlay({
          atBatIndex: 5,
          about: {
            atBatIndex: 5,
            halfInning: 'bottom',
            inning: 2,
            isComplete: true,
            isScoringPlay: false,
          },
          matchup: {
            batter: { id: 1007, fullName: 'Batter 7' },
            pitcher: { id: 200, fullName: 'P' },
          },
        }),
      ];
      const result = call(makeFeed({ allPlays: plays, homePlayers }), {
        upcomingBattingSide: 'home',
      });
      // Slot index 6 (slot 7) was last → next 3: index 7 (LP 8), 8 (LP 9), 0 (LP 1)
      expect(result!.upcomingBatters[0].lineupPosition).toBe(8);
      expect(result!.upcomingBatters[1].lineupPosition).toBe(9);
      expect(result!.upcomingBatters[2].lineupPosition).toBe(1);
    });

    it('uses plays for the correct half-inning side (ignores opposing team plays)', () => {
      const homePlayers = makeNinePlayers();
      // Only top-half (away) plays — should not affect upcoming home batters
      const plays = [
        makeAllPlay({
          atBatIndex: 3,
          about: {
            atBatIndex: 3,
            halfInning: 'top',
            inning: 1,
            isComplete: true,
            isScoringPlay: false,
          },
          matchup: {
            batter: { id: 1005, fullName: 'Batter 5' },
            pitcher: { id: 200, fullName: 'P' },
          },
        }),
      ];
      const result = call(makeFeed({ allPlays: plays, homePlayers }), {
        upcomingBattingSide: 'home',
      });
      // No bottom plays → lastSlotIndex = -1 → starts from slot 0
      expect(result!.upcomingBatters[0].lineupPosition).toBe(1);
    });

    it('takes the highest atBatIndex when multiple plays exist for the upcoming team', () => {
      const homePlayers = makeNinePlayers();
      const plays = [
        makeAllPlay({
          atBatIndex: 2,
          about: {
            atBatIndex: 2,
            halfInning: 'bottom',
            inning: 1,
            isComplete: true,
            isScoringPlay: false,
          },
          matchup: {
            batter: { id: 1003, fullName: 'Batter 3' },
            pitcher: { id: 200, fullName: 'P' },
          },
        }),
        makeAllPlay({
          atBatIndex: 7,
          about: {
            atBatIndex: 7,
            halfInning: 'bottom',
            inning: 2,
            isComplete: true,
            isScoringPlay: false,
          },
          matchup: {
            batter: { id: 1006, fullName: 'Batter 6' },
            pitcher: { id: 200, fullName: 'P' },
          },
        }),
        makeAllPlay({
          atBatIndex: 4,
          about: {
            atBatIndex: 4,
            halfInning: 'bottom',
            inning: 2,
            isComplete: true,
            isScoringPlay: false,
          },
          matchup: {
            batter: { id: 1005, fullName: 'Batter 5' },
            pitcher: { id: 200, fullName: 'P' },
          },
        }),
      ];
      const result = call(makeFeed({ allPlays: plays, homePlayers }), {
        upcomingBattingSide: 'home',
      });
      // Highest atBatIndex=7, batter 1006 = slot 6 (index 5) → next: index 6, 7, 8 = LP 7, 8, 9
      expect(result!.upcomingBatters[0].lineupPosition).toBe(7);
    });

    it('maps batter today and season stats correctly', () => {
      const homePlayers = makeNinePlayers();
      // Customise batter in slot 1 (ID 1001)
      homePlayers['ID1001'] = makePlayer(1001, 'Custom Player', 1, {
        stats: {
          batting: { atBats: 4, hits: 2, homeRuns: 1 },
          pitching: makePitchingStats({ gamesStarted: 0 }),
        },
        seasonStats: {
          batting: {
            stolenBases: 3,
            caughtStealing: 1,
            ops: '.855',
            avg: '.310',
            homeRuns: 15,
            strikeOuts: 50,
            baseOnBalls: 40,
            plateAppearances: 200,
          },
          pitching: makeSeasonPitchingStats(),
        },
      });
      const result = call(makeFeed({ allPlays: [], homePlayers }), {
        upcomingBattingSide: 'home',
      });
      const batter = result!.upcomingBatters[0] as InningBreakBatter;
      expect(batter.id).toBe(1001);
      expect(batter.fullName).toBe('Custom Player');
      expect(batter.today).toEqual({ hits: 2, atBats: 4, homeRuns: 1 });
      expect(batter.season.avg).toBe('.310');
      expect(batter.season.ops).toBe('.855');
      expect(batter.season.homeRuns).toBe(15);
      // kPct = 50 / 200 = 0.25
      expect(batter.season.kPct).toBe(0.25);
      // bbPct = 40 / 200 = 0.20
      expect(batter.season.bbPct).toBe(0.2);
    });

    it('sets kPct and bbPct to 0 when plateAppearances is 0', () => {
      const homePlayers = makeNinePlayers();
      homePlayers['ID1001'] = makePlayer(1001, 'Rookie', 1, {
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
          pitching: makeSeasonPitchingStats(),
        },
      });
      const result = call(makeFeed({ allPlays: [], homePlayers }), {
        upcomingBattingSide: 'home',
      });
      expect(result!.upcomingBatters[0].season.kPct).toBe(0);
      expect(result!.upcomingBatters[0].season.bbPct).toBe(0);
    });
  });

  describe('pitcher context', () => {
    it('returns null when upcomingPitcherId is null', () => {
      const result = call(makeFeed(), { pitcherId: null });
      expect(result!.pitcher).toBeNull();
    });

    it('returns null when pitcher ID is not found in the defending team roster', () => {
      const result = call(makeFeed(), { pitcherId: 9999 });
      expect(result!.pitcher).toBeNull();
    });

    it('returns starter context when gamesStarted === 1', () => {
      const PITCHER_ID = 9001;
      const awayPlayers = {
        ...makeNinePlayers(),
        [`ID${PITCHER_ID}`]: makePitcherPlayer(PITCHER_ID, 'Ace Pitcher', 1),
      };
      const feed = makeFeed({ awayPlayers });
      const result = call(feed, {
        upcomingBattingSide: 'home', // defending = away
        pitcherId: PITCHER_ID,
      });
      expect(result!.pitcher).not.toBeNull();
      expect(result!.pitcher!.role).toBe('starter');
      expect(result!.pitcher!.fullName).toBe('Ace Pitcher');
      const starter = result!.pitcher!;
      if (starter.role === 'starter') {
        expect(starter.gameStats.inningsPitched).toBe('5.0');
        expect(starter.gameStats.earnedRuns).toBe(2);
        expect(starter.gameStats.strikeOuts).toBe(6);
        expect(starter.gameStats.pitchesThrown).toBe(82);
      }
    });

    it('returns reliever context when gamesStarted !== 1', () => {
      const PITCHER_ID = 9002;
      const awayPlayers = {
        ...makeNinePlayers(),
        [`ID${PITCHER_ID}`]: makePitcherPlayer(PITCHER_ID, 'Relief Pitcher', 0),
      };
      const feed = makeFeed({ awayPlayers });
      const result = call(feed, {
        upcomingBattingSide: 'home', // defending = away
        pitcherId: PITCHER_ID,
      });
      expect(result!.pitcher!.role).toBe('reliever');
      expect(result!.pitcher!.fullName).toBe('Relief Pitcher');
      const reliever = result!.pitcher!;
      if (reliever.role === 'reliever') {
        expect(reliever.seasonStats.era).toBe('2.17');
        expect(reliever.seasonStats.inningsPitched).toBe('12.1');
        // kPct = 36 / 144 = 0.25
        expect(reliever.seasonStats.kPct).toBe(0.25);
        // bbPct = 9 / 144 = 0.0625 → Math.round(0.0625 * 100) / 100 = 0.06
        expect(reliever.seasonStats.bbPct).toBe(0.06);
      }
    });

    it('sets kPct and bbPct to 0 when battersFaced is 0', () => {
      const PITCHER_ID = 9004;
      const awayPlayers = {
        ...makeNinePlayers(),
        [`ID${PITCHER_ID}`]: makePitcherPlayer(PITCHER_ID, 'New Reliever', 0),
      };
      // Override seasonStats to battersFaced: 0
      awayPlayers[`ID${PITCHER_ID}`]!.seasonStats.pitching =
        makeSeasonPitchingStats({
          era: '0.00',
          inningsPitched: '0.0',
          strikeOuts: 0,
          baseOnBalls: 0,
          battersFaced: 0,
        });
      const feed = makeFeed({ awayPlayers });
      const result = call(feed, {
        upcomingBattingSide: 'home',
        pitcherId: PITCHER_ID,
      });
      const reliever = result!.pitcher!;
      if (reliever.role === 'reliever') {
        expect(reliever.seasonStats.kPct).toBe(0);
        expect(reliever.seasonStats.bbPct).toBe(0);
      }
    });

    it('looks up pitcher in home roster when defending side is home', () => {
      const PITCHER_ID = 9003;
      const homePlayers = {
        ...makeNinePlayers(),
        [`ID${PITCHER_ID}`]: makePitcherPlayer(PITCHER_ID, 'Home Pitcher', 1),
      };
      const feed = makeFeed({ homePlayers });
      const result = call(feed, {
        upcomingBattingSide: 'away', // defending = home
        pitcherId: PITCHER_ID,
      });
      expect(result!.pitcher!.role).toBe('starter');
      expect(result!.pitcher!.fullName).toBe('Home Pitcher');
    });
  });
});
