import type {
  GameFeedLiveResponse,
  LiveBoxscoreTeam,
} from './game-feed-types.ts';
import type { Linescore } from './schedule-client.ts';
import type {
  AtBatState,
  LineupEntry,
  RunnerState,
} from '../server/socket-events.ts';
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

  // Determine which team is batting from the half-inning.
  const battingSide =
    currentPlay.about.halfInning === 'bottom' ? 'home' : 'away';
  const battingTeam = feed.liveData.boxscore?.teams[battingSide];

  // Build lineup from the batting team's boxscore data.
  const lineup = buildLineup(battingTeam);

  // Enrich base runners with season SB stats from the boxscore.
  const players = battingTeam?.players ?? {};

  return {
    batter: {
      id: batter.id,
      fullName: batter.fullName,
      // linescore.offense.battingOrder is 1–9; normalise to slot×100 to match
      // LineupEntry.battingOrder and AtBatPanel's Math.floor(x / 100) display.
      battingOrder: (offense.battingOrder ?? 0) * 100,
    },
    pitcher: { id: pitcher.id, fullName: pitcher.fullName },
    batSide: batSide.code,
    pitchHand: pitchHand.code,
    onDeck: offense.onDeck ?? null,
    inHole: offense.inHole ?? null,
    first: enrichRunner(offense.first ?? null, players),
    second: enrichRunner(offense.second ?? null, players),
    third: enrichRunner(offense.third ?? null, players),
    count: {
      balls: currentPlay.count.balls,
      strikes: currentPlay.count.strikes,
    },
    pitchSequence,
    lineup,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a `LineupEntry[]` from the batting team's boxscore data, ordered by
 * batting slot ascending. Only includes players with a non-zero battingOrder.
 */
function buildLineup(team: LiveBoxscoreTeam | undefined): LineupEntry[] {
  if (!team) return [];

  return team.battingOrder
    .map((playerId) => {
      const key = `ID${playerId}`;
      const player = team.players[key];
      if (!player) return null;

      const ops = player.seasonStats.batting.ops;

      return {
        id: player.person.id,
        fullName: player.person.fullName,
        battingOrder: player.battingOrder,
        atBats: player.stats.batting.atBats,
        hits: player.stats.batting.hits,
        seasonOps: ops !== '' ? ops : null,
      } satisfies LineupEntry;
    })
    .filter(
      (entry): entry is LineupEntry =>
        entry !== null && entry.battingOrder !== 0
    )
    .sort((a, b) => a.battingOrder - b.battingOrder);
}

/**
 * Enriches a base runner from the linescore with season stolen-base stats
 * sourced from the boxscore player map. Returns null when no runner is present.
 */
function enrichRunner(
  runner: { id: number; fullName: string } | null | undefined,
  players: Record<
    string,
    {
      seasonStats: { batting: { stolenBases: number; caughtStealing: number } };
    }
  >
): RunnerState | null {
  if (!runner) return null;
  const key = `ID${runner.id}`;
  const player = players[key];
  const seasonSb = player?.seasonStats.batting.stolenBases ?? 0;
  const caughtStealing = player?.seasonStats.batting.caughtStealing ?? 0;
  return {
    id: runner.id,
    fullName: runner.fullName,
    seasonSb,
    seasonSbAttempts: seasonSb + caughtStealing,
  };
}
