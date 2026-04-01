import { parseGameUpdate } from './parser.ts';
import type { ScheduleResponse, ScheduleGame } from './types.ts';

const NYM_ID = 121;
const STL_ID = 138;

function makeGame(overrides: Partial<ScheduleGame> = {}): ScheduleGame {
  return {
    gamePk: 823077,
    status: { detailedState: 'In Progress', abstractGameState: 'Live' },
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
      // Top of inning: away (NYM) is batting, home (STL) is defending
      // Target = STL (home, defending)
      const schedule = makeSchedule([makeGame()]);
      const result = parseGameUpdate(schedule, STL_ID);

      expect(result).not.toBeNull();
      expect(result!.defendingTeam).toBe('STL');
      expect(result!.outs).toBe(1);
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

  describe('when the target team is batting (not defending)', () => {
    it('returns null for the away team batting in Top of inning', () => {
      // Top of inning: away (NYM) is batting, not defending
      // Target = NYM (batting) -> should return null
      const schedule = makeSchedule([makeGame()]);
      const result = parseGameUpdate(schedule, NYM_ID);

      expect(result).toBeNull();
    });
  });

  describe('when the target team is on defense (away defending, Bottom of inning)', () => {
    it('returns a GameUpdate for the away team', () => {
      // Bottom of inning: home (STL) is batting, away (NYM) is defending
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
      expect(result!.inning.half).toBe('Bottom');
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

    it('returns null when game status is Final', () => {
      const game = makeGame({
        status: { detailedState: 'Final', abstractGameState: 'Final' },
      });
      const schedule = makeSchedule([game]);

      expect(parseGameUpdate(schedule, STL_ID)).toBeNull();
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
    });

    it('picks the correct game when multiple games exist', () => {
      const otherGame = makeGame();
      otherGame.teams.away.team = { id: 999, name: 'Other', abbreviation: 'OTH' };
      otherGame.teams.home.team = { id: 998, name: 'Another', abbreviation: 'ANO' };

      const targetGame = makeGame();
      const schedule = makeSchedule([otherGame, targetGame]);

      const result = parseGameUpdate(schedule, STL_ID);
      expect(result).not.toBeNull();
      expect(result!.defendingTeam).toBe('STL');
    });
  });
});
