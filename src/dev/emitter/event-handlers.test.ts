/**
 * Tests for the dev simulator event handlers.
 *
 * Two concerns are verified for each simulator command:
 *  1. Payload contract — the emitted Socket.IO payload satisfies the shared
 *     TypeScript interface shape at runtime (correct fields, correct values).
 *  2. Behaviour — state side-effects (e.g. score increments) and validation
 *     (e.g. rejecting commands before game-start) work as expected.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Server as SocketIOServer } from 'socket.io';
import { createStateStore } from '../state/store.ts';
import type { StateStore } from '../state/store.ts';
import {
  handlePlateAppearance,
  handleScore,
  handleOffensiveSub,
  handleDefensiveSub,
  handleSimGameSummary,
  handlePitchingChange,
  handleNewBatter,
  handlePitch,
} from './event-handlers.ts';
import { SOCKET_EVENTS } from '../../server/socket-events.ts';
import type {
  GameEventsPayload,
  PlateAppearanceCompletedEvent,
  PitchingSubstitutionEvent,
  OffensiveSubstitutionEvent,
  DefensiveSubstitutionEvent,
  GameSummary,
  AtBatState,
} from '../../server/socket-events.ts';

import type { GameUpdate } from '../../server/socket-events.ts';

// ── Helpers ──────────────────────────────────────────────────────────────────

function createMockIo(): SocketIOServer {
  return { emit: vi.fn() } as unknown as SocketIOServer;
}

/** Returns all game-events payloads that were emitted. */
function capturedGameEvents(io: SocketIOServer): GameEventsPayload[] {
  return (io.emit as ReturnType<typeof vi.fn>).mock.calls
    .filter((call: unknown[]) => call[0] === SOCKET_EVENTS.GAME_EVENTS)
    .map((call: unknown[]) => call[1] as GameEventsPayload);
}

/** Returns the first game-events payload emitted, or throws if none. */
function firstGameEventsPayload(io: SocketIOServer): GameEventsPayload {
  const payloads = capturedGameEvents(io);
  if (payloads.length === 0)
    throw new Error('No game-events payload was emitted');
  return payloads[0];
}

/** Returns the first game-update payload emitted, or throws if none. */
function firstGameUpdate(io: SocketIOServer): GameUpdate {
  const calls = (io.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
    (call: unknown[]) => call[0] === SOCKET_EVENTS.GAME_UPDATE
  );
  if (calls.length === 0) throw new Error('No game-update payload was emitted');
  return calls[0][1] as GameUpdate;
}

// ── Test setup ───────────────────────────────────────────────────────────────

let store: StateStore;
let io: SocketIOServer;

beforeEach(() => {
  store = createStateStore();
  io = createMockIo();
  // All rich-event commands require an active game
  store.setState({ gameStarted: true });
});

// ── plate-appearance ──────────────────────────────────────────────────────────

