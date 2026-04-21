import type {
  GameEvent,
  PlateAppearanceCompletedEvent,
  PitchingSubstitutionEvent,
  OffensiveSubstitutionEvent,
  DefensiveSubstitutionEvent,
} from '../../server/socket-events.ts';

const PLATE_APPEARANCE_LABELS: Record<string, string> = {
  single: 'Single',
  double: 'Double',
  triple: 'Triple',
  home_run: 'Home Run',
  field_out: 'Field Out',
  flyout: 'Flyout',
  lineout: 'Lineout',
  pop_out: 'Pop Out',
  strikeout: 'Strikeout',
  strikeout_double_play: 'Strikeout DP',
  force_out: 'Force Out',
  grounded_into_double_play: 'GIDP',
  double_play: 'Double Play',
  triple_play: 'Triple Play',
  fielders_choice: "Fielder's Choice",
  fielders_choice_out: 'FC Out',
  walk: 'Walk',
  intent_walk: 'Intent Walk (IBB)',
  hit_by_pitch: 'HBP',
  sac_fly: 'Sac Fly',
  sac_fly_double_play: 'Sac Fly DP',
  sac_bunt: 'Sac Bunt',
  sac_bunt_double_play: 'Sac Bunt DP',
  field_error: 'Error',
  catcher_interf: 'Catcher Interference',
  fan_interference: 'Fan Interference',
  stolen_base_2b: 'SB 2B',
  stolen_base_3b: 'SB 3B',
  stolen_base_home: 'SB Home',
  caught_stealing_2b: 'CS 2B',
  caught_stealing_3b: 'CS 3B',
  caught_stealing_home: 'CS Home',
  pickoff_1b: 'Pickoff 1B',
  pickoff_2b: 'Pickoff 2B',
  pickoff_3b: 'Pickoff 3B',
  pickoff_caught_stealing_2b: 'PCS 2B',
  pickoff_caught_stealing_3b: 'PCS 3B',
  pickoff_caught_stealing_home: 'PCS Home',
  wild_pitch: 'Wild Pitch',
  passed_ball: 'Passed Ball',
  balk: 'Balk',
};

const PLATE_APPEARANCE_ICONS: Record<string, string> = {
  home_run: '💥',
  field_error: '❌',
  catcher_interf: '❌',
  fan_interference: '❌',
  stolen_base_2b: '🏃',
  stolen_base_3b: '🏃',
  stolen_base_home: '🏃',
  caught_stealing_2b: '🏃',
  caught_stealing_3b: '🏃',
  caught_stealing_home: '🏃',
  pickoff_1b: '🏃',
  pickoff_2b: '🏃',
  pickoff_3b: '🏃',
  pickoff_caught_stealing_2b: '🏃',
  pickoff_caught_stealing_3b: '🏃',
  pickoff_caught_stealing_home: '🏃',
};

function getPlateAppearanceIcon(eventType: string): string {
  return PLATE_APPEARANCE_ICONS[eventType] ?? '⚾';
}

export function formatEventLine(event: GameEvent): {
  icon: string;
  label: string;
} {
  switch (event.category) {
    case 'plate-appearance-completed': {
      if (event.eventType === 'intent_walk') {
        return { icon: '⚾', label: 'Intent Walk (IBB)' };
      }
      const humanLabel =
        PLATE_APPEARANCE_LABELS[event.eventType] ?? event.eventType;
      const icon = getPlateAppearanceIcon(event.eventType);
      return { icon, label: `${humanLabel} – ${event.batter.fullName}` };
    }
    case 'pitching-substitution':
      return { icon: '🔄', label: `Pitching Sub – ${event.player.fullName}` };
    case 'offensive-substitution':
      return { icon: '🔄', label: `Offensive Sub – ${event.player.fullName}` };
    case 'defensive-substitution':
      return { icon: '🔄', label: `Defensive Sub – ${event.player.fullName}` };
  }
}

export function formatInningTag(
  inning: number,
  halfInning: 'top' | 'bottom'
): string {
  const half = halfInning === 'top' ? 'T' : 'B';
  return `[${half}${inning}]`;
}

// Re-export types for consumers that need them alongside these functions
export type {
  PlateAppearanceCompletedEvent,
  PitchingSubstitutionEvent,
  OffensiveSubstitutionEvent,
  DefensiveSubstitutionEvent,
};
