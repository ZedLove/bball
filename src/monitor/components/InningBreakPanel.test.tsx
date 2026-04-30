import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { InningBreakPanel } from './InningBreakPanel.tsx';
import type {
  InningBreakSummary,
  InningBreakBatter,
} from '../../server/socket-events.ts';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeBatter(
  overrides: Partial<InningBreakBatter> = {}
): InningBreakBatter {
  return {
    id: 100001,
    fullName: 'Carlos Mendez',
    lineupPosition: 1,
    today: { hits: 1, atBats: 3, homeRuns: 0 },
    season: { avg: '.284', ops: '.802', homeRuns: 8, kPct: 0.19, bbPct: 0.09 },
    ...overrides,
  };
}

function makeSummary(
  overrides: Partial<InningBreakSummary> = {}
): InningBreakSummary {
  return {
    gamePk: 823963,
    inningLabel: 'Middle 3rd',
    scoringPlays: [],
    upcomingBatters: [
      makeBatter({ lineupPosition: 1, fullName: 'Carlos Mendez' }),
      makeBatter({
        id: 100002,
        fullName: 'Derek Holloway',
        lineupPosition: 2,
        today: { hits: 0, atBats: 2, homeRuns: 0 },
        season: {
          avg: '.261',
          ops: '.721',
          homeRuns: 3,
          kPct: 0.22,
          bbPct: 0.08,
        },
      }),
      makeBatter({
        id: 100003,
        fullName: 'Marcus Webb',
        lineupPosition: 3,
        today: { hits: 2, atBats: 3, homeRuns: 1 },
        season: {
          avg: '.311',
          ops: '.934',
          homeRuns: 12,
          kPct: 0.17,
          bbPct: 0.12,
        },
      }),
    ],
    upcomingBattingTeam: 'NYM',
    pitcher: {
      role: 'starter',
      id: 660271,
      fullName: 'Shohei Ohtani',
      gameStats: {
        inningsPitched: '4.2',
        earnedRuns: 1,
        strikeOuts: 6,
        baseOnBalls: 1,
        hits: 4,
        pitchesThrown: 72,
      },
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InningBreakPanel', () => {
  it('renders inningLabel in header', () => {
    const { lastFrame } = render(<InningBreakPanel summary={makeSummary()} />);
    expect(lastFrame()).toContain('Middle 3rd');
  });

  it('renders upcomingBattingTeam in header', () => {
    const { lastFrame } = render(<InningBreakPanel summary={makeSummary()} />);
    expect(lastFrame()).toContain('NYM');
  });

  it('shows "No runs scored yet." when scoringPlays is empty', () => {
    const { lastFrame } = render(
      <InningBreakPanel summary={makeSummary({ scoringPlays: [] })} />
    );
    expect(lastFrame()).toContain('No runs scored yet.');
  });

  it('renders both scoring plays when 2 entries are provided', () => {
    const { lastFrame } = render(
      <InningBreakPanel
        summary={makeSummary({
          scoringPlays: [
            {
              description: 'Solo home run to left',
              inning: 2,
              halfInning: 'top',
              rbi: 1,
              battingTeam: 'LAD',
            },
            {
              description: 'Sacrifice fly to center',
              inning: 2,
              halfInning: 'bottom',
              rbi: 1,
              battingTeam: 'NYM',
            },
          ],
        })}
      />
    );
    const frame = lastFrame();
    expect(frame).toContain('▲2');
    expect(frame).toContain('Solo home run to left');
    expect(frame).toContain('+1');
    expect(frame).toContain('▼2');
    expect(frame).toContain('Sacrifice fly to center');
  });

  it('renders all 3 upcoming batters with stats', () => {
    const { lastFrame } = render(<InningBreakPanel summary={makeSummary()} />);
    const frame = lastFrame();
    expect(frame).toContain('Carlos Mendez');
    expect(frame).toContain('Derek Holloway');
    expect(frame).toContain('Marcus Webb');
  });

  it('renders batter lineup position, today stats, and season rate stats', () => {
    const { lastFrame } = render(<InningBreakPanel summary={makeSummary()} />);
    const frame = lastFrame();
    // Slot 1, 1-for-3, .284 AVG, .802 OPS
    expect(frame).toContain('1. Carlos Mendez');
    expect(frame).toContain('1-3');
    expect(frame).toContain('.284 AVG');
    expect(frame).toContain('.802 OPS');
  });

  it('renders starter pitcher with IP, ER, K line', () => {
    const { lastFrame } = render(<InningBreakPanel summary={makeSummary()} />);
    const frame = lastFrame();
    expect(frame).toContain('Shohei Ohtani');
    expect(frame).toContain('4.2 IP');
    expect(frame).toContain('1 ER');
    expect(frame).toContain('6 K');
    // Should NOT show ERA for a starter
    expect(frame).not.toContain('ERA');
  });

  it('renders reliever pitcher with ERA and K/9 line', () => {
    const { lastFrame } = render(
      <InningBreakPanel
        summary={makeSummary({
          pitcher: {
            role: 'reliever',
            id: 999,
            fullName: 'Setup Sam',
            seasonStats: {
              era: '3.42',
              inningsPitched: '22.1',
              strikeoutsPer9: '9.8',
              walksPer9Inn: '2.4',
            },
          },
        })}
      />
    );
    const frame = lastFrame();
    expect(frame).toContain('Setup Sam (RP)');
    expect(frame).toContain('3.42 ERA');
    expect(frame).toContain('9.8 K/9');
    // Should NOT show IP/ER/K game-stat line
    expect(frame).not.toContain(' IP ');
  });

  it('omits pitcher section when pitcher is null', () => {
    const { lastFrame } = render(
      <InningBreakPanel summary={makeSummary({ pitcher: null })} />
    );
    const frame = lastFrame();
    expect(frame).not.toContain('Pitching');
    expect(frame).not.toContain('IP');
    expect(frame).not.toContain('ERA');
  });
});
