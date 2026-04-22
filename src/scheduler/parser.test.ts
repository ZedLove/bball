import { parseGameUpdate } from './parser.ts';
import type { ScheduleResponse, ScheduleGame } from './schedule-client.ts';

const NYM_ID = 121;
const STL_ID = 138;

function makeGame(overrides: Partial<ScheduleGame> = {}): ScheduleGame {
  return {
    gamePk: 823077,
    gameDate: '2026-03-31T18:05:00Z',
    status: { detailedState: 'In Progress', abstractGameState: 'Live' },
    inningBreakLength: 120,
    teams: {
      away: {
        team: { id: NYM_ID, name: 'New York Mets', abbreviation: 'NYM' },
        score: 2,
        leagueRecord: { wins: 3, losses: 1 },
      },
      home: {
        team: { id: STL_ID, name: 'St. Louis Cardinals', abbreviation: 'STL' },
        score: 1,
        leagueRecord: { wins: 2, losses: 2 },
      },
    },
    linescore: {
      currentInning: 5,
      currentInningOrdinal: '5th',
      inningState: 'Top',
      scheduledInnings: 9,
      outs: 1,
      balls: 2,
      strikes: 1,
      teams: {
        home: { runs: 1, hits: 3, errors: 0 },
        away: { runs: 2, hits: 5, errors: 1 },
      },
    },
    ...overrides,
  };
}

function makeSchedule(games: ScheduleGame[]): ScheduleResponse {
  return { dates: [{ date: '2026-03-31', games }] };
}

