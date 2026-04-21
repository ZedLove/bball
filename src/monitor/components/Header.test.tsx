import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { Header } from './Header.tsx';
import type { GameUpdate } from '../../scheduler/parser.ts';
import type { AtBatState } from '../../server/socket-events.ts';

function makeAtBat(overrides: Partial<AtBatState> = {}): AtBatState {
  return {
    batter: { id: 646240, fullName: 'Rafael Devers', battingOrder: 400 },
    pitcher: { id: 543037, fullName: 'Gerrit Cole' },
    batSide: 'L',
    pitchHand: 'R',
    onDeck: null,
    inHole: null,
    first: null,
    second: null,
    third: null,
    count: { balls: 1, strikes: 2 },
    pitchSequence: [],
    lineup: [],
    ...overrides,
  };
}

function makeGameUpdate(overrides: Partial<GameUpdate> = {}): GameUpdate {
  return {
    gameStatus: 'In Progress',
    gamePk: 123456,
    teams: {
      away: { id: 147, name: 'New York Yankees', abbreviation: 'NYY' },
      home: { id: 111, name: 'Boston Red Sox', abbreviation: 'BOS' },
    },
    score: { away: 3, home: 5 },
    inning: { number: 7, half: 'Top', ordinal: '7th' },
    outs: 1,
    defendingTeam: 'BOS',
    battingTeam: 'NYY',
    isDelayed: false,
    delayDescription: null,
    isExtraInnings: false,
    scheduledInnings: 9,
    trackingMode: 'outs',
    outsRemaining: 2,
    totalOutsRemaining: 8,
    runsNeeded: null,
    currentPitcher: { id: 543037, fullName: 'Gerrit Cole' },
    upcomingPitcher: null,
    inningBreakLength: null,
    atBat: null,
    ...overrides,
  };
}

