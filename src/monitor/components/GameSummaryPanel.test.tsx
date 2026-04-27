import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { GameSummaryPanel } from './GameSummaryPanel.tsx';
import type { GameSummary, NextGame } from '../../server/socket-events.ts';
import type { GameUpdate } from '../../server/socket-events.ts';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeTeams(): GameUpdate['teams'] {
  return {
    away: { id: 147, name: 'New York Yankees', abbreviation: 'NYY' },
    home: { id: 111, name: 'Boston Red Sox', abbreviation: 'BOS' },
  };
}

function makeNextGame(overrides: Partial<NextGame> = {}): NextGame {
  return {
    gamePk: 999001,
    opponent: { id: 141, name: 'Toronto Blue Jays', abbreviation: 'TOR' },
    gameTime: '2026-04-21T23:07:00Z',
    venue: 'Rogers Centre',
    probablePitchers: {
      home: { id: 656302, fullName: 'José Berríos' },
      away: { id: 657277, fullName: 'Carlos Rodón' },
    },
    ...overrides,
  };
}

function makeSummary(overrides: Partial<GameSummary> = {}): GameSummary {
  return {
    gamePk: 823556,
    finalScore: { away: 3, home: 5 },
    innings: 9,
    isExtraInnings: false,
    decisions: {
      winner: { id: 519242, fullName: 'Chris Sale' },
      loser: { id: 543037, fullName: 'Gerrit Cole' },
      save: null,
    },
    topPerformers: [
      {
        player: { id: 657041, fullName: 'Gleyber Torres' },
        summary: '2-for-4, HR, 2 RBI',
      },
      {
        player: { id: 519242, fullName: 'Chris Sale' },
        summary: '7.0 IP, 3 ER, 9 K',
      },
    ],
    boxscoreUrl: 'https://www.mlb.com/gameday/823556/final/box-score',
    nextGame: makeNextGame(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GameSummaryPanel', () => {
  describe('score display', () => {
    it('renders final score with team abbreviations', () => {
      const { lastFrame } = render(
        <GameSummaryPanel
          summary={makeSummary()}
          teams={makeTeams()}
          trackedTeamAbbr={null}
        />
      );
      expect(lastFrame()).toContain('NYY 3 – BOS 5');
    });

    it('renders innings count', () => {
      const { lastFrame } = render(
        <GameSummaryPanel
          summary={makeSummary()}
          teams={makeTeams()}
          trackedTeamAbbr={null}
        />
      );
      expect(lastFrame()).toContain('9 innings');
    });

    it('appends (extras) for extra-innings games', () => {
      const summary = makeSummary({ innings: 12, isExtraInnings: true });
      const { lastFrame } = render(
        <GameSummaryPanel
          summary={summary}
          teams={makeTeams()}
          trackedTeamAbbr={null}
        />
      );
      expect(lastFrame()).toContain('12 innings (extras)');
    });
  });

  describe('null teams fallback', () => {
    it('renders Away / Home placeholders when teams is null', () => {
      const { lastFrame } = render(
        <GameSummaryPanel
          summary={makeSummary()}
          teams={null}
          trackedTeamAbbr={null}
        />
      );
      const frame = lastFrame() ?? '';
      expect(frame).toContain('Away 3 – Home 5');
    });
  });

  describe('decisions', () => {
    it('renders winner and loser', () => {
      const { lastFrame } = render(
        <GameSummaryPanel
          summary={makeSummary()}
          teams={makeTeams()}
          trackedTeamAbbr={null}
        />
      );
      const frame = lastFrame() ?? '';
      expect(frame).toContain('W: Chris Sale');
      expect(frame).toContain('L: Gerrit Cole');
    });

    it('renders save when present', () => {
      const summary = makeSummary({
        decisions: {
          winner: { id: 519242, fullName: 'Chris Sale' },
          loser: { id: 543037, fullName: 'Gerrit Cole' },
          save: { id: 605200, fullName: 'Craig Kimbrel' },
        },
      });
      const { lastFrame } = render(
        <GameSummaryPanel
          summary={summary}
          teams={makeTeams()}
          trackedTeamAbbr={null}
        />
      );
      expect(lastFrame()).toContain('S: Craig Kimbrel');
    });

    it('does not render save line when save is null', () => {
      const { lastFrame } = render(
        <GameSummaryPanel
          summary={makeSummary({
            decisions: {
              winner: { id: 1, fullName: 'W' },
              loser: { id: 2, fullName: 'L' },
              save: null,
            },
          })}
          teams={makeTeams()}
          trackedTeamAbbr={null}
        />
      );
      expect(lastFrame()).not.toContain('S:');
    });
  });

  describe('top performers', () => {
    it('renders each performer with name and summary', () => {
      const { lastFrame } = render(
        <GameSummaryPanel
          summary={makeSummary()}
          teams={makeTeams()}
          trackedTeamAbbr={null}
        />
      );
      const frame = lastFrame() ?? '';
      expect(frame).toContain('Gleyber Torres');
      expect(frame).toContain('2-for-4, HR, 2 RBI');
      expect(frame).toContain('Chris Sale');
      expect(frame).toContain('7.0 IP, 3 ER, 9 K');
    });

    it('renders Top Performers label', () => {
      const { lastFrame } = render(
        <GameSummaryPanel
          summary={makeSummary()}
          teams={makeTeams()}
          trackedTeamAbbr={null}
        />
      );
      expect(lastFrame()).toContain('Top Performers');
    });

    it('omits Top Performers section when empty', () => {
      const summary = makeSummary({ topPerformers: [] });
      const { lastFrame } = render(
        <GameSummaryPanel
          summary={summary}
          teams={makeTeams()}
          trackedTeamAbbr={null}
        />
      );
      expect(lastFrame()).not.toContain('Top Performers');
    });
  });

  describe('boxscore URL', () => {
    it('renders the boxscore URL', () => {
      const { lastFrame } = render(
        <GameSummaryPanel
          summary={makeSummary()}
          teams={makeTeams()}
          trackedTeamAbbr={null}
        />
      );
      expect(lastFrame()).toContain('mlb.com/gameday/823556/final/box-score');
    });
  });

  describe('next game', () => {
    it('renders next game opponent and venue', () => {
      const { lastFrame } = render(
        <GameSummaryPanel
          summary={makeSummary()}
          teams={makeTeams()}
          trackedTeamAbbr={null}
        />
      );
      const frame = lastFrame() ?? '';
      expect(frame).toContain('TOR');
      expect(frame).toContain('Rogers Centre');
    });

    it('renders probable pitchers', () => {
      const { lastFrame } = render(
        <GameSummaryPanel
          summary={makeSummary()}
          teams={makeTeams()}
          trackedTeamAbbr={null}
        />
      );
      const frame = lastFrame() ?? '';
      expect(frame).toContain('Carlos Rodón');
      expect(frame).toContain('José Berríos');
    });

    it('renders TBD when probable pitchers are null', () => {
      const summary = makeSummary({
        nextGame: makeNextGame({
          probablePitchers: { home: null, away: null },
        }),
      });
      const { lastFrame } = render(
        <GameSummaryPanel
          summary={summary}
          teams={makeTeams()}
          trackedTeamAbbr={null}
        />
      );
      expect(lastFrame()).toContain('TBD');
    });

    it('renders "No upcoming game found" when nextGame is null', () => {
      const summary = makeSummary({ nextGame: null });
      const { lastFrame } = render(
        <GameSummaryPanel
          summary={summary}
          teams={makeTeams()}
          trackedTeamAbbr={null}
        />
      );
      expect(lastFrame()).toContain('No upcoming game found');
    });

    it('does not render "No upcoming game found" when nextGame is present', () => {
      const { lastFrame } = render(
        <GameSummaryPanel
          summary={makeSummary()}
          teams={makeTeams()}
          trackedTeamAbbr={null}
        />
      );
      expect(lastFrame()).not.toContain('No upcoming game found');
    });
  });

  describe('game final label', () => {
    it('renders Game Final header', () => {
      const { lastFrame } = render(
        <GameSummaryPanel
          summary={makeSummary()}
          teams={makeTeams()}
          trackedTeamAbbr={null}
        />
      );
      expect(lastFrame()).toContain('Game Final');
    });
  });

  describe('win/loss styling', () => {
    it('shows win header when tracked team wins as home team', () => {
      // makeSummary default: home=5, away=3 → home wins
      const { lastFrame } = render(
        <GameSummaryPanel
          summary={makeSummary()}
          teams={makeTeams()}
          trackedTeamAbbr={'BOS'}
        />
      );
      expect(lastFrame()).toContain('Win!');
    });

    it('shows win header when tracked team wins as away team', () => {
      // Flip score so away wins
      const { lastFrame } = render(
        <GameSummaryPanel
          summary={makeSummary({ finalScore: { away: 5, home: 3 } })}
          teams={makeTeams()}
          trackedTeamAbbr={'NYY'}
        />
      );
      expect(lastFrame()).toContain('Win!');
    });

    it('shows loss header when tracked team loses', () => {
      // makeSummary default: home=5, away=3 → away loses
      const { lastFrame } = render(
        <GameSummaryPanel
          summary={makeSummary()}
          teams={makeTeams()}
          trackedTeamAbbr={'NYY'}
        />
      );
      expect(lastFrame()).toContain('Loss');
    });

    it('shows neutral header when trackedTeamAbbr is null', () => {
      const { lastFrame } = render(
        <GameSummaryPanel
          summary={makeSummary()}
          teams={makeTeams()}
          trackedTeamAbbr={null}
        />
      );
      const frame = lastFrame() ?? '';
      expect(frame).toContain('Game Final');
      expect(frame).not.toContain('Win!');
      expect(frame).not.toContain('Loss');
    });
  });
});
