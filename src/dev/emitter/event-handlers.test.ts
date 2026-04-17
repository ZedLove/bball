/**
 * Tests for the dev simulator event handlers (Phase 5A parity).
 *
 * Two concerns are verified for each Feature 1 command:
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
} from './event-handlers.ts';
import { SOCKET_EVENTS } from '../../server/socket-events.ts';
import type {
  GameEventsPayload,
  PlateAppearanceCompletedEvent,
  PitchingSubstitutionEvent,
  OffensiveSubstitutionEvent,
  DefensiveSubstitutionEvent,
  GameSummary,
} from '../../server/socket-events.ts';

import type { GameUpdate } from '../../scheduler/parser.ts';

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
  if (payloads.length === 0) throw new Error('No game-events payload was emitted');
  return payloads[0];
}

/** Returns the first game-update payload emitted, or throws if none. */
function firstGameUpdate(io: SocketIOServer): GameUpdate {
  const calls = (io.emit as ReturnType<typeof vi.fn>).mock.calls
    .filter((call: unknown[]) => call[0] === SOCKET_EVENTS.GAME_UPDATE);
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
      expect.objectContaining({ gamePk: expect.any(Number) }),
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

    const event = firstGameEventsPayload(io).events[0] as PlateAppearanceCompletedEvent;
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

    const event = firstGameEventsPayload(io).events[0] as PlateAppearanceCompletedEvent;
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

    const event = firstGameEventsPayload(io).events[0] as PlateAppearanceCompletedEvent;
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
    expect(io.emit).not.toHaveBeenCalledWith(SOCKET_EVENTS.GAME_EVENTS, expect.anything());
  });
});

// ── score ─────────────────────────────────────────────────────────────────────

describe('handleScore', () => {
  it('emits both game-update and game-events', () => {
    handleScore(store, io, {});

    expect(io.emit).toHaveBeenCalledWith(SOCKET_EVENTS.GAME_UPDATE, expect.anything());
    expect(io.emit).toHaveBeenCalledWith(SOCKET_EVENTS.GAME_EVENTS, expect.anything());
  });

  it('scoring event has isScoringPlay: true', () => {
    handleScore(store, io, {});

    const event = firstGameEventsPayload(io).events[0] as PlateAppearanceCompletedEvent;
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

    const event = firstGameEventsPayload(io).events[0] as PlateAppearanceCompletedEvent;
    expect(event.rbi).toBe(2);
  });

  it('uses the provided --type override', () => {
    handleScore(store, io, { type: 'home_run' });

    const event = firstGameEventsPayload(io).events[0] as PlateAppearanceCompletedEvent;
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
    expect(update.trackingMode).toBe('outs');
  });

  it('emits game-update with trackingMode runs in extra innings', () => {
    store.setState({ inning: { number: 10, half: 'Top', ordinal: '10th' } });
    handleScore(store, io, {});

    const update = firstGameUpdate(io);
    expect(update.trackingMode).toBe('runs');
  });

  it('reduces totalOutsRemaining when away is defending and losing (excludes final bottom inning)', () => {
    // Bottom 5th, away (NYM) defending, home leading 2-1 → awayDefendingAndLosing guard applies.
    // outs = 2 → outsRemaining = 1; futureHalfInnings = (9 - 5 - 1) = 3 → totalOutsRemaining = 1 + 9 = 10.
    store.setState({
      inning: { number: 5, half: 'Bottom', ordinal: '5th' },
      outs: 2,
      score: { away: 1, home: 2 },
    });
    handleScore(store, io, {});

    const update = firstGameUpdate(io);
    expect(update.outsRemaining).toBe(1);
    expect(update.totalOutsRemaining).toBe(10);
  });
});

// ── offensive-sub ─────────────────────────────────────────────────────────────

describe('handleOffensiveSub', () => {
  it('emits game-events with an offensive-substitution event', () => {
    handleOffensiveSub(store, io, {});

    const event = firstGameEventsPayload(io).events[0] as OffensiveSubstitutionEvent;
    expect(event.category).toBe('offensive-substitution');
    expect(event.eventType).toBe('offensive_substitution');
  });

  it('uses the provided player name in the event', () => {
    handleOffensiveSub(store, io, { playerName: 'Pete Alonso' });

    const event = firstGameEventsPayload(io).events[0] as OffensiveSubstitutionEvent;
    expect(event.player.fullName).toBe('Pete Alonso');
  });

  it('substitution event has all required GameEventBase fields', () => {
    handleOffensiveSub(store, io, {});

    const event = firstGameEventsPayload(io).events[0] as OffensiveSubstitutionEvent;
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

    const event = firstGameEventsPayload(io).events[0] as DefensiveSubstitutionEvent;
    expect(event.category).toBe('defensive-substitution');
    expect(event.eventType).toBe('defensive_substitution');
  });

  it('uses the provided player name', () => {
    handleDefensiveSub(store, io, { playerName: 'Brandon Nimmo' });

    const event = firstGameEventsPayload(io).events[0] as DefensiveSubstitutionEvent;
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

    expect(io.emit).toHaveBeenCalledWith(SOCKET_EVENTS.GAME_SUMMARY, expect.anything());
  });

  it('emitted payload satisfies the GameSummary interface shape', () => {
    handleSimGameSummary(store, io);

    const summary = (io.emit as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === SOCKET_EVENTS.GAME_SUMMARY,
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
      (c: unknown[]) => c[0] === SOCKET_EVENTS.GAME_SUMMARY,
    )![1] as GameSummary;

    expect(summary.finalScore).toEqual({ away: 3, home: 5 });
  });

  it('returns a success result', () => {
    const result = handleSimGameSummary(store, io);
    expect(result.success).toBe(true);
  });
});

// ── pitching-change co-emission ───────────────────────────────────────────────

describe('handlePitchingChange (Phase 5A co-emission)', () => {
  it('emits both game-update and game-events', () => {
    handlePitchingChange(store, io, { pitcherName: 'Edwin Díaz' });

    expect(io.emit).toHaveBeenCalledWith(SOCKET_EVENTS.GAME_UPDATE, expect.anything());
    expect(io.emit).toHaveBeenCalledWith(SOCKET_EVENTS.GAME_EVENTS, expect.anything());
  });

  it('game-events contains a pitching-substitution event', () => {
    handlePitchingChange(store, io, { pitcherName: 'Edwin Díaz' });

    const event = firstGameEventsPayload(io).events[0] as PitchingSubstitutionEvent;
    expect(event.category).toBe('pitching-substitution');
    expect(event.eventType).toBe('pitching_substitution');
  });

  it('pitching-substitution player reflects the new pitcher', () => {
    handlePitchingChange(store, io, { pitcherId: 554430, pitcherName: 'Edwin Díaz' });

    const event = firstGameEventsPayload(io).events[0] as PitchingSubstitutionEvent;
    expect(event.player.id).toBe(554430);
    expect(event.player.fullName).toBe('Edwin Díaz');
  });
});
