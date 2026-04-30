import type {
  GameFeedLiveResponse,
  LiveBoxscorePlayer,
  LiveBoxscoreTeam,
} from './game-feed-types.ts';
import type {
  InningBreakSummary,
  InningBreakScoringPlay,
  InningBreakBatter,
  InningBreakPitcher,
} from '../server/socket-events.ts';

/**
 * Assembles an `InningBreakSummary` from a `feed/live` response and the
 * game context available at the between-innings transition.
 *
 * Returns `null` when `feedResponse.liveData.boxscore` is absent (malformed
 * or very early response where the boxscore has not yet resolved).
 *
 * Pure function — no I/O, no side-effects.
 *
 * @param gamePk               MLB game identifier.
 * @param feedResponse         Full response from `/api/v1.1/game/{gamePk}/feed/live`.
 * @param inningLabel          Human-readable break label, e.g. "Middle 3rd".
 * @param upcomingBattingTeam  Abbreviation of the team about to bat, e.g. "NYY".
 * @param upcomingBattingSide  Whether the upcoming batting team is 'home' or 'away'.
 * @param upcomingPitcherId    Player ID of the pitcher for the upcoming half-inning,
 *                             or null if unknown. Sourced from GameUpdate.upcomingPitcher.
 * @param homeTeamAbbr         Abbreviation of the home team. Used to attribute scoring plays.
 * @param awayTeamAbbr         Abbreviation of the away team. Used to attribute scoring plays.
 */
export function buildInningBreakSummary(
  gamePk: number,
  feedResponse: GameFeedLiveResponse,
  inningLabel: string,
  upcomingBattingTeam: string,
  upcomingBattingSide: 'home' | 'away',
  upcomingPitcherId: number | null,
  homeTeamAbbr: string,
  awayTeamAbbr: string
): InningBreakSummary | null {
  const boxscore = feedResponse.liveData.boxscore;
  if (!boxscore) return null;

  const allPlays = feedResponse.liveData.plays.allPlays ?? [];

  const scoringPlays = buildScoringPlays(allPlays, homeTeamAbbr, awayTeamAbbr);
  const upcomingBatters = buildUpcomingBatters(
    allPlays,
    boxscore.teams[upcomingBattingSide],
    upcomingBattingSide
  );
  const pitcher = buildPitcherContext(
    upcomingPitcherId,
    upcomingBattingSide === 'home' ? 'away' : 'home',
    boxscore.teams
  );

  return {
    gamePk,
    inningLabel,
    scoringPlays,
    upcomingBatters,
    upcomingBattingTeam,
    pitcher,
  };
}

// ---------------------------------------------------------------------------
// Scoring plays
// ---------------------------------------------------------------------------

function buildScoringPlays(
  allPlays: GameFeedLiveResponse['liveData']['plays']['allPlays'],
  homeTeamAbbr: string,
  awayTeamAbbr: string
): InningBreakScoringPlay[] {
  if (!allPlays) return [];

  const scoring = allPlays.filter(
    (p) => p.about.isScoringPlay && p.about.isComplete
  );

  return scoring.slice(-5).reverse().map((p): InningBreakScoringPlay => ({
    inning: p.about.inning,
    halfInning: p.about.halfInning,
    description: p.result.description,
    rbi: p.result.rbi,
    // 'top' = away team batting, 'bottom' = home team batting.
    battingTeam: p.about.halfInning === 'top' ? awayTeamAbbr : homeTeamAbbr,
  }));
}

// ---------------------------------------------------------------------------
// Upcoming batters
// ---------------------------------------------------------------------------

function buildUpcomingBatters(
  allPlays: GameFeedLiveResponse['liveData']['plays']['allPlays'],
  battingTeam: LiveBoxscoreTeam,
  battingSide: 'home' | 'away'
): InningBreakBatter[] {
  const { battingOrder, players } = battingTeam;
  if (battingOrder.length === 0) return [];

  // The batting half for this side: away=top, home=bottom.
  const battingHalf: 'top' | 'bottom' =
    battingSide === 'away' ? 'top' : 'bottom';

  // Find the last completed plate appearance for this batting side to determine
  // which slot in the order was last up. Wrap-around to the start if needed.
  const lastSlotIndex = findLastBatterSlotIndex(
    allPlays ?? [],
    battingHalf,
    battingOrder,
    players
  );

  // Next 3 batters start from the slot after the last batter, wrapping.
  const count = Math.min(3, battingOrder.length);
  const result: InningBreakBatter[] = [];

  for (let i = 0; i < count; i++) {
    const slotIndex = (lastSlotIndex + 1 + i) % battingOrder.length;
    const playerId = battingOrder[slotIndex];
    if (playerId === undefined) continue;

    const playerKey = `ID${String(playerId)}`;
    const player = players[playerKey];
    if (!player) continue;

    result.push(mapBatter(player, slotIndex));
  }

  return result;
}

