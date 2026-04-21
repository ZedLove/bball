import { describe, it, expect } from 'vitest';
import { formatEventLine, formatInningTag } from './event-formatter.ts';
import type {
  GameEvent,
  PlateAppearanceCompletedEvent,
  PitchingSubstitutionEvent,
  OffensiveSubstitutionEvent,
  DefensiveSubstitutionEvent,
} from '../../server/socket-events.ts';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

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
): PlateAppearanceCompletedEvent {
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
): PitchingSubstitutionEvent {
  return {
    ...BASE_EVENT,
    category: 'pitching-substitution',
    eventType: 'pitching_substitution',
    player: { id: 543037, fullName: 'Gerrit Cole' },
    ...overrides,
  };
}

function makeOffensiveSub(
  overrides: Partial<OffensiveSubstitutionEvent> = {}
): OffensiveSubstitutionEvent {
  return {
    ...BASE_EVENT,
    category: 'offensive-substitution',
    eventType: 'offensive_substitution',
    player: { id: 677800, fullName: 'Joey Gallo' },
    ...overrides,
  };
}

function makeDefensiveSub(
  overrides: Partial<DefensiveSubstitutionEvent> = {}
): DefensiveSubstitutionEvent {
  return {
    ...BASE_EVENT,
    category: 'defensive-substitution',
    eventType: 'defensive_substitution',
    player: { id: 600303, fullName: 'DJ LeMahieu' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// formatEventLine — plate-appearance events
// ---------------------------------------------------------------------------

describe('formatEventLine — plate-appearance-completed', () => {
  it('strikeout: ⚾ icon + label with batter name', () => {
    const event = makePlateAppearance({ eventType: 'strikeout' });
    const { icon, label } = formatEventLine(event);
    expect(icon).toBe('⚾');
    expect(label).toBe('Strikeout – Rafael Devers');
  });

  it('home_run: 💥 icon + label with batter name', () => {
    const event = makePlateAppearance({
      eventType: 'home_run',
      isScoringPlay: true,
    });
    const { icon, label } = formatEventLine(event);
    expect(icon).toBe('💥');
    expect(label).toBe('Home Run – Rafael Devers');
  });

  it('single: ⚾ icon + label', () => {
    const { icon, label } = formatEventLine(
      makePlateAppearance({ eventType: 'single' })
    );
    expect(icon).toBe('⚾');
    expect(label).toBe('Single – Rafael Devers');
  });

  it('double: correct label', () => {
    expect(
      formatEventLine(makePlateAppearance({ eventType: 'double' })).label
    ).toBe('Double – Rafael Devers');
  });

  it('triple: correct label', () => {
    expect(
      formatEventLine(makePlateAppearance({ eventType: 'triple' })).label
    ).toBe('Triple – Rafael Devers');
  });

  it('field_out: correct label', () => {
    expect(
      formatEventLine(makePlateAppearance({ eventType: 'field_out' })).label
    ).toBe('Field Out – Rafael Devers');
  });

  it('flyout: correct label', () => {
    expect(
      formatEventLine(makePlateAppearance({ eventType: 'flyout' })).label
    ).toBe('Flyout – Rafael Devers');
  });

  it('lineout: correct label', () => {
    expect(
      formatEventLine(makePlateAppearance({ eventType: 'lineout' })).label
    ).toBe('Lineout – Rafael Devers');
  });

  it('pop_out: correct label', () => {
    expect(
      formatEventLine(makePlateAppearance({ eventType: 'pop_out' })).label
    ).toBe('Pop Out – Rafael Devers');
  });

  it('strikeout_double_play: correct label', () => {
    expect(
      formatEventLine(
        makePlateAppearance({ eventType: 'strikeout_double_play' })
      ).label
    ).toBe('Strikeout DP – Rafael Devers');
  });

  it('force_out: correct label', () => {
    expect(
      formatEventLine(makePlateAppearance({ eventType: 'force_out' })).label
    ).toBe('Force Out – Rafael Devers');
  });

  it('grounded_into_double_play: correct label', () => {
    expect(
      formatEventLine(
        makePlateAppearance({ eventType: 'grounded_into_double_play' })
      ).label
    ).toBe('GIDP – Rafael Devers');
  });

  it('double_play: correct label', () => {
    expect(
      formatEventLine(makePlateAppearance({ eventType: 'double_play' })).label
    ).toBe('Double Play – Rafael Devers');
  });

  it('triple_play: correct label', () => {
    expect(
      formatEventLine(makePlateAppearance({ eventType: 'triple_play' })).label
    ).toBe('Triple Play – Rafael Devers');
  });

  it("fielders_choice: Fielder's Choice label", () => {
    expect(
      formatEventLine(makePlateAppearance({ eventType: 'fielders_choice' }))
        .label
    ).toBe("Fielder's Choice – Rafael Devers");
  });

  it('fielders_choice_out: correct label', () => {
    expect(
      formatEventLine(makePlateAppearance({ eventType: 'fielders_choice_out' }))
        .label
    ).toBe('FC Out – Rafael Devers');
  });

  it('walk: correct label', () => {
    expect(
      formatEventLine(makePlateAppearance({ eventType: 'walk' })).label
    ).toBe('Walk – Rafael Devers');
  });

  it('intent_walk: returns "Intent Walk (IBB)" with no batter suffix', () => {
    const event = makePlateAppearance({ eventType: 'intent_walk' });
    const { icon, label } = formatEventLine(event);
    expect(icon).toBe('⚾');
    expect(label).toBe('Intent Walk (IBB)');
    expect(label).not.toContain('Rafael Devers');
  });

  it('hit_by_pitch: correct label', () => {
    expect(
      formatEventLine(makePlateAppearance({ eventType: 'hit_by_pitch' })).label
    ).toBe('HBP – Rafael Devers');
  });

  it('sac_fly: correct label', () => {
    expect(
      formatEventLine(makePlateAppearance({ eventType: 'sac_fly' })).label
    ).toBe('Sac Fly – Rafael Devers');
  });

  it('sac_fly_double_play: correct label', () => {
    expect(
      formatEventLine(makePlateAppearance({ eventType: 'sac_fly_double_play' }))
        .label
    ).toBe('Sac Fly DP – Rafael Devers');
  });

  it('sac_bunt: correct label', () => {
    expect(
      formatEventLine(makePlateAppearance({ eventType: 'sac_bunt' })).label
    ).toBe('Sac Bunt – Rafael Devers');
  });

  it('sac_bunt_double_play: correct label', () => {
    expect(
      formatEventLine(
        makePlateAppearance({ eventType: 'sac_bunt_double_play' })
      ).label
    ).toBe('Sac Bunt DP – Rafael Devers');
  });

  it('field_error: ❌ icon', () => {
    const { icon, label } = formatEventLine(
      makePlateAppearance({ eventType: 'field_error' })
    );
    expect(icon).toBe('❌');
    expect(label).toBe('Error – Rafael Devers');
  });

  it('catcher_interf: ❌ icon and correct label', () => {
    const { icon, label } = formatEventLine(
      makePlateAppearance({ eventType: 'catcher_interf' })
    );
    expect(icon).toBe('❌');
    expect(label).toBe('Catcher Interference – Rafael Devers');
  });

  it('fan_interference: ❌ icon and correct label', () => {
    const { icon, label } = formatEventLine(
      makePlateAppearance({ eventType: 'fan_interference' })
    );
    expect(icon).toBe('❌');
    expect(label).toBe('Fan Interference – Rafael Devers');
  });

  it('stolen_base_2b: 🏃 icon and correct label', () => {
    const { icon, label } = formatEventLine(
      makePlateAppearance({ eventType: 'stolen_base_2b' })
    );
    expect(icon).toBe('🏃');
    expect(label).toBe('SB 2B – Rafael Devers');
  });

  it('stolen_base_3b: correct label', () => {
    expect(
      formatEventLine(makePlateAppearance({ eventType: 'stolen_base_3b' }))
        .label
    ).toBe('SB 3B – Rafael Devers');
  });

  it('stolen_base_home: correct label', () => {
    expect(
      formatEventLine(makePlateAppearance({ eventType: 'stolen_base_home' }))
        .label
    ).toBe('SB Home – Rafael Devers');
  });

  it('caught_stealing_2b: correct label', () => {
    expect(
      formatEventLine(makePlateAppearance({ eventType: 'caught_stealing_2b' }))
        .label
    ).toBe('CS 2B – Rafael Devers');
  });

  it('caught_stealing_3b: correct label', () => {
    expect(
      formatEventLine(makePlateAppearance({ eventType: 'caught_stealing_3b' }))
        .label
    ).toBe('CS 3B – Rafael Devers');
  });

  it('caught_stealing_home: correct label', () => {
    expect(
      formatEventLine(
        makePlateAppearance({ eventType: 'caught_stealing_home' })
      ).label
    ).toBe('CS Home – Rafael Devers');
  });

  it('pickoff_1b: 🏃 icon and correct label', () => {
    const { icon, label } = formatEventLine(
      makePlateAppearance({ eventType: 'pickoff_1b' })
    );
    expect(icon).toBe('🏃');
    expect(label).toBe('Pickoff 1B – Rafael Devers');
  });

  it('pickoff_2b: correct label', () => {
    expect(
      formatEventLine(makePlateAppearance({ eventType: 'pickoff_2b' })).label
    ).toBe('Pickoff 2B – Rafael Devers');
  });

  it('pickoff_3b: correct label', () => {
    expect(
      formatEventLine(makePlateAppearance({ eventType: 'pickoff_3b' })).label
    ).toBe('Pickoff 3B – Rafael Devers');
  });

  it('pickoff_caught_stealing_2b: correct label', () => {
    expect(
      formatEventLine(
        makePlateAppearance({ eventType: 'pickoff_caught_stealing_2b' })
      ).label
    ).toBe('PCS 2B – Rafael Devers');
  });

  it('pickoff_caught_stealing_3b: correct label', () => {
    expect(
      formatEventLine(
        makePlateAppearance({ eventType: 'pickoff_caught_stealing_3b' })
      ).label
    ).toBe('PCS 3B – Rafael Devers');
  });

  it('pickoff_caught_stealing_home: correct label', () => {
    expect(
      formatEventLine(
        makePlateAppearance({ eventType: 'pickoff_caught_stealing_home' })
      ).label
    ).toBe('PCS Home – Rafael Devers');
  });

  it('wild_pitch: correct label', () => {
    expect(
      formatEventLine(makePlateAppearance({ eventType: 'wild_pitch' })).label
    ).toBe('Wild Pitch – Rafael Devers');
  });

  it('passed_ball: correct label', () => {
    expect(
      formatEventLine(makePlateAppearance({ eventType: 'passed_ball' })).label
    ).toBe('Passed Ball – Rafael Devers');
  });

  it('balk: correct label', () => {
    expect(
      formatEventLine(makePlateAppearance({ eventType: 'balk' })).label
    ).toBe('Balk – Rafael Devers');
  });

  it('unknown eventType: falls back to raw eventType string', () => {
    const event = makePlateAppearance({ eventType: 'some_new_event' });
    const { label } = formatEventLine(event);
    expect(label).toBe('some_new_event – Rafael Devers');
  });
});

// ---------------------------------------------------------------------------
// formatEventLine — substitution events
// ---------------------------------------------------------------------------

describe('formatEventLine — substitution events', () => {
  it('pitching-substitution: 🔄 icon + "Pitching Sub – {name}"', () => {
    const event: GameEvent = makePitchingSub({
      player: { id: 543037, fullName: 'Gerrit Cole' },
    });
    const { icon, label } = formatEventLine(event);
    expect(icon).toBe('🔄');
    expect(label).toBe('Pitching Sub – Gerrit Cole');
  });

  it('offensive-substitution: 🔄 icon + "Offensive Sub – {name}"', () => {
    const event: GameEvent = makeOffensiveSub();
    const { icon, label } = formatEventLine(event);
    expect(icon).toBe('🔄');
    expect(label).toBe('Offensive Sub – Joey Gallo');
  });

  it('defensive-substitution: 🔄 icon + "Defensive Sub – {name}"', () => {
    const event: GameEvent = makeDefensiveSub();
    const { icon, label } = formatEventLine(event);
    expect(icon).toBe('🔄');
    expect(label).toBe('Defensive Sub – DJ LeMahieu');
  });
});

// ---------------------------------------------------------------------------
// formatInningTag
// ---------------------------------------------------------------------------

describe('formatInningTag', () => {
  it('top of 7th → [T7]', () => {
    expect(formatInningTag(7, 'top')).toBe('[T7]');
  });

  it('bottom of 6th → [B6]', () => {
    expect(formatInningTag(6, 'bottom')).toBe('[B6]');
  });

  it('top of 1st → [T1]', () => {
    expect(formatInningTag(1, 'top')).toBe('[T1]');
  });

  it('bottom of 12th (extras) → [B12]', () => {
    expect(formatInningTag(12, 'bottom')).toBe('[B12]');
  });
});
