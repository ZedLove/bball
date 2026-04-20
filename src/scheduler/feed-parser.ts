import type { GameFeedResponse } from './game-feed-types.ts';
import { mapPitchEvent } from './pitch-mapper.ts';
import type {
  GameEvent,
  PitchEvent,
  PlateAppearanceCompletedEvent,
  PitchingSubstitutionEvent,
  OffensiveSubstitutionEvent,
  DefensiveSubstitutionEvent,
} from '../server/socket-events.ts';
import {
  EVENT_TYPE_CATEGORY_MAP,
  SUPPRESSED_ACTION_TYPES,
} from './known-event-types.ts';
import { logger } from '../config/logger.ts';

/**
 * Transforms completed play deltas from a live-feed response into typed
 * `GameEvent` domain objects.
 *
 * Processing rules:
 * - Only plays with `isComplete === true` are considered.
 * - Only plays with `atBatIndex > lastProcessedAtBatIndex` are emitted
 *   (deduplication against the cursor maintained by the scheduler).
 * - Within each qualifying play, substitution action events are emitted
 *   before the plate-appearance result, preserving temporal order.
 * - Event types not found in the known-event catalog are logged and suppressed.
 *
 * @param response                Raw MLB diffPatch response.
 * @param gamePk                  Game identifier for event correlation.
 * @param lastProcessedAtBatIndex Highest atBatIndex already emitted to clients.
 *                                Plays at or below this index are skipped.
 * @returns Ordered `GameEvent[]` for this poll window. Empty when no new
 *          qualifying plays are found.
 */
export function parseFeedEvents(
  response: GameFeedResponse,
  gamePk: number,
  lastProcessedAtBatIndex: number
): GameEvent[] {
  const events: GameEvent[] = [];
  const { teams, players } = response.gameData;
  const { allPlays } = response.liveData.plays;

  if (!allPlays) {
    logger.warn(
      'diffPatch response missing liveData.plays.allPlays — skipping event parsing',
      { gamePk }
    );
    return events;
  }

  for (const play of allPlays) {
    if (!play.about.isComplete) continue;
    if (play.about.atBatIndex <= lastProcessedAtBatIndex) {
      logger.debug('Play deduplicated — atBatIndex already processed', {
        gamePk,
        atBatIndex: play.about.atBatIndex,
        lastProcessedAtBatIndex,
      });
      continue;
    }

    const { atBatIndex, halfInning, inning, isScoringPlay } = play.about;
    const battingTeam =
      halfInning === 'top' ? teams.away.abbreviation : teams.home.abbreviation;
    const defendingTeam =
      halfInning === 'top' ? teams.home.abbreviation : teams.away.abbreviation;

    // ── 1. Scan playEvents: collect pitch sequence + emit substitutions ───────
    const pitchSequence: PitchEvent[] = [];
    for (const pe of play.playEvents) {
      if (pe.type === 'pitch') {
        pitchSequence.push(mapPitchEvent(pe));
        continue;
      }

      if (pe.type !== 'action') continue;

      const { description, eventType } = pe.details;
      if (!eventType) {
        logger.warn('Action event missing eventType — skipping', {
          gamePk,
          atBatIndex,
        });
        continue;
      }

      const category = EVENT_TYPE_CATEGORY_MAP.get(eventType);

      if (!category) {
        if (SUPPRESSED_ACTION_TYPES.has(eventType)) {
          logger.debug('Action event type suppressed', {
            gamePk,
            atBatIndex,
            eventType,
          });
        } else {
          logger.warn(
            'Unknown action event type — not in catalog or suppressed list',
            {
              gamePk,
              atBatIndex,
              eventType,
            }
          );
        }
        continue;
      }

      // Skip if the action event maps to a plate-appearance category (shouldn't
      // happen in practice, but guards against catalog misclassification).
      if (category === 'plate-appearance-completed') continue;

      const playerId = pe.player?.id;
      if (playerId === undefined) {
        logger.warn('Substitution action event missing player id — skipping', {
          gamePk,
          atBatIndex,
          eventType,
        });
        continue;
      }

      const playerEntry = players[`ID${playerId}`];
      if (!playerEntry) {
        logger.warn(
          'Player not found in gameData.players — skipping substitution event',
          {
            gamePk,
            atBatIndex,
            eventType,
            playerId,
          }
        );
        continue;
      }

      const subFields = {
        gamePk,
        atBatIndex,
        inning,
        halfInning,
        battingTeam,
        defendingTeam,
        eventType,
        description,
        player: { id: playerId, fullName: playerEntry.fullName },
      };

      if (category === 'pitching-substitution') {
        const event: PitchingSubstitutionEvent = {
          ...subFields,
          category: 'pitching-substitution',
        };
        events.push(event);
      } else if (category === 'offensive-substitution') {
        const event: OffensiveSubstitutionEvent = {
          ...subFields,
          category: 'offensive-substitution',
        };
        events.push(event);
      } else if (category === 'defensive-substitution') {
        const event: DefensiveSubstitutionEvent = {
          ...subFields,
          category: 'defensive-substitution',
        };
        events.push(event);
      }
    }

    // ── 2. Plate appearance outcome ──────────────────────────────────────────
    const { eventType, description, rbi } = play.result;
    const category = EVENT_TYPE_CATEGORY_MAP.get(eventType);

    if (!category) {
      logger.warn(
        'Plate-appearance event type suppressed — not in known-event catalog',
        {
          gamePk,
          atBatIndex,
          eventType,
        }
      );
      continue;
    }

    if (category !== 'plate-appearance-completed') {
      logger.warn(
        'Unexpected non-plate-appearance category on play result — skipping',
        {
          gamePk,
          atBatIndex,
          eventType,
          category,
        }
      );
      continue;
    }

    const paEvent: PlateAppearanceCompletedEvent = {
      gamePk,
      atBatIndex,
      inning,
      halfInning,
      battingTeam,
      defendingTeam,
      eventType,
      description,
      category: 'plate-appearance-completed',
      isScoringPlay,
      rbi,
      batter: {
        id: play.matchup.batter.id,
        fullName: play.matchup.batter.fullName,
      },
      pitcher: {
        id: play.matchup.pitcher.id,
        fullName: play.matchup.pitcher.fullName,
      },
      pitchSequence,
    };

    events.push(paEvent);
  }

  return events;
}