describe('Header', () => {
  describe('null lastUpdate', () => {
    it('shows waiting message', () => {
      const { lastFrame } = render(<Header lastUpdate={null} />);
      expect(lastFrame()).toContain('Waiting for game data');
    });
  });

  describe('trackingMode: outs', () => {
    it('renders score', () => {
      const { lastFrame } = render(<Header lastUpdate={makeGameUpdate()} />);
      const frame = lastFrame() ?? '';
      expect(frame).toContain('NYY 3');
      expect(frame).toContain('BOS 5');
    });

    it('renders inning with up arrow for Top', () => {
      const { lastFrame } = render(<Header lastUpdate={makeGameUpdate()} />);
      expect(lastFrame()).toContain('⬆ 7th');
    });

    it('renders down arrow for Bottom half', () => {
      const update = makeGameUpdate({
        inning: { number: 3, half: 'Bottom', ordinal: '3rd' },
      });
      const { lastFrame } = render(<Header lastUpdate={update} />);
      expect(lastFrame()).toContain('⬇ 3rd');
    });

    it('renders outs', () => {
      const { lastFrame } = render(
        <Header lastUpdate={makeGameUpdate({ outs: 2 })} />
      );
      expect(lastFrame()).toContain('2 out');
    });

    it('renders pitcher name', () => {
      const { lastFrame } = render(<Header lastUpdate={makeGameUpdate()} />);
      expect(lastFrame()).toContain('Gerrit Cole');
    });

    it('renders count when atBat is set', () => {
      const update = makeGameUpdate({
        atBat: makeAtBat({ count: { balls: 2, strikes: 1 } }),
      });
      const { lastFrame } = render(<Header lastUpdate={update} />);
      expect(lastFrame()).toContain('2-1');
    });

    it('omits count when atBat is null', () => {
      const update = makeGameUpdate({ atBat: null });
      const { lastFrame } = render(<Header lastUpdate={update} />);
      // Count field like "X-X" should not appear (outs won't have a dash in "1 out")
      const frame = lastFrame() ?? '';
      expect(frame).not.toMatch(/\d-\d/);
    });

    it('renders pitch count from pitchSequence length', () => {
      const pitchSequence = [{} as never, {} as never, {} as never];
      const update = makeGameUpdate({
        atBat: makeAtBat({ pitchSequence }),
      });
      const { lastFrame } = render(<Header lastUpdate={update} />);
      expect(lastFrame()).toContain('P: ');
      expect(lastFrame()).toContain('3');
    });

    it('does not render [EXTRAS] in outs mode', () => {
      const { lastFrame } = render(<Header lastUpdate={makeGameUpdate()} />);
      expect(lastFrame()).not.toContain('[EXTRAS]');
    });
  });

  describe('trackingMode: batting', () => {
    it('renders score and inning (same as outs)', () => {
      const update = makeGameUpdate({ trackingMode: 'batting' });
      const { lastFrame } = render(<Header lastUpdate={update} />);
      const frame = lastFrame() ?? '';
      expect(frame).toContain('NYY');
      expect(frame).toContain('7th');
    });
  });

  describe('trackingMode: runs (extras)', () => {
    it('renders [EXTRAS] badge', () => {
      const update = makeGameUpdate({
        trackingMode: 'runs',
        isExtraInnings: true,
        runsNeeded: 2,
      });
      const { lastFrame } = render(<Header lastUpdate={update} />);
      expect(lastFrame()).toContain('[EXTRAS]');
    });

    it('renders runsNeeded plural', () => {
      const update = makeGameUpdate({
        trackingMode: 'runs',
        isExtraInnings: true,
        runsNeeded: 2,
      });
      const { lastFrame } = render(<Header lastUpdate={update} />);
      expect(lastFrame()).toContain('Need 2 runs');
    });

    it('renders runsNeeded singular', () => {
      const update = makeGameUpdate({
        trackingMode: 'runs',
        isExtraInnings: true,
        runsNeeded: 1,
      });
      const { lastFrame } = render(<Header lastUpdate={update} />);
      expect(lastFrame()).toContain('Need 1 run');
      expect(lastFrame()).not.toContain('Need 1 runs');
    });
  });

  describe('trackingMode: between-innings', () => {
    it('shows BETWEEN INNINGS text', () => {
      const update = makeGameUpdate({
        trackingMode: 'between-innings',
        upcomingPitcher: { id: 519242, fullName: 'Chris Sale' },
        inningBreakLength: 120,
      });
      const { lastFrame } = render(<Header lastUpdate={update} />);
      expect(lastFrame()).toContain('BETWEEN INNINGS');
    });

    it('shows upcoming pitcher name', () => {
      const update = makeGameUpdate({
        trackingMode: 'between-innings',
        upcomingPitcher: { id: 519242, fullName: 'Chris Sale' },
        inningBreakLength: 120,
      });
      const { lastFrame } = render(<Header lastUpdate={update} />);
      expect(lastFrame()).toContain('Chris Sale');
    });

    it('shows break length', () => {
      const update = makeGameUpdate({
        trackingMode: 'between-innings',
        upcomingPitcher: { id: 519242, fullName: 'Chris Sale' },
        inningBreakLength: 120,
      });
      const { lastFrame } = render(<Header lastUpdate={update} />);
      expect(lastFrame()).toContain('120s');
    });

    it('does not show score in between-innings mode', () => {
      const update = makeGameUpdate({
        trackingMode: 'between-innings',
        upcomingPitcher: { id: 519242, fullName: 'Chris Sale' },
        inningBreakLength: 120,
      });
      const { lastFrame } = render(<Header lastUpdate={update} />);
      // Score like "NYY 3 – BOS 5" should not appear
      expect(lastFrame()).not.toContain('–');
    });

    it('gracefully handles null upcomingPitcher', () => {
      const update = makeGameUpdate({
        trackingMode: 'between-innings',
        upcomingPitcher: null,
        inningBreakLength: 120,
      });
      const { lastFrame } = render(<Header lastUpdate={update} />);
      expect(lastFrame()).toContain('Unknown');
    });
  });

  describe('trackingMode: final', () => {
    it('shows FINAL text', () => {
      const update = makeGameUpdate({ trackingMode: 'final' });
      const { lastFrame } = render(<Header lastUpdate={update} />);
      expect(lastFrame()).toContain('FINAL');
    });

    it('does not show score in final mode', () => {
      const update = makeGameUpdate({ trackingMode: 'final' });
      const { lastFrame } = render(<Header lastUpdate={update} />);
      expect(lastFrame()).not.toContain('NYY 3');
    });
  });

  describe('delay indicator', () => {
    it('shows delay badge when isDelayed is true', () => {
      const update = makeGameUpdate({
        isDelayed: true,
        delayDescription: 'Delayed: Rain',
      });
      const { lastFrame } = render(<Header lastUpdate={update} />);
      expect(lastFrame()).toContain('[DELAYED: Delayed: Rain]');
    });

    it('does not show delay badge when isDelayed is false', () => {
      const { lastFrame } = render(<Header lastUpdate={makeGameUpdate()} />);
      expect(lastFrame()).not.toContain('[DELAYED');
    });
  });
});