/**
 * Returns the 0-based index into `battingOrder` for the last batter who had
 * a completed plate appearance in `battingHalf`. Returns -1 (causing the
 * first upcoming batter to be slot 0 = leadoff) when no plays are found for
 * this team, e.g. before the first at-bat of the game.
 */
function findLastBatterSlotIndex(
  allPlays: NonNullable<GameFeedLiveResponse['liveData']['plays']['allPlays']>,
  battingHalf: 'top' | 'bottom',
  battingOrder: number[],
  players: Record<string, LiveBoxscorePlayer>
): number {
  // Walk backwards through allPlays to find the most recent completed play
  // for this half-inning. The highest atBatIndex in the matching half gives us
  // the last batter.
  let highestIndex = -1;
  let lastBatterId: number | null = null;

  for (const play of allPlays) {
    if (
      play.about.halfInning === battingHalf &&
      play.about.isComplete &&
      play.about.atBatIndex > highestIndex
    ) {
      highestIndex = play.about.atBatIndex;
      lastBatterId = play.matchup.batter.id;
    }
  }

  if (lastBatterId === null) return -1;

  // Find the slot index for this batter in the batting order.
  // battingOrder[i] is a player ID; find which index holds our lastBatterId.
  const playerKey = `ID${String(lastBatterId)}`;
  const player = players[playerKey];
  if (!player) return -1;

  // battingOrder slot is encoded as slot×100 (100=1st slot, …, 900=9th slot).
  // The 0-based index in the battingOrder array is (slot×100 / 100) - 1.
  const slotCode = player.battingOrder;
  if (slotCode === 0) return -1; // pitcher / not in batting order

  const slotOneBased = Math.floor(slotCode / 100);
  return slotOneBased - 1;
}

function mapBatter(
  player: LiveBoxscorePlayer,
  slotIndex: number
): InningBreakBatter {
  const { person, stats, seasonStats } = player;
  const batting = stats.batting;
  const season = seasonStats.batting;

  const pa = season.plateAppearances ?? 0;
  const kPct =
    pa > 0
      ? Math.round((season.strikeOuts / pa) * 100) / 100
      : 0;
  const bbPct =
    pa > 0
      ? Math.round((season.baseOnBalls / pa) * 100) / 100
      : 0;

  return {
    id: person.id,
    fullName: person.fullName,
    lineupPosition: slotIndex + 1,
    today: {
      hits: batting.hits,
      atBats: batting.atBats,
      homeRuns: batting.homeRuns,
    },
    season: {
      avg: season.avg,
      ops: season.ops,
      homeRuns: season.homeRuns,
      kPct,
      bbPct,
    },
  };
}

// ---------------------------------------------------------------------------
// Pitcher context
// ---------------------------------------------------------------------------

function buildPitcherContext(
  pitcherId: number | null,
  defendingSide: 'home' | 'away',
  teams: { home: LiveBoxscoreTeam; away: LiveBoxscoreTeam }
): InningBreakPitcher | null {
  if (pitcherId === null) return null;

  const defendingTeam = teams[defendingSide];
  const playerKey = `ID${String(pitcherId)}`;
  const player = defendingTeam.players[playerKey];
  if (!player) return null;

  const { person, stats, seasonStats } = player;
  const pitching = stats.pitching;

  // gamesStarted === 1 in today's stats means this player started this game.
  if (pitching.gamesStarted === 1) {
    return {
      id: person.id,
      fullName: person.fullName,
      role: 'starter',
      gameStats: {
        inningsPitched: pitching.inningsPitched,
        earnedRuns: pitching.earnedRuns,
        strikeOuts: pitching.strikeOuts,
        baseOnBalls: pitching.baseOnBalls,
        hits: pitching.hits,
        pitchesThrown: pitching.pitchesThrown,
      },
    };
  }

  const seasonPitching = seasonStats.pitching;
  return {
    id: person.id,
    fullName: person.fullName,
    role: 'reliever',
    seasonStats: {
      era: seasonPitching.era,
      inningsPitched: seasonPitching.inningsPitched,
      strikeoutsPer9: seasonPitching.strikeoutsPer9Inn,
      walksPer9: seasonPitching.walksPer9Inn,
    },
  };
}
