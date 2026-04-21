import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { EventLine } from './EventLine.tsx';
import type {
  GameEvent,
  PlateAppearanceCompletedEvent,
  PitchingSubstitutionEvent,
} from '../../server/socket-events.ts';

const BASE_EVENT = {
  gamePk: 123456,
  atBatIndex: 5,
  inning: 7,
  halfInning: 'top' as const,
  battingTeam: 'NYY',
  defendingTeam: 'BOS',
  description: 'Test event',
};

function makePlateAppearance(
  overrides: Partial<PlateAppearanceCompletedEvent> = {}
): GameEvent {
  return {
    ...BASE_EVENT,
    category: 'plate-appearance-completed',
    eventType: 'strikeout',
    isScoringPlay: false,
    rbi: 0,
    batter: { id: 646240, fullName: 'Rafael Devers' },
    pitcher: { id: 543037, fullName: 'Gerrit Cole' },
    pitchSequence: [],
    ...overrides,
  };
}

function makePitchingSub(
  overrides: Partial<PitchingSubstitutionEvent> = {}
): GameEvent {
  return {
    ...BASE_EVENT,
    category: 'pitching-substitution',
    eventType: 'pitching_substitution',
    player: { id: 543037, fullName: 'Gerrit Cole' },
    ...overrides,
  };
}

describe('EventLine', () => {
  it('renders inning tag [T7] for top of 7th', () => {
    const event = makePlateAppearance();
    const { lastFrame } = render(<EventLine event={event} />);
    expect(lastFrame()).toContain('[T7]');
  });

  it('renders inning tag [B6] for bottom of 6th', () => {
    const event = makePlateAppearance({ inning: 6, halfInning: 'bottom' });
    const { lastFrame } = render(<EventLine event={event} />);
    expect(lastFrame()).toContain('[B6]');
  });

  it('renders ⚾ icon and label for strikeout', () => {
    const event = makePlateAppearance({ eventType: 'strikeout' });
    const { lastFrame } = render(<EventLine event={event} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('⚾');
    expect(frame).toContain('Strikeout – Rafael Devers');
  });

  it('renders 💥 icon for home_run', () => {
    const event = makePlateAppearance({
      eventType: 'home_run',
      isScoringPlay: true,
    });
    const { lastFrame } = render(<EventLine event={event} />);
    expect(lastFrame()).toContain('💥');
    expect(lastFrame()).toContain('Home Run – Rafael Devers');
  });

  it('renders intent_walk as "Intent Walk (IBB)" without batter suffix', () => {
    const event = makePlateAppearance({ eventType: 'intent_walk' });
    const { lastFrame } = render(<EventLine event={event} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Intent Walk (IBB)');
    expect(frame).not.toContain('Rafael Devers');
  });

  it('renders 🔄 icon for pitching substitution', () => {
    const event = makePitchingSub();
    const { lastFrame } = render(<EventLine event={event} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('🔄');
    expect(frame).toContain('Pitching Sub – Gerrit Cole');
  });
});
