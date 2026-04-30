/**
 * Backend-owned catalog of known MLB event type strings with category annotations.
 *
 * Plate-appearance event types are sourced from `allPlays[].result.eventType`.
 * Substitution event types are sourced from `playEvents[].details.eventType`
 * where `type === 'action'`.
 *
 * Only events whose `eventType` appears in this catalog will be emitted to
 * clients.  Unknown event types are logged with context and suppressed from
 * the emitted `game-events` batch.
 *
 * Seeded from real MLB API data.
 */

export type EventCategory =
  | 'plate-appearance-completed'
  | 'pitching-substitution'
  | 'offensive-substitution'
  | 'defensive-substitution';

interface CatalogEntry {
  readonly eventType: string;
  readonly category: EventCategory;
}

// Shorthand aliases to keep the catalog table readable.
const pa: EventCategory = 'plate-appearance-completed';
const ps: EventCategory = 'pitching-substitution';
const os: EventCategory = 'offensive-substitution';
const ds: EventCategory = 'defensive-substitution';

export const KNOWN_EVENT_CATALOG: readonly CatalogEntry[] = [
  // ── Hits ──────────────────────────────────────────────────────────────────
  { eventType: 'single', category: pa },
  { eventType: 'double', category: pa },
  { eventType: 'triple', category: pa },
  { eventType: 'home_run', category: pa },

  // ── Outs ──────────────────────────────────────────────────────────────────
  { eventType: 'field_out', category: pa },
  { eventType: 'flyout', category: pa }, // field_out subtype observed in real data
  { eventType: 'lineout', category: pa }, // field_out subtype observed in real data
  { eventType: 'pop_out', category: pa }, // field_out subtype observed in real data
  { eventType: 'strikeout', category: pa },
  { eventType: 'strikeout_double_play', category: pa }, // strikeout + simultaneous runner retirement on same play
  { eventType: 'force_out', category: pa },
  { eventType: 'grounded_into_double_play', category: pa },
  { eventType: 'double_play', category: pa },
  { eventType: 'triple_play', category: pa },
  { eventType: 'fielders_choice', category: pa },
  { eventType: 'fielders_choice_out', category: pa },

  // ── Walks / hit-by-pitch ──────────────────────────────────────────────────
  { eventType: 'walk', category: pa },
  { eventType: 'intent_walk', category: pa },
  { eventType: 'hit_by_pitch', category: pa },

  // ── Sacrifice ─────────────────────────────────────────────────────────────
  { eventType: 'sac_fly', category: pa },
  { eventType: 'sac_fly_double_play', category: pa },
  { eventType: 'sac_bunt', category: pa },
  { eventType: 'sac_bunt_double_play', category: pa },

  // ── Errors / interference ─────────────────────────────────────────────────
  { eventType: 'field_error', category: pa },
  { eventType: 'catcher_interf', category: pa },
  { eventType: 'fan_interference', category: pa },

  // ── Stolen bases ──────────────────────────────────────────────────────────
  { eventType: 'stolen_base_2b', category: pa },
  { eventType: 'stolen_base_3b', category: pa },
  { eventType: 'stolen_base_home', category: pa },

  // ── Caught stealing ───────────────────────────────────────────────────────
  { eventType: 'caught_stealing_2b', category: pa },
  { eventType: 'caught_stealing_3b', category: pa },
  { eventType: 'caught_stealing_home', category: pa },

  // ── Pickoffs ──────────────────────────────────────────────────────────────
  { eventType: 'pickoff_1b', category: pa },
  { eventType: 'pickoff_2b', category: pa },
  { eventType: 'pickoff_3b', category: pa },
  { eventType: 'pickoff_caught_stealing_2b', category: pa },
  { eventType: 'pickoff_caught_stealing_3b', category: pa },
  { eventType: 'pickoff_caught_stealing_home', category: pa },

  // ── Pitching / passed ball ────────────────────────────────────────────────
  { eventType: 'wild_pitch', category: pa },
  { eventType: 'passed_ball', category: pa },
  { eventType: 'balk', category: pa },

  // ── Substitutions (from playEvents[].details.eventType, type === 'action') ─
  { eventType: 'pitching_substitution', category: ps },
  { eventType: 'offensive_substitution', category: os },
  { eventType: 'defensive_substitution', category: ds },
  { eventType: 'defensive_switch', category: ds },
];

/**
 * O(1) lookup map from raw MLB eventType string to its catalog category.
 * Returns `undefined` for unknown or suppressed event types — those are logged
 * and suppressed before emission.
 */
export const EVENT_TYPE_CATEGORY_MAP: ReadonlyMap<string, EventCategory> =
  new Map(
    KNOWN_EVENT_CATALOG.map((entry) => [entry.eventType, entry.category])
  );

/**
 * Action event types that appear regularly in live game feeds but carry no
 * information relevant to our clients.  They are expected noise and should be
 * silently suppressed with a debug-level log.
 *
 * Any action event type that is NOT in either this set or `EVENT_TYPE_CATEGORY_MAP`
 * is genuinely unknown and should be logged at warn level so it can be
 * investigated and added to one of the two lists.
 */
export const SUPPRESSED_ACTION_TYPES: ReadonlySet<string> = new Set([
  'batter_timeout', // pitch-clock violation or batter stepping out
  'game_advisory', // weather delays, official reviews, etc.
  'mound_visit', // coaching visit without pitching change
  'defensive_indiff', // runner advances unopposed late in a blowout
]);