describe('handlePlateAppearance', () => {
  it('emits a game-events payload on SOCKET_EVENTS.GAME_EVENTS', () => {
    handlePlateAppearance(store, io, {});

    expect(io.emit).toHaveBeenCalledWith(
      SOCKET_EVENTS.GAME_EVENTS,
      expect.objectContaining({ gamePk: expect.any(Number) })
    );
  });

  it('payload contains exactly one plate-appearance-completed event', () => {
    handlePlateAppearance(store, io, {});

    const { events } = firstGameEventsPayload(io);
    expect(events).toHaveLength(1);
    expect(events[0].category).toBe('plate-appearance-completed');
  });

  it('plate-appearance event has all required GameEventBase fields', () => {
    handlePlateAppearance(store, io, {});

    const event = firstGameEventsPayload(io)
      .events[0] as PlateAppearanceCompletedEvent;
    expect(typeof event.gamePk).toBe('number');
    expect(typeof event.atBatIndex).toBe('number');
    expect(typeof event.inning).toBe('number');
    expect(event.halfInning).toMatch(/^(top|bottom)$/);
    expect(typeof event.battingTeam).toBe('string');
    expect(typeof event.defendingTeam).toBe('string');
    expect(typeof event.eventType).toBe('string');
    expect(typeof event.description).toBe('string');
  });

  it('plate-appearance event has required PlateAppearanceCompletedEvent fields', () => {
    handlePlateAppearance(store, io, {});

    const event = firstGameEventsPayload(io)
      .events[0] as PlateAppearanceCompletedEvent;
    expect(event.isScoringPlay).toBe(false);
    expect(typeof event.rbi).toBe('number');
    expect(typeof event.batter.id).toBe('number');
    expect(typeof event.batter.fullName).toBe('string');
    expect(typeof event.pitcher.id).toBe('number');
    expect(typeof event.pitcher.fullName).toBe('string');
    expect(Array.isArray(event.pitchSequence)).toBe(true);
  });

  it('uses the provided --type override as eventType', () => {
    handlePlateAppearance(store, io, { type: 'home_run' });

    const event = firstGameEventsPayload(io)
      .events[0] as PlateAppearanceCompletedEvent;
    expect(event.eventType).toBe('home_run');
  });

  it('returns a success result', () => {
    const result = handlePlateAppearance(store, io, {});
    expect(result.success).toBe(true);
  });

  it('fails when the game has not started', () => {
    store.setState({ gameStarted: false });
    const result = handlePlateAppearance(store, io, {});
    expect(result.success).toBe(false);
    expect(io.emit).not.toHaveBeenCalledWith(
      SOCKET_EVENTS.GAME_EVENTS,
      expect.anything()
    );
  });
});

// ── score ─────────────────────────────────────────────────────────────────────

describe('handleScore', () => {
  it('emits both game-update and game-events', () => {
    handleScore(store, io, {});

    expect(io.emit).toHaveBeenCalledWith(
      SOCKET_EVENTS.GAME_UPDATE,
      expect.anything()
    );
    expect(io.emit).toHaveBeenCalledWith(
      SOCKET_EVENTS.GAME_EVENTS,
      expect.anything()
    );
  });

  it('scoring event has isScoringPlay: true', () => {
    handleScore(store, io, {});

    const event = firstGameEventsPayload(io)
      .events[0] as PlateAppearanceCompletedEvent;
    expect(event.isScoringPlay).toBe(true);
  });

  it('increments the batting team score by 1 by default', () => {
    // Default state: Top of 1st, away (LAD) batting
    const before = store.getState().score.away;
    handleScore(store, io, {});
    expect(store.getState().score.away).toBe(before + 1);
  });

  it('increments score by the --runs override', () => {
    const before = store.getState().score.away;
    handleScore(store, io, { runs: 3 });
    expect(store.getState().score.away).toBe(before + 3);
  });

  it('sets rbi to the number of runs scored', () => {
    handleScore(store, io, { runs: 2 });

    const event = firstGameEventsPayload(io)
      .events[0] as PlateAppearanceCompletedEvent;
    expect(event.rbi).toBe(2);
  });

  it('uses the provided --type override', () => {
    handleScore(store, io, { type: 'home_run' });

    const event = firstGameEventsPayload(io)
      .events[0] as PlateAppearanceCompletedEvent;
    expect(event.eventType).toBe('home_run');
  });

  it('returns a success result', () => {
    const result = handleScore(store, io, {});
    expect(result.success).toBe(true);
  });

  it('fails when the game has not started', () => {
    store.setState({ gameStarted: false });
    const result = handleScore(store, io, {});
    expect(result.success).toBe(false);
  });

  it('emits game-update with trackingMode outs in regulation', () => {
    // Default state: inning 1, scheduledInnings 9 — regulation
    handleScore(store, io, {});

    const update = firstGameUpdate(io);
    expect(update.trackingMode).toBe('live');
  });

  it('emits game-update with trackingMode runs in extra innings', () => {
    store.setState({ inning: { number: 10, half: 'Top', ordinal: '10th' } });
    handleScore(store, io, {});

    const update = firstGameUpdate(io);
    expect(update.trackingMode).toBe('live');
  });

  it('outsRemaining is null when home team is batting (Bottom half)', () => {
    // In the simulator the tracked team is always home. During Bottom half,
    // home is batting, so outsRemaining and totalOutsRemaining must be null —
    // these fields are defending-only per the socket contract.
    store.setState({
      inning: { number: 5, half: 'Bottom', ordinal: '5th' },
      outs: 2,
      score: { away: 1, home: 2 },
    });
    handleScore(store, io, {});

    const update = firstGameUpdate(io);
    expect(update.outsRemaining).toBeNull();
    expect(update.totalOutsRemaining).toBeNull();
  });

  it('runsNeeded is null when home team is leading in extra innings', () => {
    // Home batting in Bottom of extras with a lead: game is in a walk-off
    // situation — the batting team needs 0 additional runs to win the half,
    // so runsNeeded must be null (not 1).
    store.setState({
      inning: { number: 10, half: 'Bottom', ordinal: '10th' },
      score: { away: 3, home: 5 },
    });
    handleScore(store, io, {});

    const update = firstGameUpdate(io);
    expect(update.isExtraInnings).toBe(true);
    expect(update.runsNeeded).toBeNull();
  });
});

