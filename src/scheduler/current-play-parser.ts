import type { GameFeedLiveResponse } from './game-feed-types.ts';
import type { Linescore } from './schedule-client.ts';
import type { AtBatState } from '../server/socket-events.ts';
import { mapPitchEvent } from './pitch-mapper.ts';

/**
 * Derives a live `AtBatState` snapshot from the `feed/live` response and
 * the current linescore.
 *
 * Returns `null` when:
 * - `currentPlay` is absent or null
 * - `currentPlay.about.isComplete === true`
 * - `currentPlay.matchup.batter` or `pitcher` are missing
 *
 * Pure function — no I/O, no side-effects.
 *
 * @param feed       Full response from `/api/v1.1/game/{gamePk}/feed/live`.
 * @param linescore  Current linescore from the schedule response for this game.
 */
export function parseCurrentPlay(
  feed: GameFeedLiveResponse,
  linescore: Linescore
): AtBatState | null {
  const currentPlay = feed.liveData.plays.currentPlay;

  if (!currentPlay) return null;
  if (currentPlay.about.isComplete) return null;

  const { batter, pitcher, batSide, pitchHand } = currentPlay.matchup;
  if (!batter || !pitcher) return null;

  const offense = linescore.offense ?? {};

  const pitchSequence = currentPlay.playEvents
    .filter((pe) => pe.type === 'pitch')
    .map(mapPitchEvent);

  return {
    batter: {
      id: batter.id,
      fullName: batter.fullName,
      battingOrder: offense.battingOrder ?? 0,
    },
    pitcher: { id: pitcher.id, fullName: pitcher.fullName },
    batSide: batSide.code,
    pitchHand: pitchHand.code,
    onDeck: offense.onDeck ?? null,
    inHole: offense.inHole ?? null,
    first: offense.first ?? null,
    second: offense.second ?? null,
    third: offense.third ?? null,
    count: {
      balls: currentPlay.count.balls,
      strikes: currentPlay.count.strikes,
    },
    pitchSequence,
  };
}
