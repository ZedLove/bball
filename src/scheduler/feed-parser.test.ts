import { describe, it, expect } from 'vitest';
import { parseFeedEvents } from './feed-parser.ts';
import type { GameFeedResponse } from './game-feed-types.ts';
import type {
  PlateAppearanceCompletedEvent,
  PitchingSubstitutionEvent,
  PitchEvent,
} from '../server/socket-events.ts';

// Fixture: NYM (away, 121) @ LAD (home, 119) — game 823963, April 15 2026.
// Contains:
//   atBatIndex 0  — strikeout (top of 1st), with excluded game_advisory + batter_timeout action events
//   atBatIndex 13 — home_run scoring play (bottom of 2nd)
//   atBatIndex 43 — pitching_substitution action event + home_run scoring play (bottom of 6th)
import fixture from './__fixtures__/game-feed.json' with { type: 'json' };

const GAME_PK = 823963;
const response = fixture as unknown as GameFeedResponse;

describe('parseFeedEvents', () => {
  describe('basic plate appearance parsing', () => {
    it('parses a strikeout as a plate-appearance-completed event', () => {
      const events = parseFeedEvents(response, GAME_PK, -1);
      const strikeout = events.find(
        (e) => e.atBatIndex === 0 && e.category === 'plate-appearance-completed',
      ) as PlateAppearanceCompletedEvent | undefined;

      expect(strikeout).toBeDefined();
      expect(strikeout!.eventType).toBe('strikeout');
      expect(strikeout!.description).toBe('Francisco Lindor strikes out swinging.');
      expect(strikeout!.isScoringPlay).toBe(false);
      expect(strikeout!.rbi).toBe(0);
      expect(strikeout!.batter).toEqual({ id: 596019, fullName: 'Francisco Lindor' });
      expect(strikeout!.pitcher).toEqual({ id: 660271, fullName: 'Shohei Ohtani' });
    });

    it('sets battingTeam to the away team for top-half plays', () => {
      const events = parseFeedEvents(response, GAME_PK, -1);
      const strikeout = events.find(
        (e) => e.atBatIndex === 0 && e.category === 'plate-appearance-completed',
      )!;

      // atBatIndex 0 is top of 1st: away (NYM) bats, home (LAD) defends
      expect(strikeout.battingTeam).toBe('NYM');
      expect(strikeout.defendingTeam).toBe('LAD');
      expect(strikeout.halfInning).toBe('top');
      expect(strikeout.inning).toBe(1);
    });

    it('sets battingTeam to the home team for bottom-half plays', () => {
      const events = parseFeedEvents(response, GAME_PK, -1);
      const homeRun = events.find(
        (e) => e.atBatIndex === 13 && e.category === 'plate-appearance-completed',
      )!;

      // atBatIndex 13 is bottom of 2nd: home (LAD) bats, away (NYM) defends
      expect(homeRun.battingTeam).toBe('LAD');
      expect(homeRun.defendingTeam).toBe('NYM');
      expect(homeRun.halfInning).toBe('bottom');
      expect(homeRun.inning).toBe(2);
    });

    it('propagates gamePk onto every event', () => {
      const events = parseFeedEvents(response, GAME_PK, -1);
      expect(events.every((e) => e.gamePk === GAME_PK)).toBe(true);
    });
  });

  describe('scoring plays', () => {
    it('marks a home run as isScoringPlay: true', () => {
      const events = parseFeedEvents(response, GAME_PK, -1);
      const homeRun = events.find(
        (e) => e.atBatIndex === 13 && e.category === 'plate-appearance-completed',
      ) as PlateAppearanceCompletedEvent;

      expect(homeRun.isScoringPlay).toBe(true);
      expect(homeRun.eventType).toBe('home_run');
      expect(homeRun.rbi).toBe(2);
      expect(homeRun.batter).toEqual({ id: 808975, fullName: 'Hyeseong Kim' });
      expect(homeRun.pitcher).toEqual({ id: 605280, fullName: 'Clay Holmes' });
    });

    it('marks a non-scoring at-bat as isScoringPlay: false', () => {
      const events = parseFeedEvents(response, GAME_PK, -1);
      const strikeout = events.find(
        (e) => e.atBatIndex === 0 && e.category === 'plate-appearance-completed',
      ) as PlateAppearanceCompletedEvent;

      expect(strikeout.isScoringPlay).toBe(false);
    });
  });

  describe('substitution events', () => {
    it('emits a PitchingSubstitutionEvent before the plate appearance for the same at-bat', () => {
      const events = parseFeedEvents(response, GAME_PK, -1);
      const atBat43 = events.filter((e) => e.atBatIndex === 43);

      expect(atBat43).toHaveLength(2);
      expect(atBat43[0].category).toBe('pitching-substitution');
      expect(atBat43[1].category).toBe('plate-appearance-completed');
    });

    it('populates the substitution event with the incoming player from gameData.players', () => {
      const events = parseFeedEvents(response, GAME_PK, -1);
      const sub = events.find(
        (e) => e.atBatIndex === 43 && e.category === 'pitching-substitution',
      ) as PitchingSubstitutionEvent;

      expect(sub.eventType).toBe('pitching_substitution');
      expect(sub.description).toBe('Pitching Change: Tobias Myers replaces Clay Holmes.');
      expect(sub.player).toEqual({ id: 668964, fullName: 'Tobias Myers' });
    });

    it('sets correct inning context on a substitution event', () => {
      const events = parseFeedEvents(response, GAME_PK, -1);
      const sub = events.find(
        (e) => e.atBatIndex === 43 && e.category === 'pitching-substitution',
      )!;

      expect(sub.inning).toBe(6);
      expect(sub.halfInning).toBe('bottom');
      expect(sub.battingTeam).toBe('LAD');
      expect(sub.defendingTeam).toBe('NYM');
    });
  });

  describe('excluded action events', () => {
    it('suppresses game_advisory and batter_timeout action events', () => {
      const events = parseFeedEvents(response, GAME_PK, -1);
      // atBatIndex 0 has two excluded action events; only the PA should appear
      const atBat0 = events.filter((e) => e.atBatIndex === 0);

      expect(atBat0).toHaveLength(1);
      expect(atBat0[0].category).toBe('plate-appearance-completed');
    });
  });

  describe('deduplication via lastProcessedAtBatIndex', () => {
    it('processes all plays when lastProcessedAtBatIndex is -1', () => {
      const events = parseFeedEvents(response, GAME_PK, -1);

      // 1 PA at index 0, 1 PA at index 13, 1 sub + 1 PA at index 43
      expect(events).toHaveLength(4);
    });

    it('skips plays up to and including lastProcessedAtBatIndex', () => {
      const events = parseFeedEvents(response, GAME_PK, 0);

      // atBatIndex 0 skipped; atBatIndex 13 and 43 remain → 3 events
      expect(events).toHaveLength(3);
      expect(events.every((e) => e.atBatIndex > 0)).toBe(true);
    });

    it('skips all plays when lastProcessedAtBatIndex equals the last atBatIndex', () => {
      const events = parseFeedEvents(response, GAME_PK, 43);

      expect(events).toHaveLength(0);
    });

    it('maintains play order by atBatIndex', () => {
      const events = parseFeedEvents(response, GAME_PK, -1);
      const indices = events.map((e) => e.atBatIndex);

      expect(indices).toEqual([...indices].sort((a, b) => a - b));
    });
  });

  describe('incomplete play filtering', () => {
    it('skips plays where isComplete is false', () => {
      const withIncomplete: GameFeedResponse = {
        ...response,
        liveData: {
          ...response.liveData,
          plays: {
            allPlays: response.liveData.plays.allPlays.map((p) =>
              p.atBatIndex === 0 ? { ...p, about: { ...p.about, isComplete: false } } : p,
            ),
          },
        },
      };

      const events = parseFeedEvents(withIncomplete, GAME_PK, -1);

      // atBatIndex 0 is now incomplete — 3 events remain (index 13 PA + index 43 sub + PA)
      expect(events).toHaveLength(3);
      expect(events.every((e) => e.atBatIndex !== 0)).toBe(true);
    });
  });

  describe('unknown event type filtering', () => {
    it('suppresses a plate appearance with an unknown eventType', () => {
      const withUnknown: GameFeedResponse = {
        ...response,
        liveData: {
          ...response.liveData,
          plays: {
            allPlays: response.liveData.plays.allPlays.map((p) =>
              p.atBatIndex === 0
                ? { ...p, result: { ...p.result, eventType: 'unknown_play_type' } }
                : p,
            ),
          },
        },
      };

      const events = parseFeedEvents(withUnknown, GAME_PK, -1);

      // Unknown PA at index 0 is suppressed; 3 events remain
      expect(events).toHaveLength(3);
      expect(events.every((e) => e.atBatIndex !== 0)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Pitch sequence
  // ---------------------------------------------------------------------------

  describe('pitch sequence', () => {
    it('maps all pitch fields correctly from fixture data', () => {
      const events = parseFeedEvents(response, GAME_PK, -1);
      const strikeout = events.find(
        (e) => e.atBatIndex === 0 && e.category === 'plate-appearance-completed',
      ) as PlateAppearanceCompletedEvent;

      expect(strikeout.pitchSequence).toHaveLength(4);

      const [p1, p2, p3, p4] = strikeout.pitchSequence as PitchEvent[];

      expect(p1).toEqual<PitchEvent>({
        pitchNumber: 1,
        pitchType: 'Four-Seam Fastball',
        call: 'Called Strike',
        isBall: false,
        isStrike: true,
        isInPlay: false,
        speedMph: 96.0,
        countAfter: { balls: 0, strikes: 1 },
      });

      expect(p2).toEqual<PitchEvent>({
        pitchNumber: 2,
        pitchType: 'Curveball',
        call: 'Ball',
        isBall: true,
        isStrike: false,
        isInPlay: false,
        speedMph: 78.5,
        countAfter: { balls: 1, strikes: 1 },
      });

      expect(p3).toEqual<PitchEvent>({
        pitchNumber: 3,
        pitchType: 'Cutter',
        call: 'Foul',
        isBall: false,
        isStrike: true,
        isInPlay: false,
        speedMph: 91.3,
        countAfter: { balls: 1, strikes: 2 },
      });

      expect(p4).toEqual<PitchEvent>({
        pitchNumber: 4,
        pitchType: 'Four-Seam Fastball',
        call: 'Swinging Strike',
        isBall: false,
        isStrike: true,
        isInPlay: false,
        speedMph: 97.1,
        countAfter: { balls: 1, strikes: 3 },
      });
    });

    it('preserves pitch order by pitchNumber', () => {
      const events = parseFeedEvents(response, GAME_PK, -1);
      const strikeout = events.find(
        (e) => e.atBatIndex === 0 && e.category === 'plate-appearance-completed',
      ) as PlateAppearanceCompletedEvent;

      const numbers = strikeout.pitchSequence.map((p) => p.pitchNumber);
      expect(numbers).toEqual([1, 2, 3, 4]);
    });

    it('marks the final pitch as isInPlay: true for a home run', () => {
      const events = parseFeedEvents(response, GAME_PK, -1);
      const homeRun = events.find(
        (e) => e.atBatIndex === 13 && e.category === 'plate-appearance-completed',
      ) as PlateAppearanceCompletedEvent;

      expect(homeRun.pitchSequence).toHaveLength(3);
      const lastPitch = homeRun.pitchSequence[2];
      expect(lastPitch.isInPlay).toBe(true);
      expect(lastPitch.call).toBe('In play, run(s)');
      expect(lastPitch.speedMph).toBe(94.8);
    });

    it('excludes pickoff events from pitchSequence', () => {
      // atBatIndex 13 has a pickoff event before the pitches — only 3 pitches should appear
      const events = parseFeedEvents(response, GAME_PK, -1);
      const homeRun = events.find(
        (e) => e.atBatIndex === 13 && e.category === 'plate-appearance-completed',
      ) as PlateAppearanceCompletedEvent;

      // Confirm no pickoff bled into the sequence
      expect(homeRun.pitchSequence).toHaveLength(3);
      expect(homeRun.pitchSequence.every((p) => p.pitchNumber > 0)).toBe(true);
    });

    it('excludes action events from pitchSequence', () => {
      // atBatIndex 0 has game_advisory and batter_timeout action events — none in pitchSequence
      const events = parseFeedEvents(response, GAME_PK, -1);
      const strikeout = events.find(
        (e) => e.atBatIndex === 0 && e.category === 'plate-appearance-completed',
      ) as PlateAppearanceCompletedEvent;

      // Only the 4 pitch events appear — the 2 action events are excluded
      expect(strikeout.pitchSequence).toHaveLength(4);
    });

    it('includes all pitches from the full at-bat when a pitching change occurred mid-at-bat', () => {
      // atBatIndex 43 has a pitching_substitution action then 2 pitches
      const events = parseFeedEvents(response, GAME_PK, -1);
      const homeRun = events.find(
        (e) => e.atBatIndex === 43 && e.category === 'plate-appearance-completed',
      ) as PlateAppearanceCompletedEvent;

      expect(homeRun.pitchSequence).toHaveLength(2);
      expect(homeRun.pitchSequence[0].pitchNumber).toBe(1);
    });

    it('returns an empty pitchSequence for intent_walk (no_pitch events only)', () => {
      const intentWalkResponse: GameFeedResponse = {
        metaData: { timeStamp: '20260415_010000' },
        gameData: {
          teams: {
            away: { id: 121, abbreviation: 'NYM' },
            home: { id: 119, abbreviation: 'LAD' },
          },
          players: {
            ID596019: { id: 596019, fullName: 'Francisco Lindor' },
            ID660271: { id: 660271, fullName: 'Shohei Ohtani' },
          },
        },
        liveData: {
          plays: {
            allPlays: [
              {
                atBatIndex: 5,
                result: { eventType: 'intent_walk', description: 'Francisco Lindor intentionally walks.', rbi: 0 },
                about: { atBatIndex: 5, halfInning: 'top', inning: 3, isComplete: true, isScoringPlay: false },
                matchup: {
                  batter: { id: 596019, fullName: 'Francisco Lindor' },
                  pitcher: { id: 660271, fullName: 'Shohei Ohtani' },
                },
                playEvents: [
                  { type: 'no_pitch', isPitch: false, pitchNumber: 1, details: { description: 'Automatic Ball' }, count: { balls: 1, strikes: 0 } },
                  { type: 'no_pitch', isPitch: false, pitchNumber: 2, details: { description: 'Automatic Ball' }, count: { balls: 2, strikes: 0 } },
                  { type: 'no_pitch', isPitch: false, pitchNumber: 3, details: { description: 'Automatic Ball' }, count: { balls: 3, strikes: 0 } },
                  { type: 'no_pitch', isPitch: false, pitchNumber: 4, details: { description: 'Automatic Ball' }, count: { balls: 4, strikes: 0 } },
                ],
              },
            ],
          },
        },
      };

      const events = parseFeedEvents(intentWalkResponse, GAME_PK, -1);
      const pa = events.find(
        (e) => e.atBatIndex === 5 && e.category === 'plate-appearance-completed',
      ) as PlateAppearanceCompletedEvent;

      expect(pa).toBeDefined();
      expect(pa.eventType).toBe('intent_walk');
      expect(pa.pitchSequence).toEqual([]);
    });

    it('uses null for speedMph when pitchData is absent', () => {
      const noPitchDataResponse: GameFeedResponse = {
        ...response,
        liveData: {
          ...response.liveData,
          plays: {
            allPlays: response.liveData.plays.allPlays.map((p) => {
              if (p.atBatIndex !== 0) return p;
              return {
                ...p,
                playEvents: p.playEvents.map((pe) =>
                  pe.type === 'pitch' ? { ...pe, pitchData: undefined } : pe,
                ),
              };
            }),
          },
        },
      };

      const events = parseFeedEvents(noPitchDataResponse, GAME_PK, -1);
      const strikeout = events.find(
        (e) => e.atBatIndex === 0 && e.category === 'plate-appearance-completed',
      ) as PlateAppearanceCompletedEvent;

      expect(strikeout.pitchSequence.every((p) => p.speedMph === null)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Substitution error and dispatch paths
  // ---------------------------------------------------------------------------

  describe('substitution event error handling', () => {
    /** Build a minimal inline response with one at-bat containing the given action events. */
    function makeResponseWithActions(
      actionEvents: Array<{ eventType: string; player?: { id: number } }>,
    ): GameFeedResponse {
      return {
        metaData: { timeStamp: '20260415_010000' },
        gameData: {
          teams: {
            away: { id: 121, abbreviation: 'NYM' },
            home: { id: 119, abbreviation: 'LAD' },
          },
          players: {
            ID596019: { id: 596019, fullName: 'Francisco Lindor' },
            ID660271: { id: 660271, fullName: 'Shohei Ohtani' },
            ID111111: { id: 111111, fullName: 'Test Player' },
          },
        },
        liveData: {
          plays: {
            allPlays: [
              {
                atBatIndex: 0,
                result: { eventType: 'strikeout', description: 'Batter strikes out.', rbi: 0 },
                about: { atBatIndex: 0, halfInning: 'top', inning: 1, isComplete: true, isScoringPlay: false },
                matchup: {
                  batter: { id: 596019, fullName: 'Francisco Lindor' },
                  pitcher: { id: 660271, fullName: 'Shohei Ohtani' },
                },
                playEvents: [
                  ...actionEvents.map((a) => ({
                    type: 'action' as const,
                    details: { description: 'Action.', eventType: a.eventType },
                    ...(a.player ? { player: a.player } : {}),
                  })),
                ],
              },
            ],
          },
        },
      };
    }

    it('skips an action event that has no player field', () => {
      const r = makeResponseWithActions([{ eventType: 'pitching_substitution' }]);
      const events = parseFeedEvents(r, GAME_PK, -1);

      // Only the plate-appearance should be emitted; the sub is skipped
      expect(events).toHaveLength(1);
      expect(events[0].category).toBe('plate-appearance-completed');
    });

    it('skips an action event whose player id is not in gameData.players', () => {
      const r = makeResponseWithActions([
        { eventType: 'pitching_substitution', player: { id: 999999 } },
      ]);
      const events = parseFeedEvents(r, GAME_PK, -1);

      expect(events).toHaveLength(1);
      expect(events[0].category).toBe('plate-appearance-completed');
    });

    it('emits an OffensiveSubstitutionEvent for offensive_substitution', () => {
      const r = makeResponseWithActions([
        { eventType: 'offensive_substitution', player: { id: 111111 } },
      ]);
      const events = parseFeedEvents(r, GAME_PK, -1);

      expect(events).toHaveLength(2);
      const sub = events[0] as OffensiveSubstitutionEvent;
      expect(sub.category).toBe('offensive-substitution');
      expect(sub.eventType).toBe('offensive_substitution');
      expect(sub.player).toEqual({ id: 111111, fullName: 'Test Player' });
    });

    it('emits OffensiveSubstitutionEvent before the plate-appearance for a mid-at-bat batter replacement', () => {
      // A mid-at-bat batter replacement (e.g. injury) surfaces as an
      // offensive_substitution action event within the at-bat's playEvents,
      // followed by the completed plate-appearance result.
      const r = makeResponseWithActions([
        { eventType: 'offensive_substitution', player: { id: 111111 } },
      ]);
      const events = parseFeedEvents(r, GAME_PK, -1);

      expect(events).toHaveLength(2);
      // Sub must be emitted before the plate-appearance for the same at-bat.
      expect(events[0].category).toBe('offensive-substitution');
      expect(events[1].category).toBe('plate-appearance-completed');
      expect(events[0].atBatIndex).toBe(events[1].atBatIndex);
    });

    it('emits a DefensiveSubstitutionEvent for defensive_substitution', () => {
      const r = makeResponseWithActions([
        { eventType: 'defensive_substitution', player: { id: 111111 } },
      ]);
      const events = parseFeedEvents(r, GAME_PK, -1);

      expect(events).toHaveLength(2);
      const sub = events[0] as DefensiveSubstitutionEvent;
      expect(sub.category).toBe('defensive-substitution');
      expect(sub.eventType).toBe('defensive_substitution');
      expect(sub.player).toEqual({ id: 111111, fullName: 'Test Player' });
    });

    it('emits a DefensiveSubstitutionEvent for defensive_switch (normalised to same category)', () => {
      const r = makeResponseWithActions([
        { eventType: 'defensive_switch', player: { id: 111111 } },
      ]);
      const events = parseFeedEvents(r, GAME_PK, -1);

      expect(events).toHaveLength(2);
      const sub = events[0] as DefensiveSubstitutionEvent;
      expect(sub.category).toBe('defensive-substitution');
      expect(sub.eventType).toBe('defensive_switch');
    });
  });
});