// ── offensive-sub ─────────────────────────────────────────────────────────────

describe('handleOffensiveSub', () => {
  it('emits game-events with an offensive-substitution event', () => {
    handleOffensiveSub(store, io, {});

    const event = firstGameEventsPayload(io)
      .events[0] as OffensiveSubstitutionEvent;
    expect(event.category).toBe('offensive-substitution');
    expect(event.eventType).toBe('offensive_substitution');
  });

  it('uses the provided player name in the event', () => {
    handleOffensiveSub(store, io, { playerName: 'Pete Alonso' });

    const event = firstGameEventsPayload(io)
      .events[0] as OffensiveSubstitutionEvent;
    expect(event.player.fullName).toBe('Pete Alonso');
  });

  it('substitution event has all required GameEventBase fields', () => {
    handleOffensiveSub(store, io, {});

    const event = firstGameEventsPayload(io)
      .events[0] as OffensiveSubstitutionEvent;
    expect(typeof event.gamePk).toBe('number');
    expect(event.halfInning).toMatch(/^(top|bottom)$/);
    expect(typeof event.battingTeam).toBe('string');
    expect(typeof event.defendingTeam).toBe('string');
    expect(typeof event.player.id).toBe('number');
    expect(typeof event.player.fullName).toBe('string');
  });

  it('returns a success result', () => {
    const result = handleOffensiveSub(store, io, {});
    expect(result.success).toBe(true);
  });

  it('fails when the game has not started', () => {
    store.setState({ gameStarted: false });
    const result = handleOffensiveSub(store, io, {});
    expect(result.success).toBe(false);
  });
});

// ── defensive-sub ─────────────────────────────────────────────────────────────

describe('handleDefensiveSub', () => {
  it('emits game-events with a defensive-substitution event', () => {
    handleDefensiveSub(store, io, {});

    const event = firstGameEventsPayload(io)
      .events[0] as DefensiveSubstitutionEvent;
    expect(event.category).toBe('defensive-substitution');
    expect(event.eventType).toBe('defensive_substitution');
  });

  it('uses the provided player name', () => {
    handleDefensiveSub(store, io, { playerName: 'Brandon Nimmo' });

    const event = firstGameEventsPayload(io)
      .events[0] as DefensiveSubstitutionEvent;
    expect(event.player.fullName).toBe('Brandon Nimmo');
  });

  it('returns a success result', () => {
    const result = handleDefensiveSub(store, io, {});
    expect(result.success).toBe(true);
  });

  it('fails when the game has not started', () => {
    store.setState({ gameStarted: false });
    const result = handleDefensiveSub(store, io, {});
    expect(result.success).toBe(false);
  });
});

