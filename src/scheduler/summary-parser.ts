import type {
  GameFeedResponse,
  BoxscoreResponse,
  NextGameScheduleResponse,
} from './game-feed-types.ts';
import type {
  GameSummary,
  GameDecisions,
  TopPerformer,
  NextGame,
} from '../server/socket-events.ts';
import { logger } from '../config/logger.ts';

/**
 * Builds a `GameSummary` payload from the collected final-game data sources.
 *
 * Partial failures are handled by the scheduler before calling this function:
 * - If the boxscore fetch failed, pass `{ topPerformers: [] }`.
 * - If the next-game fetch failed, pass `null`.
 * This function will still produce a valid `GameSummary` in both cases.
 *
 * @throws If `liveData.decisions` is absent from `feedResponse`. The scheduler
 *         should catch this and handle it as a final-enrichment failure.
 *
 * @param gamePk                    MLB game identifier.
 * @param finalScore                Final away/home score (from the last `GameUpdate`).
 * @param innings                   Total innings played (from the last `GameUpdate`).
 * @param isExtraInnings            Whether the game went to extra innings.
 * @param feedResponse              Final diffPatch response — must contain `liveData.decisions`.
 * @param boxscoreResponse          Boxscore response — used for `topPerformers[]`.
 * @param nextGameScheduleResponse  Raw schedule response for the next game, or null.
 * @param trackedTeamId             The tracked team's MLB ID (used to identify the opponent).
 */
export function buildGameSummary(
  gamePk: number,
  finalScore: { away: number; home: number },
  innings: number,
  isExtraInnings: boolean,
  feedResponse: GameFeedResponse,
  boxscoreResponse: BoxscoreResponse,
  nextGameScheduleResponse: NextGameScheduleResponse | null,
  trackedTeamId: number,
): GameSummary {
  const decisions = parseDecisions(gamePk, feedResponse);
  const topPerformers = parseTopPerformers(gamePk, boxscoreResponse);
  const nextGame = parseNextGame(nextGameScheduleResponse, trackedTeamId, gamePk);

  return {
    gamePk,
    finalScore,
    innings,
    isExtraInnings,
    decisions,
    topPerformers,
    boxscoreUrl: `https://www.mlb.com/gameday/${gamePk}/final/box-score`,
    nextGame,
  };
}

function parseDecisions(gamePk: number, feedResponse: GameFeedResponse): GameDecisions {
  const raw = feedResponse.liveData.decisions;
  if (!raw) {
    throw new Error(`liveData.decisions missing from final feed response for gamePk ${gamePk}`);
  }
  return {
    winner: { id: raw.winner.id, fullName: raw.winner.fullName },
    loser: { id: raw.loser.id, fullName: raw.loser.fullName },
    save: raw.save ? { id: raw.save.id, fullName: raw.save.fullName } : null,
  };
}

function parseTopPerformers(gamePk: number, boxscoreResponse: BoxscoreResponse): TopPerformer[] {
  return boxscoreResponse.topPerformers.reduce<TopPerformer[]>((acc, entry) => {
    const { person, stats } = entry.player;
    // Pitching summary takes precedence over batting (a two-way player like Ohtani
    // is represented by their pitching line when they pitched).
    const summary = stats.pitching?.summary ?? stats.batting?.summary ?? '';
    if (!summary) {
      logger.warn('topPerformer has no usable summary string — skipping', {
        gamePk,
        playerId: person.id,
      });
      return acc;
    }
    acc.push({ player: { id: person.id, fullName: person.fullName }, summary });
    return acc;
  }, []);
}

function parseNextGame(
  response: NextGameScheduleResponse | null,
  trackedTeamId: number,
  currentGamePk: number,
): NextGame | null {
  if (!response) return null;

  // Iterate all dates/games to find the first game that is not the just-completed
  // game. This correctly handles same-day doubleheaders and timezone edge cases
  // where the current game appears in today's date bucket.
  let game: (typeof response.dates)[number]['games'][number] | undefined;
  outer: for (const date of response.dates) {
    for (const g of date.games) {
      if (g.gamePk !== currentGamePk) {
        game = g;
        break outer;
      }
    }
  }
  if (!game) return null;

  const { away, home } = game.teams;
  const isTrackedAway = away.team.id === trackedTeamId;
  const opponent = isTrackedAway ? home.team : away.team;

  return {
    gamePk: game.gamePk,
    opponent: {
      id: opponent.id,
      name: opponent.name,
      abbreviation: opponent.abbreviation,
    },
    gameTime: game.gameDate,
    venue: game.venue.name,
    probablePitchers: {
      home: home.probablePitcher
        ? { id: home.probablePitcher.id, fullName: home.probablePitcher.fullName }
        : null,
      away: away.probablePitcher
        ? { id: away.probablePitcher.id, fullName: away.probablePitcher.fullName }
        : null,
    },
  };
}
