import { describe, it, expect, beforeEach } from 'vitest';
import { dashboardReducer } from './use-dashboard-state.ts';
import type { DashboardState } from '../types.ts';
import { MAX_EVENTS } from '../types.ts';
import type { GameUpdate } from '../../scheduler/parser.ts';
import type {
  GameEvent,
  GameEventsPayload,
  GameSummary,
  PlateAppearanceCompletedEvent,
} from '../../server/socket-events.ts';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

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
    trackedTeamAbbr: 'BOS',
    ...overrides,
  };
}

function makePlateAppearance(
  overrides: Partial<PlateAppearanceCompletedEvent> = {}
): PlateAppearanceCompletedEvent {
  return {
    gamePk: 123456,
    atBatIndex: 0,
    inning: 7,
    halfInning: 'top',
    battingTeam: 'NYY',
    defendingTeam: 'BOS',
    eventType: 'strikeout',
    description: 'Devers strikes out.',
    category: 'plate-appearance-completed',
    isScoringPlay: false,
    rbi: 0,
    batter: { id: 646240, fullName: 'Rafael Devers' },
    pitcher: { id: 543037, fullName: 'Gerrit Cole' },
    pitchSequence: [],
    ...overrides,
  };
}

function makeGameEvent(
  overrides: Partial<PlateAppearanceCompletedEvent> = {}
): GameEvent {
  return makePlateAppearance(overrides);
}

function makeEventsPayload(events: GameEvent[]): GameEventsPayload {
  return { gamePk: 123456, events };
}

function makeGameSummary(overrides: Partial<GameSummary> = {}): GameSummary {
  return {
    gamePk: 123456,
    finalScore: { away: 3, home: 5 },
    innings: 9,
    isExtraInnings: false,
    decisions: {
      winner: { id: 519242, fullName: 'Chris Sale' },
      loser: { id: 543037, fullName: 'Gerrit Cole' },
      save: null,
    },
    topPerformers: [],
    boxscoreUrl: 'https://www.mlb.com/gameday/123456/final/box-score',
    nextGame: null,
    ...overrides,
  };
}