// ── game-summary ──────────────────────────────────────────────────────────────

describe('handleSimGameSummary', () => {
  it('emits on SOCKET_EVENTS.GAME_SUMMARY', () => {
    handleSimGameSummary(store, io);

    expect(io.emit).toHaveBeenCalledWith(
      SOCKET_EVENTS.GAME_SUMMARY,
      expect.anything()
    );
  });

  it('emits game-update with trackingMode final before game-summary', () => {
    handleSimGameSummary(store, io);

    const calls = (io.emit as ReturnType<typeof vi.fn>).mock.calls as [
      string,
      unknown,
    ][];
    const updateIdx = calls.findIndex(
      (c) => c[0] === SOCKET_EVENTS.GAME_UPDATE
    );
    const summaryIdx = calls.findIndex(
      (c) => c[0] === SOCKET_EVENTS.GAME_SUMMARY
    );
    expect(updateIdx).toBeGreaterThanOrEqual(0);
    expect(summaryIdx).toBeGreaterThan(updateIdx);

    const update = calls[updateIdx]![1] as GameUpdate;
    expect(update.trackingMode).toBe('final');
    expect(update.atBat).toBeNull();
  });

  it('emitted payload satisfies the GameSummary interface shape', () => {
    handleSimGameSummary(store, io);

    const summary = (io.emit as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === SOCKET_EVENTS.GAME_SUMMARY
    )![1] as GameSummary;

    expect(typeof summary.gamePk).toBe('number');
    expect(typeof summary.finalScore.away).toBe('number');
    expect(typeof summary.finalScore.home).toBe('number');
    expect(typeof summary.innings).toBe('number');
    expect(typeof summary.isExtraInnings).toBe('boolean');
    expect(typeof summary.decisions.winner.id).toBe('number');
    expect(typeof summary.decisions.winner.fullName).toBe('string');
    expect(typeof summary.decisions.loser.id).toBe('number');
    expect(typeof summary.decisions.loser.fullName).toBe('string');
    expect(Array.isArray(summary.topPerformers)).toBe(true);
    expect(typeof summary.boxscoreUrl).toBe('string');
    // nextGame may be null or a NextGame object
    if (summary.nextGame !== null) {
      expect(typeof summary.nextGame.gamePk).toBe('number');
      expect(typeof summary.nextGame.gameTime).toBe('string');
      expect(typeof summary.nextGame.venue).toBe('string');
    }
  });

  it('reflects the current score from store state', () => {
    store.setState({ score: { away: 3, home: 5 } });
    handleSimGameSummary(store, io);

    const summary = (io.emit as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === SOCKET_EVENTS.GAME_SUMMARY
    )![1] as GameSummary;

    expect(summary.finalScore).toEqual({ away: 3, home: 5 });
  });

  it('returns a success result', () => {
    const result = handleSimGameSummary(store, io);
    expect(result.success).toBe(true);
  });
});

// ── pitching-change co-emission ───────────────────────────────────────────────

describe('handlePitchingChange (co-emission)', () => {
  it('emits both game-update and game-events', () => {
    handlePitchingChange(store, io, { pitcherName: 'Edwin Díaz' });

    expect(io.emit).toHaveBeenCalledWith(
      SOCKET_EVENTS.GAME_UPDATE,
      expect.anything()
    );
    expect(io.emit).toHaveBeenCalledWith(
      SOCKET_EVENTS.GAME_EVENTS,
      expect.anything()
    );
  });

  it('game-events contains a pitching-substitution event', () => {
    handlePitchingChange(store, io, { pitcherName: 'Edwin Díaz' });

    const event = firstGameEventsPayload(io)
      .events[0] as PitchingSubstitutionEvent;
    expect(event.category).toBe('pitching-substitution');
    expect(event.eventType).toBe('pitching_substitution');
  });

  it('pitching-substitution player reflects the new pitcher', () => {
    handlePitchingChange(store, io, {
      pitcherId: 554430,
      pitcherName: 'Edwin Díaz',
    });

    const event = firstGameEventsPayload(io)
      .events[0] as PitchingSubstitutionEvent;
    expect(event.player.id).toBe(554430);
    expect(event.player.fullName).toBe('Edwin Díaz');
  });
});

