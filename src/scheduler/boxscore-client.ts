import axios from 'axios';
import type { BoxscoreResponse } from './game-feed-types.ts';

const MLB_GAME_BASE = 'https://statsapi.mlb.com/api/v1/game';
const REQUEST_TIMEOUT_MS = 8_000;

/**
 * Fetches the boxscore for the given game.
 *
 * Used exclusively to retrieve `topPerformers[]` for the `game-summary` event.
 * `liveData.decisions` is sourced from the final diffPatch response, not here.
 *
 * @param gamePk MLB game identifier.
 */
export async function fetchBoxscore(gamePk: number): Promise<BoxscoreResponse> {
  const url = `${MLB_GAME_BASE}/${gamePk}/boxscore`;
  const response = await axios.get<BoxscoreResponse>(url, {
    timeout: REQUEST_TIMEOUT_MS,
    headers: { 'User-Agent': 'mlb-gameday-ping/0.1' },
  });
  return response.data;
}
