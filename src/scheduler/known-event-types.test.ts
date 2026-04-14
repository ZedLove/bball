import { describe, it, expect } from 'vitest';
import { EVENT_TYPE_CATEGORY_MAP } from './known-event-types.ts';

describe('EVENT_TYPE_CATEGORY_MAP', () => {
  describe('plate-appearance-completed categories', () => {
    it.each([
      'single', 'double', 'triple', 'home_run',
      'field_out', 'flyout', 'lineout', 'pop_out',
      'strikeout', 'strikeout_double_play',
      'force_out', 'grounded_into_double_play', 'double_play', 'triple_play',
      'fielders_choice', 'fielders_choice_out',
      'walk', 'intent_walk', 'hit_by_pitch',
      'sac_fly', 'sac_fly_double_play', 'sac_bunt', 'sac_bunt_double_play',
      'field_error', 'catcher_interf', 'fan_interference',
      'stolen_base_2b', 'stolen_base_3b', 'stolen_base_home',
      'caught_stealing_2b', 'caught_stealing_3b', 'caught_stealing_home',
      'pickoff_1b', 'pickoff_2b', 'pickoff_3b',
      'pickoff_caught_stealing_2b', 'pickoff_caught_stealing_3b', 'pickoff_caught_stealing_home',
      'wild_pitch', 'passed_ball', 'balk',
    ])('maps "%s" to "plate-appearance-completed"', (eventType) => {
      expect(EVENT_TYPE_CATEGORY_MAP.get(eventType)).toBe('plate-appearance-completed');
    });
  });

  describe('substitution categories', () => {
    it('maps "pitching_substitution" to "pitching-substitution"', () => {
      expect(EVENT_TYPE_CATEGORY_MAP.get('pitching_substitution')).toBe('pitching-substitution');
    });

    it('maps "offensive_substitution" to "offensive-substitution"', () => {
      expect(EVENT_TYPE_CATEGORY_MAP.get('offensive_substitution')).toBe('offensive-substitution');
    });

    it('maps "defensive_substitution" to "defensive-substitution"', () => {
      expect(EVENT_TYPE_CATEGORY_MAP.get('defensive_substitution')).toBe('defensive-substitution');
    });

    it('maps "defensive_switch" to "defensive-substitution"', () => {
      expect(EVENT_TYPE_CATEGORY_MAP.get('defensive_switch')).toBe('defensive-substitution');
    });
  });

  describe('suppressed action types', () => {
    it.each(['game_advisory', 'batter_timeout', 'mound_visit', 'defensive_indiff'])(
      'returns undefined for suppressed type "%s"',
      (eventType) => {
        expect(EVENT_TYPE_CATEGORY_MAP.get(eventType)).toBeUndefined();
      },
    );
  });

  describe('unknown event types', () => {
    it('returns undefined for completely unknown event types', () => {
      expect(EVENT_TYPE_CATEGORY_MAP.get('totally_unknown_event')).toBeUndefined();
    });

    it('returns undefined for an empty string', () => {
      expect(EVENT_TYPE_CATEGORY_MAP.get('')).toBeUndefined();
    });
  });
});