// ── handleNewBatter ───────────────────────────────────────────────────────────

describe('handleNewBatter', () => {
  it('returns success and sets currentAtBat in state', () => {
    const result = handleNewBatter(store, io, {});

    expect(result.success).toBe(true);
    const state = store.getState();
    expect(state.currentAtBat).not.toBeNull();
    expect(state.currentAtBat?.count).toEqual({ balls: 0, strikes: 0 });
    expect(state.currentAtBat?.pitchSequence).toEqual([]);
  });

  it('uses provided batter and pitcher names and ids', () => {
    handleNewBatter(store, io, {
      batterName: 'Juan Soto',
      batterId: 665742,
      pitcherName: 'Gerrit Cole',
      pitcherId: 543037,
    });

    const atBat = store.getState().currentAtBat as AtBatState;
    expect(atBat.batter.fullName).toBe('Juan Soto');
    expect(atBat.batter.id).toBe(665742);
    expect(atBat.pitcher.fullName).toBe('Gerrit Cole');
    expect(atBat.pitcher.id).toBe(543037);
  });

  it('uses MLB battingOrder encoding (100 for slot 1)', () => {
    handleNewBatter(store, io, {});
    const atBat = store.getState().currentAtBat as AtBatState;
    expect(atBat.batter.battingOrder).toBe(100);
  });

  it('defaults batSide to R and pitchHand to R', () => {
    handleNewBatter(store, io, {});

    const atBat = store.getState().currentAtBat as AtBatState;
    expect(atBat.batSide).toBe('R');
    expect(atBat.pitchHand).toBe('R');
  });

  it('uses current pitcher from state when no pitcher option is given', () => {
    store.setState({ currentPitcher: { id: 999, fullName: 'State Pitcher' } });
    handleNewBatter(store, io, {});

    const atBat = store.getState().currentAtBat as AtBatState;
    expect(atBat.pitcher.fullName).toBe('State Pitcher');
    expect(atBat.pitcher.id).toBe(999);
  });

  it('emits a game-update with atBat populated', () => {
    handleNewBatter(store, io, { batterName: 'Pete Alonso', batterId: 624413 });

    const update = firstGameUpdate(io);
    expect(update.atBat).not.toBeNull();
    expect((update.atBat as AtBatState).batter.fullName).toBe('Pete Alonso');
  });

  it('emits a 9-player lineup', () => {
    handleNewBatter(store, io, {});
    const atBat = store.getState().currentAtBat as AtBatState;
    expect(atBat.lineup).toHaveLength(9);
  });

  it('lineup slots use MLB battingOrder encoding (100-900)', () => {
    handleNewBatter(store, io, {});
    const atBat = store.getState().currentAtBat as AtBatState;
    const orders = atBat.lineup
      .map((e) => e.battingOrder)
      .sort((a, b) => a - b);
    expect(orders).toEqual([100, 200, 300, 400, 500, 600, 700, 800, 900]);
  });

  it('batter occupies the first lineup slot', () => {
    handleNewBatter(store, io, { batterName: 'Test Batter', batterId: 77777 });
    const atBat = store.getState().currentAtBat as AtBatState;
    const slot1 = atBat.lineup.find((e) => e.battingOrder === 100);
    expect(slot1?.id).toBe(77777);
    expect(slot1?.fullName).toBe('Test Batter');
  });

  it('fails when game is not started', () => {
    store.setState({ gameStarted: false });

    const result = handleNewBatter(store, io, {});
    expect(result.success).toBe(false);
  });

  it('fails when game is ended', () => {
    store.setState({ gameEnded: true });

    const result = handleNewBatter(store, io, {});
    expect(result.success).toBe(false);
  });
});