function makeState(overrides: Partial<DashboardState> = {}): DashboardState {
  return {
    lastUpdate: null,
    trackedTeamAbbr: null,
    events: [],
    summary: null,
    lastHit: null,
    celebration: null,
    filter: 'all',
    pitchDisplay: 'all',
    connectedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dashboardReducer', () => {
  describe('game-update action', () => {
    it('sets lastUpdate from null', () => {
      const state = makeState();
      const update = makeGameUpdate();
      const next = dashboardReducer(state, {
        type: 'game-update',
        payload: update,
      });
      expect(next.lastUpdate).toEqual(update);
    });

    it('replaces a previous lastUpdate', () => {
      const first = makeGameUpdate({ score: { away: 1, home: 0 } });
      const second = makeGameUpdate({ score: { away: 2, home: 0 } });
      const state = makeState({ lastUpdate: first });
      const next = dashboardReducer(state, {
        type: 'game-update',
        payload: second,
      });
      expect(next.lastUpdate).toEqual(second);
    });

    it('does not mutate other state fields', () => {
      const state = makeState({ filter: 'scoring', pitchDisplay: 'last' });
      const next = dashboardReducer(state, {
        type: 'game-update',
        payload: makeGameUpdate(),
      });
      expect(next.filter).toBe('scoring');
      expect(next.pitchDisplay).toBe('last');
    });
  });

  describe('game-events action', () => {
    it('prepends new events in reverse-chronological order', () => {
      const e1 = makeGameEvent({ atBatIndex: 0 });
      const e2 = makeGameEvent({ atBatIndex: 1 });
      const state = makeState();
      const next = dashboardReducer(state, {
        type: 'game-events',
        payload: makeEventsPayload([e1, e2]),
      });
      // payload is [oldest, newest]; buffer should be [newest, oldest]
      expect(next.events[0]).toEqual(e2);
      expect(next.events[1]).toEqual(e1);
    });

    it('prepends to existing events', () => {
      const existing = makeGameEvent({ atBatIndex: 0 });
      const incoming = makeGameEvent({ atBatIndex: 1 });
      const state = makeState({ events: [existing] });
      const next = dashboardReducer(state, {
        type: 'game-events',
        payload: makeEventsPayload([incoming]),
      });
      expect(next.events[0]).toEqual(incoming);
      expect(next.events[1]).toEqual(existing);
    });

    it('caps buffer at MAX_EVENTS', () => {
      // Buffer stores newest-first (index 0 = newest, last index = oldest).
      // Build existing events so atBatIndex 0 is the oldest (last position).
      const existing = Array.from({ length: MAX_EVENTS }, (_, i) =>
        makeGameEvent({ atBatIndex: MAX_EVENTS - 1 - i })
      );
      // existing[0].atBatIndex = 19 (newest), existing[19].atBatIndex = 0 (oldest)
      const state = makeState({ events: existing });
      const newEvent = makeGameEvent({ atBatIndex: MAX_EVENTS });
      const next = dashboardReducer(state, {
        type: 'game-events',
        payload: makeEventsPayload([newEvent]),
      });
      expect(next.events).toHaveLength(MAX_EVENTS);
      // newest event is at index 0
      expect(next.events[0]).toEqual(newEvent);
      // oldest event (atBatIndex 0) was dropped off the end
      expect(
        next.events.every(
          (e) => (e as PlateAppearanceCompletedEvent).atBatIndex !== 0
        )
      ).toBe(true);
    });

    it('handles a payload with multiple events correctly', () => {
      const events = [
        makeGameEvent({ atBatIndex: 5 }),
        makeGameEvent({ atBatIndex: 6 }),
        makeGameEvent({ atBatIndex: 7 }),
      ];
      const state = makeState();
      const next = dashboardReducer(state, {
        type: 'game-events',
        payload: makeEventsPayload(events),
      });
      // Newest (index 7) first
      expect((next.events[0] as PlateAppearanceCompletedEvent).atBatIndex).toBe(
        7
      );
      expect((next.events[1] as PlateAppearanceCompletedEvent).atBatIndex).toBe(
        6
      );
      expect((next.events[2] as PlateAppearanceCompletedEvent).atBatIndex).toBe(
        5
      );
    });
  });

  describe('game-summary action', () => {
    it('sets summary', () => {
      const state = makeState();
      const summary = makeGameSummary();
      const next = dashboardReducer(state, {
        type: 'game-summary',
        payload: summary,
      });
      expect(next.summary).toEqual(summary);
    });

    it('preserves events when summary is set', () => {
      const events = [makeGameEvent()];
      const state = makeState({ events });
      const next = dashboardReducer(state, {
        type: 'game-summary',
        payload: makeGameSummary(),
      });
      expect(next.events).toEqual(events);
    });
  });

  describe('connected action', () => {
    it('sets connectedAt to a Date', () => {
      const before = new Date();
      const state = makeState();
      const next = dashboardReducer(state, { type: 'connected' });
      const after = new Date();
      expect(next.connectedAt).toBeInstanceOf(Date);
      expect(next.connectedAt!.getTime()).toBeGreaterThanOrEqual(
        before.getTime()
      );
      expect(next.connectedAt!.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('disconnected action', () => {
    it('clears connectedAt', () => {
      const state = makeState({ connectedAt: new Date() });
      const next = dashboardReducer(state, { type: 'disconnected' });
      expect(next.connectedAt).toBeNull();
    });
  });

  describe('set-filter action', () => {
    it('sets filter to scoring', () => {
      const state = makeState({ filter: 'all' });
      const next = dashboardReducer(state, {
        type: 'set-filter',
        filter: 'scoring',
      });
      expect(next.filter).toBe('scoring');
    });

    it('sets filter to all', () => {
      const state = makeState({ filter: 'scoring' });
      const next = dashboardReducer(state, {
        type: 'set-filter',
        filter: 'all',
      });
      expect(next.filter).toBe('all');
    });
  });

  describe('toggle-pitch-display action', () => {
    it('toggles from all to last', () => {
      const state = makeState({ pitchDisplay: 'all' });
      const next = dashboardReducer(state, { type: 'toggle-pitch-display' });
      expect(next.pitchDisplay).toBe('last');
    });

    it('toggles from last to all', () => {
      const state = makeState({ pitchDisplay: 'last' });
      const next = dashboardReducer(state, { type: 'toggle-pitch-display' });
      expect(next.pitchDisplay).toBe('all');
    });

    it('does not affect other state fields', () => {
      const state = makeState({ filter: 'scoring', pitchDisplay: 'all' });
      const next = dashboardReducer(state, { type: 'toggle-pitch-display' });
      expect(next.filter).toBe('scoring');
    });
  });

  describe('dismiss-hit action', () => {
    it('clears lastHit', () => {
      const hit: import('../types.ts').HitDisplay = {
        hitData: {
          launchSpeed: 107.4,
          launchAngle: 28,
          totalDistance: 425,
          trajectory: 'fly_ball',
          hardness: 'hard',
          location: '8',
          coordinates: { coordX: 113.48, coordY: 27.53 },
        },
        batter: { id: 1, fullName: 'Aaron Judge' },
        eventType: 'Home Run',
        isHomeRun: true,
        expiresAt: Date.now() + 7_000,
      };
      const state = makeState({ lastHit: hit });
      const next = dashboardReducer(state, { type: 'dismiss-hit' });
      expect(next.lastHit).toBeNull();
    });

    it('is a no-op when lastHit is already null', () => {
      const state = makeState();
      const next = dashboardReducer(state, { type: 'dismiss-hit' });
      expect(next.lastHit).toBeNull();
    });
  });

  describe('game-events — hit detection', () => {
    it('sets lastHit when a plate-appearance event has an in-play pitch with hitData', () => {
      const inPlayEvent = makePlateAppearance({
        eventType: 'home_run',
        pitchSequence: [
          {
            pitchNumber: 1,
            pitchType: 'Four-Seam Fastball',
            pitchTypeCode: 'FF',
            call: 'In play, run(s)',
            isBall: false,
            isStrike: false,
            isInPlay: true,
            speedMph: 98.1,
            countAfter: { balls: 0, strikes: 0 },
            tracking: null,
            hitData: {
              launchSpeed: 107.4,
              launchAngle: 28,
              totalDistance: 425,
              trajectory: 'fly_ball',
              hardness: 'hard',
              location: '8',
              coordinates: { coordX: 113.48, coordY: 27.53 },
            },
          },
        ],
      });
      const state = makeState();
      const next = dashboardReducer(state, {
        type: 'game-events',
        payload: makeEventsPayload([inPlayEvent]),
      });
      expect(next.lastHit).not.toBeNull();
      expect(next.lastHit!.isHomeRun).toBe(true);
      expect(next.lastHit!.batter.fullName).toBe('Rafael Devers');
      expect(next.lastHit!.hitData.totalDistance).toBe(425);
    });

    it('does not set lastHit when pitchSequence is empty', () => {
      const event = makePlateAppearance({ pitchSequence: [] });
      const state = makeState();
      const next = dashboardReducer(state, {
        type: 'game-events',
        payload: makeEventsPayload([event]),
      });
      expect(next.lastHit).toBeNull();
    });

    it('does not set lastHit when no pitch has hitData', () => {
      const event = makePlateAppearance({
        pitchSequence: [
          {
            pitchNumber: 1,
            pitchType: 'Slider',
            pitchTypeCode: 'SL',
            call: 'Strikeout',
            isBall: false,
            isStrike: true,
            isInPlay: false,
            speedMph: 85,
            countAfter: { balls: 0, strikes: 3 },
            tracking: null,
            hitData: null,
          },
        ],
      });
      const state = makeState();
      const next = dashboardReducer(state, {
        type: 'game-events',
        payload: makeEventsPayload([event]),
      });
      expect(next.lastHit).toBeNull();
    });

    it('preserves existing lastHit when new events have no in-play pitch', () => {
      const existingHit: import('../types.ts').HitDisplay = {
        hitData: {
          launchSpeed: 95,
          launchAngle: 12,
          totalDistance: 180,
          trajectory: 'ground_ball',
          hardness: 'soft',
          location: '6',
          coordinates: null,
        },
        batter: { id: 2, fullName: 'Someone Else' },
        eventType: 'Groundout',
        isHomeRun: false,
        expiresAt: Date.now() + 5_000,
      };
      const state = makeState({ lastHit: existingHit });
      const next = dashboardReducer(state, {
        type: 'game-events',
        payload: makeEventsPayload([
          makePlateAppearance({ pitchSequence: [] }),
        ]),
      });
      expect(next.lastHit).toEqual(existingHit);
    });
  });

  describe('state immutability', () => {
    it('returns a new object on every action', () => {
      const state = makeState();
      const next = dashboardReducer(state, {
        type: 'game-update',
        payload: makeGameUpdate(),
      });
      expect(next).not.toBe(state);
    });
  });

  describe('game-update — trackedTeamAbbr latch', () => {
    it('latches trackedTeamAbbr from the first payload', () => {
      const state = makeState({ trackedTeamAbbr: null });
      const next = dashboardReducer(state, {
        type: 'game-update',
        payload: makeGameUpdate({ trackedTeamAbbr: 'BOS' }),
      });
      expect(next.trackedTeamAbbr).toBe('BOS');
    });

    it('does not overwrite a latched trackedTeamAbbr', () => {
      const state = makeState({ trackedTeamAbbr: 'BOS' });
      const next = dashboardReducer(state, {
        type: 'game-update',
        payload: makeGameUpdate({ trackedTeamAbbr: 'NYY' }),
      });
      expect(next.trackedTeamAbbr).toBe('BOS');
    });
  });

  describe('game-events — celebration detection', () => {
    function makeHomeRunEvent(
      overrides: Partial<PlateAppearanceCompletedEvent> = {}
    ): PlateAppearanceCompletedEvent {
      return makePlateAppearance({
        eventType: 'home_run',
        battingTeam: 'NYY',
        batter: { id: 592450, fullName: 'Aaron Judge' },
        ...overrides,
      });
    }

    it('sets positive celebration when tracked team hits HR', () => {
      // BOS is tracked; BOS bats HR
      const state = makeState({ trackedTeamAbbr: 'BOS' });
      const hrEvent = makeHomeRunEvent({ battingTeam: 'BOS' });
      const next = dashboardReducer(state, {
        type: 'game-events',
        payload: makeEventsPayload([hrEvent]),
      });
      expect(next.celebration).not.toBeNull();
      expect(next.celebration!.polarity).toBe('positive');
      expect(next.celebration!.kind).toBe('home-run');
      expect(next.celebration!.frame).toBe(0);
    });

    it('sets negative celebration when opponent hits HR', () => {
      // BOS is tracked; NYY bats HR
      const state = makeState({ trackedTeamAbbr: 'BOS' });
      const hrEvent = makeHomeRunEvent({ battingTeam: 'NYY' });
      const next = dashboardReducer(state, {
        type: 'game-events',
        payload: makeEventsPayload([hrEvent]),
      });
      expect(next.celebration).not.toBeNull();
      expect(next.celebration!.polarity).toBe('negative');
      expect(next.celebration!.kind).toBe('home-run');
    });

    it('includes batter name in home-run celebration', () => {
      const state = makeState({ trackedTeamAbbr: 'NYY' });
      const hrEvent = makeHomeRunEvent({
        battingTeam: 'NYY',
        batter: { id: 592450, fullName: 'Aaron Judge' },
      });
      const next = dashboardReducer(state, {
        type: 'game-events',
        payload: makeEventsPayload([hrEvent]),
      });
      expect(next.celebration!.batterName).toBe('Aaron Judge');
    });

    it('does not set celebration for non-HR events', () => {
      const state = makeState({ trackedTeamAbbr: 'BOS' });
      const next = dashboardReducer(state, {
        type: 'game-events',
        payload: makeEventsPayload([
          makePlateAppearance({ eventType: 'Single' }),
        ]),
      });
      expect(next.celebration).toBeNull();
    });
  });

  describe('game-summary — win/loss celebration', () => {
    it('sets positive celebration when tracked team wins as home team', () => {
      // home=BOS, away=NYY; home wins 5-3; BOS is tracked
      const state = makeState({
        trackedTeamAbbr: 'BOS',
        lastUpdate: makeGameUpdate(),
      });
      const next = dashboardReducer(state, {
        type: 'game-summary',
        payload: makeGameSummary({ finalScore: { home: 5, away: 3 } }),
      });
      expect(next.celebration!.kind).toBe('win');
      expect(next.celebration!.polarity).toBe('positive');
    });

    it('sets negative celebration when tracked team loses as home team', () => {
      const state = makeState({
        trackedTeamAbbr: 'BOS',
        lastUpdate: makeGameUpdate(),
      });
      const next = dashboardReducer(state, {
        type: 'game-summary',
        payload: makeGameSummary({ finalScore: { home: 2, away: 5 } }),
      });
      expect(next.celebration!.kind).toBe('loss');
      expect(next.celebration!.polarity).toBe('negative');
    });

    it('sets positive celebration when tracked team wins as away team', () => {
      // NYY is tracked; NYY is away (score: away=5, home=3 → NYY wins)
      const state = makeState({
        trackedTeamAbbr: 'NYY',
        lastUpdate: makeGameUpdate(),
      });
      const next = dashboardReducer(state, {
        type: 'game-summary',
        payload: makeGameSummary({ finalScore: { home: 3, away: 5 } }),
      });
      expect(next.celebration!.kind).toBe('win');
      expect(next.celebration!.polarity).toBe('positive');
    });

    it('leaves celebration null when trackedTeamAbbr is null', () => {
      const state = makeState({ trackedTeamAbbr: null });
      const next = dashboardReducer(state, {
        type: 'game-summary',
        payload: makeGameSummary(),
      });
      expect(next.celebration).toBeNull();
    });
  });

  describe('advance-celebration-frame action', () => {
    function makeCelebration(): import('../types.ts').CelebrationState {
      return {
        kind: 'home-run',
        polarity: 'positive',
        frame: 0,
        batterName: 'Test',
        expiresAt: Date.now() + 3_000,
      };
    }

    it('increments the frame counter', () => {
      const state = makeState({ celebration: makeCelebration() });
      const next = dashboardReducer(state, {
        type: 'advance-celebration-frame',
      });
      expect(next.celebration!.frame).toBe(1);
    });

    it('is a no-op when celebration is null', () => {
      const state = makeState({ celebration: null });
      const next = dashboardReducer(state, {
        type: 'advance-celebration-frame',
      });
      expect(next).toBe(state);
    });
  });

  describe('dismiss-celebration action', () => {
    it('clears celebration', () => {
      const state = makeState({
        celebration: {
          kind: 'win',
          polarity: 'positive',
          frame: 10,
          batterName: '',
          expiresAt: Date.now() + 1_000,
        },
      });
      const next = dashboardReducer(state, { type: 'dismiss-celebration' });
      expect(next.celebration).toBeNull();
    });

    it('is a no-op when celebration is already null', () => {
      const state = makeState({ celebration: null });
      const next = dashboardReducer(state, { type: 'dismiss-celebration' });
      expect(next.celebration).toBeNull();
    });
  });
});

// Separate describe for initial state via multiple transitions
describe('dashboardReducer — chained transitions', () => {
  let state: DashboardState;

  beforeEach(() => {
    state = makeState();
  });

  it('handles connected → game-update → game-events → game-summary sequence', () => {
    state = dashboardReducer(state, { type: 'connected' });
    expect(state.connectedAt).toBeInstanceOf(Date);

    state = dashboardReducer(state, {
      type: 'game-update',
      payload: makeGameUpdate(),
    });
    expect(state.lastUpdate).not.toBeNull();

    state = dashboardReducer(state, {
      type: 'game-events',
      payload: makeEventsPayload([makeGameEvent()]),
    });
    expect(state.events).toHaveLength(1);

    state = dashboardReducer(state, {
      type: 'game-summary',
      payload: makeGameSummary(),
    });
    expect(state.summary).not.toBeNull();
    // events preserved
    expect(state.events).toHaveLength(1);
    // connectedAt still set
    expect(state.connectedAt).toBeInstanceOf(Date);
  });

  it('handles disconnected clears connectedAt but preserves lastUpdate', () => {
    state = dashboardReducer(state, { type: 'connected' });
    state = dashboardReducer(state, {
      type: 'game-update',
      payload: makeGameUpdate(),
    });
    state = dashboardReducer(state, { type: 'disconnected' });
    expect(state.connectedAt).toBeNull();
    expect(state.lastUpdate).not.toBeNull();
  });
});
