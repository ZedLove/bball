import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { EventsPanel } from './EventsPanel.tsx';
import type {
  GameEvent,
  PlateAppearanceCompletedEvent,
  PitchingSubstitutionEvent,
} from '../../server/socket-events.ts';
import type { GameUpdate } from '../../server/socket-events.ts';

const BASE_EVENT = {
  gamePk: 123456,
  atBatIndex: 0,
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
    trackingMode: 'live',
    outsRemaining: 2,
    totalOutsRemaining: 8,
    runsNeeded: null,
    currentPitcher: null,
    upcomingPitcher: null,
    atBat: null,
    pitchHistory: [],
    trackedTeamAbbr: 'BOS',
    venueId: null,
    venueFieldInfo: null,
    ...overrides,
  };
}

describe('EventsPanel', () => {
  describe('null lastUpdate (waiting state)', () => {
    it('shows waiting message', () => {
      const { lastFrame } = render(
        <EventsPanel lastUpdate={null} events={[]} filter="all" />
      );
      expect(lastFrame()).toContain('Waiting for game data');
    });

    it('does not show the panel title when waiting', () => {
      const { lastFrame } = render(
        <EventsPanel lastUpdate={null} events={[]} filter="all" />
      );
      expect(lastFrame()).not.toContain('Recent game-events');
    });
  });

  describe('with lastUpdate set', () => {
    it('shows panel title with MAX_EVENTS count', () => {
      const { lastFrame } = render(
        <EventsPanel lastUpdate={makeGameUpdate()} events={[]} filter="all" />
      );
      expect(lastFrame()).toContain('Recent game-events (last 20):');
    });

    it('renders event lines when events are present', () => {
      const events = [makePlateAppearance({ eventType: 'strikeout' })];
      const { lastFrame } = render(
        <EventsPanel
          lastUpdate={makeGameUpdate()}
          events={events}
          filter="all"
        />
      );
      expect(lastFrame()).toContain('Strikeout – Rafael Devers');
    });

    it('renders empty list without error when events is empty', () => {
      const { lastFrame } = render(
        <EventsPanel lastUpdate={makeGameUpdate()} events={[]} filter="all" />
      );
      expect(lastFrame()).toContain('Recent game-events');
      expect(lastFrame()).not.toContain('Strikeout');
    });
  });

  describe('filter: all', () => {
    it('shows all events including non-scoring PAs and substitutions', () => {
      const events: GameEvent[] = [
        makePlateAppearance({
          atBatIndex: 0,
          eventType: 'strikeout',
          isScoringPlay: false,
        }),
        makePlateAppearance({
          atBatIndex: 1,
          eventType: 'home_run',
          isScoringPlay: true,
        }),
        makePitchingSub({ atBatIndex: 2 }),
      ];
      const { lastFrame } = render(
        <EventsPanel
          lastUpdate={makeGameUpdate()}
          events={events}
          filter="all"
        />
      );
      const frame = lastFrame() ?? '';
      expect(frame).toContain('Strikeout');
      expect(frame).toContain('Home Run');
      expect(frame).toContain('Pitching Sub');
    });
  });

  describe('filter: scoring', () => {
    it('hides non-scoring plate-appearance events', () => {
      const events: GameEvent[] = [
        makePlateAppearance({ eventType: 'strikeout', isScoringPlay: false }),
      ];
      const { lastFrame } = render(
        <EventsPanel
          lastUpdate={makeGameUpdate()}
          events={events}
          filter="scoring"
        />
      );
      expect(lastFrame()).not.toContain('Strikeout');
    });

    it('shows scoring plate-appearance events', () => {
      const events: GameEvent[] = [
        makePlateAppearance({ eventType: 'home_run', isScoringPlay: true }),
      ];
      const { lastFrame } = render(
        <EventsPanel
          lastUpdate={makeGameUpdate()}
          events={events}
          filter="scoring"
        />
      );
      expect(lastFrame()).toContain('Home Run');
    });

    it('always shows substitution events regardless of filter', () => {
      const events: GameEvent[] = [
        makePlateAppearance({ eventType: 'strikeout', isScoringPlay: false }),
        makePitchingSub(),
      ];
      const { lastFrame } = render(
        <EventsPanel
          lastUpdate={makeGameUpdate()}
          events={events}
          filter="scoring"
        />
      );
      const frame = lastFrame() ?? '';
      expect(frame).not.toContain('Strikeout');
      expect(frame).toContain('Pitching Sub');
    });
  });

  describe('intent walk label', () => {
    it('shows (IBB) in label and no batter name', () => {
      const events: GameEvent[] = [
        makePlateAppearance({ eventType: 'intent_walk', isScoringPlay: false }),
      ];
      const { lastFrame } = render(
        <EventsPanel
          lastUpdate={makeGameUpdate()}
          events={events}
          filter="all"
        />
      );
      const frame = lastFrame() ?? '';
      expect(frame).toContain('Intent Walk (IBB)');
      expect(frame).not.toContain('Rafael Devers');
    });
  });
});