// ── handlePitch ───────────────────────────────────────────────────────────────

describe('handlePitch', () => {
  beforeEach(() => {
    // Put an active at-bat in state
    handleNewBatter(store, io, {});
    (io.emit as ReturnType<typeof vi.fn>).mockClear();
  });

  it('returns success and appends pitch to pitchSequence', () => {
    const result = handlePitch(store, io, { call: 'Ball' });

    expect(result.success).toBe(true);
    const atBat = store.getState().currentAtBat as AtBatState;
    expect(atBat.pitchSequence).toHaveLength(1);
    expect(atBat.pitchSequence[0].call).toBe('Ball');
  });

  it('increments balls on Ball call', () => {
    handlePitch(store, io, { call: 'Ball' });

    const atBat = store.getState().currentAtBat as AtBatState;
    expect(atBat.count.balls).toBe(1);
    expect(atBat.count.strikes).toBe(0);
  });

  it('increments strikes on Strike call', () => {
    handlePitch(store, io, { call: 'Strike' });

    const atBat = store.getState().currentAtBat as AtBatState;
    expect(atBat.count.balls).toBe(0);
    expect(atBat.count.strikes).toBe(1);
  });

  it('increments strikes on Foul call', () => {
    handlePitch(store, io, { call: 'Foul' });

    const atBat = store.getState().currentAtBat as AtBatState;
    expect(atBat.count.strikes).toBe(1);
  });

  it('does not increment strikes beyond 2 on Foul', () => {
    handlePitch(store, io, { call: 'Strike' });
    handlePitch(store, io, { call: 'Strike' });
    handlePitch(store, io, { call: 'Foul' });

    const atBat = store.getState().currentAtBat as AtBatState;
    expect(atBat.count.strikes).toBe(2);
  });

  it('uses provided pitch type and speed', () => {
    handlePitch(store, io, { type: 'Slider', speed: 88, call: 'Strike' });

    const atBat = store.getState().currentAtBat as AtBatState;
    const pitch = atBat.pitchSequence[0];
    expect(pitch.pitchType).toBe('Slider');
    expect(pitch.speedMph).toBe(88);
  });

  it('defaults pitch type to Four-Seam Fastball and speed to 93', () => {
    handlePitch(store, io, {});

    const pitch = (store.getState().currentAtBat as AtBatState)
      .pitchSequence[0];
    expect(pitch.pitchType).toBe('Four-Seam Fastball');
    expect(pitch.speedMph).toBe(93);
  });

  it('assigns sequential pitchNumber across multiple pitches', () => {
    handlePitch(store, io, { call: 'Ball' });
    handlePitch(store, io, { call: 'Strike' });
    handlePitch(store, io, { call: 'Ball' });

    const seq = (store.getState().currentAtBat as AtBatState).pitchSequence;
    expect(seq.map((p) => p.pitchNumber)).toEqual([1, 2, 3]);
  });

  it('emits game-update with updated atBat after pitch', () => {
    handlePitch(store, io, { call: 'Ball' });

    const update = firstGameUpdate(io);
    expect((update.atBat as AtBatState).pitchSequence).toHaveLength(1);
    expect((update.atBat as AtBatState).count.balls).toBe(1);
  });

  it('populates tracking data with realistic Statcast values', () => {
    handlePitch(store, io, { speed: 93, call: 'Ball' });

    const pitch = (store.getState().currentAtBat as AtBatState)
      .pitchSequence[0];
    expect(pitch.tracking).not.toBeNull();
    if (pitch.tracking) {
      expect(pitch.tracking.startSpeed).toBe(93);
      expect(pitch.tracking.endSpeed).toBeLessThan(93);
      expect(pitch.tracking.breaks.spinRate).toBeGreaterThanOrEqual(2000);
      expect(pitch.tracking.breaks.spinRate).toBeLessThanOrEqual(2500);
      expect(pitch.tracking.zone).toBeGreaterThanOrEqual(1);
      expect(pitch.tracking.zone).toBeLessThanOrEqual(9);
      expect(pitch.tracking.coordinates.pX).toEqual(expect.any(Number));
      expect(pitch.tracking.breaks.spinDirection).toEqual(expect.any(Number));
    }
  });

  it('populates hitData only for in-play pitches', () => {
    handlePitch(store, io, { call: 'Ball' });
    const ballPitch = (store.getState().currentAtBat as AtBatState)
      .pitchSequence[0];
    expect(ballPitch.hitData).toBeNull();

    handlePitch(store, io, { call: 'In play' });
    const inPlayPitch = (store.getState().currentAtBat as AtBatState)
      .pitchSequence[1];
    expect(inPlayPitch.hitData).not.toBeNull();
    if (inPlayPitch.hitData) {
      expect(inPlayPitch.hitData.launchSpeed).toBeGreaterThanOrEqual(70);
      expect(inPlayPitch.hitData.launchSpeed).toBeLessThanOrEqual(120);
      expect(inPlayPitch.hitData.trajectory).toMatch(
        /ground_ball|fly_ball|line_drive|popup/
      );
      expect(inPlayPitch.hitData.location).toMatch(/^[1-9]$/);
    }
  });

  it('fails with no active at-bat', () => {
    store.setState({ currentAtBat: null });

    const result = handlePitch(store, io, { call: 'Ball' });
    expect(result.success).toBe(false);
  });
});