describe('parseGameUpdate', () => {
  describe('when the target team is on defense (home defending, Top of inning)', () => {
    it('returns a GameUpdate for the home team', () => {
      const schedule = makeSchedule([makeGame()]);
      const result = parseGameUpdate(schedule, STL_ID);

      expect(result).not.toBeNull();
      expect(result!.defendingTeam).toBe('STL');
      expect(result!.outs).toBe(1);
      expect(result!.trackingMode).toBe('outs');
      expect(result!.outsRemaining).toBe(2);
      // Top 5th, 1 out: outsRemaining=2, futureHalfInnings=(9-5)=4 → 2 + 12 = 14
      expect(result!.totalOutsRemaining).toBe(14);
      expect(result!.runsNeeded).toBeNull();
      expect(result!.isExtraInnings).toBe(false);
      expect(result!.scheduledInnings).toBe(9);
      expect(result!.inning).toEqual({
        number: 5,
        half: 'Top',
        ordinal: '5th',
      });
      expect(result!.score).toEqual({ away: 2, home: 1 });
      expect(result!.teams.away.abbreviation).toBe('NYM');
      expect(result!.teams.home.abbreviation).toBe('STL');
      expect(result!.gameStatus).toBe('In Progress');
    });
  });

  describe('when the target team is batting in regulation', () => {
    it('returns a GameUpdate with trackingMode batting', () => {
      // Top of 5th: away (NYM) batting, home (STL) defending
      // Target = NYM (batting in regulation)
      const schedule = makeSchedule([makeGame()]);
      const result = parseGameUpdate(schedule, NYM_ID);

      expect(result).not.toBeNull();
      expect(result!.trackingMode).toBe('batting');
      expect(result!.battingTeam).toBe('NYM');
      expect(result!.defendingTeam).toBe('STL');
      expect(result!.outsRemaining).toBeNull();
      expect(result!.totalOutsRemaining).toBeNull();
      expect(result!.runsNeeded).toBeNull();
      expect(result!.isExtraInnings).toBe(false);
      expect(result!.score).toEqual({ away: 2, home: 1 });
    });
  });

  describe('when the target team is on defense (away defending, Bottom of inning)', () => {
    it('returns a GameUpdate for the away team', () => {
      const game = makeGame({
        linescore: {
          currentInning: 5,
          currentInningOrdinal: '5th',
          inningState: 'Bottom',
          scheduledInnings: 9,
          outs: 2,
          balls: 0,
          strikes: 2,
          teams: {
            home: { runs: 1, hits: 3, errors: 0 },
            away: { runs: 2, hits: 5, errors: 1 },
          },
        },
      });
      const schedule = makeSchedule([game]);
      const result = parseGameUpdate(schedule, NYM_ID);

      expect(result).not.toBeNull();
      expect(result!.defendingTeam).toBe('NYM');
      expect(result!.outs).toBe(2);
      expect(result!.trackingMode).toBe('outs');
      expect(result!.outsRemaining).toBe(1);
      // Bottom 5th, away winning (2-1): futureHalfInnings=(9-5)=4 → 1 + 12 = 13
      expect(result!.totalOutsRemaining).toBe(13);
      expect(result!.battingTeam).toBe('STL');
      expect(result!.inning.half).toBe('Bottom');
    });
  });

  describe('extra innings', () => {
    it('emits when target team is batting in extras while tied', () => {
      const game = makeGame({
        teams: {
          away: {
            team: { id: NYM_ID, name: 'New York Mets', abbreviation: 'NYM' },
            score: 3,
            leagueRecord: { wins: 3, losses: 1 },
          },
          home: {
            team: {
              id: STL_ID,
              name: 'St. Louis Cardinals',
              abbreviation: 'STL',
            },
            score: 3,
            leagueRecord: { wins: 2, losses: 2 },
          },
        },
        linescore: {
          currentInning: 10,
          currentInningOrdinal: '10th',
          inningState: 'Top',
          scheduledInnings: 9,
          outs: 1,
          balls: 0,
          strikes: 0,
          teams: {
            home: { runs: 3, hits: 6, errors: 0 },
            away: { runs: 3, hits: 7, errors: 0 },
          },
        },
      });
      const schedule = makeSchedule([game]);
      // NYM is batting (Top), game is extras, score tied → should emit
      const result = parseGameUpdate(schedule, NYM_ID);

      expect(result).not.toBeNull();
      expect(result!.trackingMode).toBe('runs');
      expect(result!.runsNeeded).toBe(1);
      expect(result!.outsRemaining).toBeNull();
      expect(result!.isExtraInnings).toBe(true);
      expect(result!.scheduledInnings).toBe(9);
    });

    it('emits when target team is batting in extras while losing', () => {
      const game = makeGame({
        teams: {
          away: {
            team: { id: NYM_ID, name: 'New York Mets', abbreviation: 'NYM' },
            score: 3,
            leagueRecord: { wins: 3, losses: 1 },
          },
          home: {
            team: {
              id: STL_ID,
              name: 'St. Louis Cardinals',
              abbreviation: 'STL',
            },
            score: 5,
            leagueRecord: { wins: 2, losses: 2 },
          },
        },
        linescore: {
          currentInning: 11,
          currentInningOrdinal: '11th',
          inningState: 'Top',
          scheduledInnings: 9,
          outs: 0,
          balls: 0,
          strikes: 0,
          teams: {
            home: { runs: 5, hits: 9, errors: 0 },
            away: { runs: 3, hits: 7, errors: 0 },
          },
        },
      });
      const schedule = makeSchedule([game]);
      // NYM batting in 11th, losing 3-5 → need 3 runs
      const result = parseGameUpdate(schedule, NYM_ID);

      expect(result).not.toBeNull();
      expect(result!.trackingMode).toBe('runs');
      expect(result!.runsNeeded).toBe(3);
      expect(result!.isExtraInnings).toBe(true);
    });

    it('returns null when target team is batting in extras with a lead', () => {
      const game = makeGame({
        teams: {
          away: {
            team: { id: NYM_ID, name: 'New York Mets', abbreviation: 'NYM' },
            score: 5,
            leagueRecord: { wins: 3, losses: 1 },
          },
          home: {
            team: {
              id: STL_ID,
              name: 'St. Louis Cardinals',
              abbreviation: 'STL',
            },
            score: 3,
            leagueRecord: { wins: 2, losses: 2 },
          },
        },
        linescore: {
          currentInning: 10,
          currentInningOrdinal: '10th',
          inningState: 'Top',
          scheduledInnings: 9,
          outs: 1,
          balls: 0,
          strikes: 0,
          teams: {
            home: { runs: 3, hits: 6, errors: 0 },
            away: { runs: 5, hits: 9, errors: 0 },
          },
        },
      });
      const schedule = makeSchedule([game]);
      // NYM batting in extras but winning 5-3 → no tracking needed
      const result = parseGameUpdate(schedule, NYM_ID);

      expect(result).toBeNull();
    });

    it('tracks outs when defending in extras (totalOutsRemaining is null)', () => {
      const game = makeGame({
        teams: {
          away: {
            team: { id: NYM_ID, name: 'New York Mets', abbreviation: 'NYM' },
            score: 3,
            leagueRecord: { wins: 3, losses: 1 },
          },
          home: {
            team: {
              id: STL_ID,
              name: 'St. Louis Cardinals',
              abbreviation: 'STL',
            },
            score: 3,
            leagueRecord: { wins: 2, losses: 2 },
          },
        },
        linescore: {
          currentInning: 10,
          currentInningOrdinal: '10th',
          inningState: 'Top',
          scheduledInnings: 9,
          outs: 2,
          balls: 0,
          strikes: 0,
          teams: {
            home: { runs: 3, hits: 6, errors: 0 },
            away: { runs: 3, hits: 7, errors: 0 },
          },
        },
      });
      const schedule = makeSchedule([game]);
      // STL defending (Top), extras → track outs but totalOutsRemaining is null
      const result = parseGameUpdate(schedule, STL_ID);

      expect(result).not.toBeNull();
      expect(result!.trackingMode).toBe('outs');
      expect(result!.outsRemaining).toBe(1);
      expect(result!.totalOutsRemaining).toBeNull();
      expect(result!.isExtraInnings).toBe(true);
    });

    it('reduces totalOutsRemaining when away is defending and losing (excludes final bottom inning)', () => {
      // Bottom 5th, away defending, away LOSING (1-2)
      // futureHalfInnings = (9 - 5 - 1) = 3 (Bottom 9 excluded) → 1 + 9 = 10
      const game = makeGame({
        teams: {
          away: {
            team: { id: NYM_ID, name: 'New York Mets', abbreviation: 'NYM' },
            score: 1,
            leagueRecord: { wins: 3, losses: 1 },
          },
          home: {
            team: {
              id: STL_ID,
              name: 'St. Louis Cardinals',
              abbreviation: 'STL',
            },
            score: 2,
            leagueRecord: { wins: 2, losses: 2 },
          },
        },
        linescore: {
          currentInning: 5,
          currentInningOrdinal: '5th',
          inningState: 'Bottom',
          scheduledInnings: 9,
          outs: 2,
          balls: 0,
          strikes: 0,
          teams: {
            home: { runs: 2, hits: 4, errors: 0 },
            away: { runs: 1, hits: 3, errors: 1 },
          },
        },
      });
      const schedule = makeSchedule([game]);
      const result = parseGameUpdate(schedule, NYM_ID);

      expect(result).not.toBeNull();
      expect(result!.outsRemaining).toBe(1);
      expect(result!.totalOutsRemaining).toBe(10);
    });

    it('totalOutsRemaining collapses to outsRemaining in the bottom of the final scheduled inning', () => {
      // Bottom 9th, away defending, away winning (5-3): no future half-innings → totalOutsRemaining = outsRemaining
      const game = makeGame({
        teams: {
          away: {
            team: { id: NYM_ID, name: 'New York Mets', abbreviation: 'NYM' },
            score: 5,
            leagueRecord: { wins: 3, losses: 1 },
          },
          home: {
            team: {
              id: STL_ID,
              name: 'St. Louis Cardinals',
              abbreviation: 'STL',
            },
            score: 3,
            leagueRecord: { wins: 2, losses: 2 },
          },
        },
        linescore: {
          currentInning: 9,
          currentInningOrdinal: '9th',
          inningState: 'Bottom',
          scheduledInnings: 9,
          outs: 1,
          balls: 0,
          strikes: 0,
          teams: {
            home: { runs: 3, hits: 6, errors: 0 },
            away: { runs: 5, hits: 9, errors: 0 },
          },
        },
      });
      const schedule = makeSchedule([game]);
      const result = parseGameUpdate(schedule, NYM_ID);

      expect(result).not.toBeNull();
      expect(result!.outsRemaining).toBe(2);
      expect(result!.totalOutsRemaining).toBe(2);
    });

    it('changes regulation batting from null to batting mode', () => {
      // Bottom of 7th, STL batting (home team) → regulation, trackingMode batting
      const game = makeGame({
        linescore: {
          currentInning: 7,
          currentInningOrdinal: '7th',
          inningState: 'Bottom',
          scheduledInnings: 9,
          outs: 1,
          balls: 0,
          strikes: 0,
          teams: {
            home: { runs: 1, hits: 3, errors: 0 },
            away: { runs: 2, hits: 5, errors: 1 },
          },
        },
      });
      const schedule = makeSchedule([game]);
      const result = parseGameUpdate(schedule, STL_ID);

      expect(result).not.toBeNull();
      expect(result!.trackingMode).toBe('batting');
      expect(result!.battingTeam).toBe('STL');
      expect(result!.defendingTeam).toBe('NYM');
      expect(result!.outsRemaining).toBeNull();
      expect(result!.totalOutsRemaining).toBeNull();
      expect(result!.runsNeeded).toBeNull();
      expect(result!.isExtraInnings).toBe(false);
    });

    it('handles home team batting in bottom of extras while tied', () => {
      const game = makeGame({
        teams: {
          away: {
            team: { id: NYM_ID, name: 'New York Mets', abbreviation: 'NYM' },
            score: 4,
            leagueRecord: { wins: 3, losses: 1 },
          },
          home: {
            team: {
              id: STL_ID,
              name: 'St. Louis Cardinals',
              abbreviation: 'STL',
            },
            score: 4,
            leagueRecord: { wins: 2, losses: 2 },
          },
        },
        linescore: {
          currentInning: 12,
          currentInningOrdinal: '12th',
          inningState: 'Bottom',
          scheduledInnings: 9,
          outs: 0,
          balls: 0,
          strikes: 0,
          teams: {
            home: { runs: 4, hits: 8, errors: 0 },
            away: { runs: 4, hits: 7, errors: 0 },
          },
        },
      });
      const schedule = makeSchedule([game]);
      // STL batting (Bottom), extras, tied → track runs
      const result = parseGameUpdate(schedule, STL_ID);

      expect(result).not.toBeNull();
      expect(result!.trackingMode).toBe('runs');
      expect(result!.runsNeeded).toBe(1);
      expect(result!.isExtraInnings).toBe(true);
      expect(result!.inning.half).toBe('Bottom');
      expect(result!.inning.number).toBe(12);
    });
  });

  describe('edge cases', () => {
    it('returns null when dates array is empty', () => {
      const result = parseGameUpdate({ dates: [] }, NYM_ID);
      expect(result).toBeNull();
    });

    it('returns null when no games match the target team', () => {
      const game = makeGame();
      game.teams.away.team.id = 999;
      game.teams.home.team.id = 998;
      const schedule = makeSchedule([game]);

      expect(parseGameUpdate(schedule, NYM_ID)).toBeNull();
    });

    it('returns null when the game is not in progress', () => {
      const game = makeGame({
        status: { detailedState: 'Pre-Game', abstractGameState: 'Preview' },
      });
      const schedule = makeSchedule([game]);

      expect(parseGameUpdate(schedule, STL_ID)).toBeNull();
    });

    it('returns final mode when game status is Final', () => {
      const game = makeGame({
        status: { detailedState: 'Final', abstractGameState: 'Final' },
      });
      const schedule = makeSchedule([game]);

      const result = parseGameUpdate(schedule, STL_ID);
      expect(result).not.toBeNull();
      expect(result!.trackingMode).toBe('final');
      expect(result!.gameStatus).toBe('Final');
    });

    it('returns null when linescore is missing', () => {
      const game = makeGame();
      delete (game as any).linescore;
      const schedule = makeSchedule([game]);

      expect(parseGameUpdate(schedule, STL_ID)).toBeNull();
    });

    it('handles 0 outs correctly', () => {
      const game = makeGame({
        linescore: {
          ...makeGame().linescore!,
          outs: 0,
        },
      });
      const schedule = makeSchedule([game]);
      const result = parseGameUpdate(schedule, STL_ID);

      expect(result).not.toBeNull();
      expect(result!.outs).toBe(0);
      expect(result!.outsRemaining).toBe(3);
      // Top 5th, 0 outs, home defending: 3 + (9-5)*3 = 15
      expect(result!.totalOutsRemaining).toBe(15);
    });

    it('picks the correct game when multiple games exist', () => {
      const otherGame = makeGame();
      otherGame.teams.away.team = {
        id: 999,
        name: 'Other',
        abbreviation: 'OTH',
      };
      otherGame.teams.home.team = {
        id: 998,
        name: 'Another',
        abbreviation: 'ANO',
      };

      const targetGame = makeGame();
      const schedule = makeSchedule([otherGame, targetGame]);

      const result = parseGameUpdate(schedule, STL_ID);
      expect(result).not.toBeNull();
      expect(result!.defendingTeam).toBe('STL');
      // Top 5th, 1 out, home defending: 2 + (9-5)*3 = 14
      expect(result!.totalOutsRemaining).toBe(14);
    });
  });

  describe('between-innings states', () => {
    it('returns between-innings mode on Middle state (after Top half)', () => {
      const game = makeGame({
        inningBreakLength: 120,
        linescore: {
          currentInning: 3,
          currentInningOrdinal: '3rd',
          inningState: 'Middle',
          scheduledInnings: 9,
          outs: 3,
          balls: 0,
          strikes: 0,
          teams: {
            home: { runs: 1, hits: 2, errors: 0 },
            away: { runs: 0, hits: 1, errors: 0 },
          },
        },
      });
      const schedule = makeSchedule([game]);
      const result = parseGameUpdate(schedule, STL_ID);

      expect(result).not.toBeNull();
      expect(result!.trackingMode).toBe('between-innings');
      expect(result!.inningBreakLength).toBe(120);
      expect(result!.outsRemaining).toBeNull();
      expect(result!.totalOutsRemaining).toBeNull();
      expect(result!.runsNeeded).toBeNull();
      expect(result!.inning.half).toBe('Middle');
      // Middle: home bats next (Bottom), away defends next
      expect(result!.battingTeam).toBe('STL');
      expect(result!.defendingTeam).toBe('NYM');
    });

    it('returns between-innings mode on End state (after Bottom half)', () => {
      const game = makeGame({
        inningBreakLength: 120,
        linescore: {
          currentInning: 5,
          currentInningOrdinal: '5th',
          inningState: 'End',
          scheduledInnings: 9,
          outs: 3,
          balls: 0,
          strikes: 0,
          teams: {
            home: { runs: 2, hits: 4, errors: 0 },
            away: { runs: 1, hits: 3, errors: 0 },
          },
        },
      });
      const schedule = makeSchedule([game]);
      const result = parseGameUpdate(schedule, NYM_ID);

      expect(result).not.toBeNull();
      expect(result!.trackingMode).toBe('between-innings');
      expect(result!.inningBreakLength).toBe(120);
      expect(result!.inning.half).toBe('End');
      // End: away bats next (Top), home defends next
      expect(result!.battingTeam).toBe('NYM');
      expect(result!.defendingTeam).toBe('STL');
    });

    it('falls back to 120 when inningBreakLength is absent', () => {
      const game = makeGame({
        linescore: {
          currentInning: 7,
          currentInningOrdinal: '7th',
          inningState: 'Middle',
          scheduledInnings: 9,
          outs: 3,
          balls: 0,
          strikes: 0,
          teams: {
            home: { runs: 3, hits: 5, errors: 0 },
            away: { runs: 2, hits: 4, errors: 0 },
          },
        },
      });
      delete (game as any).inningBreakLength;
      const schedule = makeSchedule([game]);
      const result = parseGameUpdate(schedule, STL_ID);

      expect(result).not.toBeNull();
      expect(result!.trackingMode).toBe('between-innings');
      expect(result!.inningBreakLength).toBe(120);
    });
  });

  describe('delay detection', () => {
    it('returns an update with isDelayed true for a rain delay', () => {
      const game = makeGame({
        status: { detailedState: 'Delayed: Rain', abstractGameState: 'Live' },
      });
      const schedule = makeSchedule([game]);
      const result = parseGameUpdate(schedule, STL_ID);

      expect(result).not.toBeNull();
      expect(result!.isDelayed).toBe(true);
      expect(result!.delayDescription).toBe('Delayed: Rain');
    });

    it('returns an update with isDelayed true for a suspended game', () => {
      const game = makeGame({
        status: { detailedState: 'Suspended', abstractGameState: 'Live' },
      });
      const schedule = makeSchedule([game]);
      const result = parseGameUpdate(schedule, STL_ID);

      expect(result).not.toBeNull();
      expect(result!.isDelayed).toBe(true);
      expect(result!.delayDescription).toBe('Suspended');
    });

    it('returns null for a postponed game', () => {
      const game = makeGame({
        status: { detailedState: 'Postponed', abstractGameState: 'Final' },
      });
      const schedule = makeSchedule([game]);

      expect(parseGameUpdate(schedule, STL_ID)).toBeNull();
    });

    it('isDelayed is false and delayDescription is null for an in-progress game', () => {
      const schedule = makeSchedule([makeGame()]);
      const result = parseGameUpdate(schedule, STL_ID);

      expect(result).not.toBeNull();
      expect(result!.isDelayed).toBe(false);
      expect(result!.delayDescription).toBeNull();
    });

    it('tracks a replay review as an in-progress game', () => {
      const game = makeGame({
        status: {
          detailedState: 'In Progress - Review',
          abstractGameState: 'Live',
        },
      });
      const schedule = makeSchedule([game]);
      const result = parseGameUpdate(schedule, STL_ID);

      expect(result).not.toBeNull();
      expect(result!.gameStatus).toBe('In Progress - Review');
      expect(result!.isDelayed).toBe(false);
      expect(result!.delayDescription).toBeNull();
      expect(result!.trackingMode).toBe('outs');
      expect(result!.defendingTeam).toBe('STL');
      expect(result!.outs).toBe(1);
    });
  });

  describe('pitcher detection', () => {
    it('extracts currentPitcher from linescore.defense during active play', () => {
      const game = makeGame({
        linescore: {
          ...makeGame().linescore!,
          defense: { pitcher: { id: 12345, fullName: 'Max Scherzer' } },
        },
      });
      const schedule = makeSchedule([game]);
      const result = parseGameUpdate(schedule, STL_ID);

      expect(result).not.toBeNull();
      expect(result!.currentPitcher).toEqual({
        id: 12345,
        fullName: 'Max Scherzer',
        pitchesThrown: 0,
        strikes: 0,
        balls: 0,
        usage: [],
      });
      expect(result!.pitchHistory).toEqual([]);
      expect(result!.venueId).toBeNull();
      expect(result!.venueFieldInfo).toBeNull();
      expect(result!.upcomingPitcher).toBeNull();
    });

    it('sets venueId from game.venue.id when present', () => {
      const schedule = makeSchedule([
        makeGame({ venue: { id: 3313, name: 'Yankee Stadium' } }),
      ]);
      const result = parseGameUpdate(schedule, STL_ID);
      expect(result!.venueId).toBe(3313);
      expect(result!.venueFieldInfo).toBeNull();
    });

    it('sets currentPitcher to null when defense is absent during active play', () => {
      const schedule = makeSchedule([makeGame()]);
      const result = parseGameUpdate(schedule, STL_ID);

      expect(result).not.toBeNull();
      expect(result!.currentPitcher).toBeNull();
      expect(result!.upcomingPitcher).toBeNull();
    });

    it('exposes upcoming pitcher in upcomingPitcher (not currentPitcher) during between-innings', () => {
      // Middle state: the MLB API has already rotated linescore.defense.pitcher
      // to the next half-inning's pitcher. It must not appear as currentPitcher.
      const game = makeGame({
        inningBreakLength: 120,
        linescore: {
          currentInning: 3,
          currentInningOrdinal: '3rd',
          inningState: 'Middle',
          scheduledInnings: 9,
          outs: 3,
          balls: 0,
          strikes: 0,
          teams: {
            home: { runs: 1, hits: 2, errors: 0 },
            away: { runs: 0, hits: 1, errors: 0 },
          },
          defense: { pitcher: { id: 99999, fullName: 'Patrick Corbin' } },
        },
      });
      const schedule = makeSchedule([game]);
      const result = parseGameUpdate(schedule, STL_ID);

      expect(result).not.toBeNull();
      expect(result!.trackingMode).toBe('between-innings');
      expect(result!.currentPitcher).toBeNull();
      expect(result!.upcomingPitcher).toEqual({
        id: 99999,
        fullName: 'Patrick Corbin',
      });
    });

    it('sets both pitcher fields to null when defense is absent during between-innings', () => {
      const game = makeGame({
        inningBreakLength: 120,
        linescore: {
          currentInning: 3,
          currentInningOrdinal: '3rd',
          inningState: 'Middle',
          scheduledInnings: 9,
          outs: 3,
          balls: 0,
          strikes: 0,
          teams: {
            home: { runs: 1, hits: 2, errors: 0 },
            away: { runs: 0, hits: 1, errors: 0 },
          },
        },
      });
      const schedule = makeSchedule([game]);
      const result = parseGameUpdate(schedule, STL_ID);

      expect(result).not.toBeNull();
      expect(result!.trackingMode).toBe('between-innings');
      expect(result!.currentPitcher).toBeNull();
      expect(result!.upcomingPitcher).toBeNull();
    });
  });

  describe('final game detection', () => {
    it('returns final mode when game is Final', () => {
      const game = makeGame({
        teams: {
          away: {
            team: { id: NYM_ID, name: 'New York Mets', abbreviation: 'NYM' },
            score: 2,
            leagueRecord: { wins: 3, losses: 1 },
          },
          home: {
            team: {
              id: STL_ID,
              name: 'St. Louis Cardinals',
              abbreviation: 'STL',
            },
            score: 4,
            leagueRecord: { wins: 2, losses: 2 },
          },
        },
        status: { detailedState: 'Final', abstractGameState: 'Final' },
        linescore: {
          currentInning: 9,
          currentInningOrdinal: '9th',
          inningState: 'Bottom',
          scheduledInnings: 9,
          outs: 2,
          balls: 0,
          strikes: 0,
          teams: {
            home: { runs: 4, hits: 8, errors: 0 },
            away: { runs: 2, hits: 5, errors: 1 },
          },
        },
      });
      const schedule = makeSchedule([game]);
      const result = parseGameUpdate(schedule, STL_ID);

      expect(result).not.toBeNull();
      expect(result!.trackingMode).toBe('final');
      expect(result!.gameStatus).toBe('Final');
      expect(result!.score).toEqual({ away: 2, home: 4 });
      expect(result!.inning.half).toBe('Bottom');
      expect(result!.isExtraInnings).toBe(false);
    });

    it('returns final mode even when game ends between innings', () => {
      // If API sends Final with a between-innings state, still emit final mode
      const game = makeGame({
        teams: {
          away: {
            team: { id: NYM_ID, name: 'New York Mets', abbreviation: 'NYM' },
            score: 3,
            leagueRecord: { wins: 3, losses: 1 },
          },
          home: {
            team: {
              id: STL_ID,
              name: 'St. Louis Cardinals',
              abbreviation: 'STL',
            },
            score: 3,
            leagueRecord: { wins: 2, losses: 2 },
          },
        },
        status: { detailedState: 'Final', abstractGameState: 'Final' },
        linescore: {
          currentInning: 9,
          currentInningOrdinal: '9th',
          inningState: 'End',
          scheduledInnings: 9,
          outs: 3,
          balls: 0,
          strikes: 0,
          teams: {
            home: { runs: 3, hits: 7, errors: 0 },
            away: { runs: 3, hits: 6, errors: 0 },
          },
        },
      });
      const schedule = makeSchedule([game]);
      const result = parseGameUpdate(schedule, NYM_ID);

      expect(result).not.toBeNull();
      expect(result!.trackingMode).toBe('final');
      // Should still have inning info for context
      expect(result!.inning.half).toBe('End');
    });

    it('returns final mode for extra innings game that ends', () => {
      const game = makeGame({
        teams: {
          away: {
            team: { id: NYM_ID, name: 'New York Mets', abbreviation: 'NYM' },
            score: 4,
            leagueRecord: { wins: 3, losses: 1 },
          },
          home: {
            team: {
              id: STL_ID,
              name: 'St. Louis Cardinals',
              abbreviation: 'STL',
            },
            score: 5,
            leagueRecord: { wins: 2, losses: 2 },
          },
        },
        status: { detailedState: 'Final', abstractGameState: 'Final' },
        linescore: {
          currentInning: 11,
          currentInningOrdinal: '11th',
          inningState: 'Top',
          scheduledInnings: 9,
          outs: 1,
          balls: 0,
          strikes: 0,
          teams: {
            home: { runs: 5, hits: 10, errors: 0 },
            away: { runs: 4, hits: 9, errors: 0 },
          },
        },
      });
      const schedule = makeSchedule([game]);
      const result = parseGameUpdate(schedule, STL_ID);

      expect(result).not.toBeNull();
      expect(result!.trackingMode).toBe('final');
      expect(result!.isExtraInnings).toBe(true);
      expect(result!.scheduledInnings).toBe(9);
    });
  });
});