// ── handlePlateAppearance clears currentAtBat ─────────────────────────────────

describe('handlePlateAppearance clears active at-bat', () => {
  it('sets currentAtBat to null after a plate appearance', () => {
    // Set up an active at-bat first
    handleNewBatter(store, io, {});
    expect(store.getState().currentAtBat).not.toBeNull();

    handlePlateAppearance(store, io, {});

    expect(store.getState().currentAtBat).toBeNull();
  });

  it('plate appearance still succeeds when no currentAtBat is active', () => {
    // No handleNewBatter called
    const result = handlePlateAppearance(store, io, {});
    expect(result.success).toBe(true);
    expect(store.getState().currentAtBat).toBeNull();
  });
});

// ── buildPayload respects between-innings / final tracking mode ────────────────

describe('buildPayload atBat field vs trackingMode', () => {
  it('game-update has atBat: null during between-innings even when currentAtBat is set', async () => {
    // Start game and set an at-bat
    handleNewBatter(store, io, {});
    (io.emit as ReturnType<typeof vi.fn>).mockClear();

    // Emit in between-innings mode by advancing past batting-begins then batting-ends
    // We can directly test via handlePitchingChange → emitUpdate('live') vs a between-innings emit.
    // Simplest: import buildPayload directly and test it.
    // Instead, verify indirectly via the store state being respected by payload-factory.
    // We'll check by importing buildPayload.
    const { buildPayload } = await import('./payload-factory.ts');
    const state = store.getState();
    const update = buildPayload(state, 'between-innings');
    expect(update.atBat).toBeNull();
  });

  it('game-update carries atBat when trackingMode is outs', async () => {
    handleNewBatter(store, io, { batterName: 'Test Batter' });
    (io.emit as ReturnType<typeof vi.fn>).mockClear();

    const { buildPayload } = await import('./payload-factory.ts');
    const state = store.getState();
    const update = buildPayload(state, 'live');
    expect(update.atBat).not.toBeNull();
    expect((update.atBat as AtBatState).batter.fullName).toBe('Test Batter');
  });
});
