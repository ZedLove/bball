import type { Server as SocketIOServer } from 'socket.io';
import { CONFIG } from '../config/env.ts';
import { fetchSchedule } from './schedule-client.ts';
import type { ScheduleResponse, Linescore } from './schedule-client.ts';
import { parseGameUpdate } from './parser.ts';
import { logUpdate } from './logger.ts';
import type { GameUpdate } from './parser.ts';
import { logger } from '../config/logger.ts';
import { fetchGameFeed } from './game-feed-client.ts';
import { fetchGameFeedLive } from './game-feed-live-client.ts';
import type {
  GameFeedResponse,
  GameFeedLiveResponse,
} from './game-feed-types.ts';
import type {
  BoxscoreResponse,
  NextGameScheduleResponse,
} from './game-feed-types.ts';
import { parseCurrentPlay } from './current-play-parser.ts';
import type { AtBatState, PitchEvent } from '../server/socket-events.ts';
import { fetchBoxscore } from './boxscore-client.ts';
import { fetchNextGame } from './next-game-client.ts';
import { parseFeedEvents } from './feed-parser.ts';
import { buildGameSummary } from './summary-parser.ts';
import { createEnrichmentState } from './enrichment-state.ts';
import type { EnrichmentState } from './enrichment-state.ts';
import { hasLinescoreDelta } from './change-detector.ts';
import { SOCKET_EVENTS } from '../server/socket-events.ts';
import type { GameEventsPayload } from '../server/socket-events.ts';
import { mapPitchEvent } from './pitch-mapper.ts';
import { mergePitcherStats, ZERO_PITCHER_STATS } from './pitcher-stats.ts';
import type { PitcherGameStats } from './pitcher-stats.ts';
import { VenueClient } from './venue-client.ts';
import type { VenueFieldInfo } from './venue-client.ts';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Converts an ISO 8601 UTC datetime string to the MLB API cursor format
 * "YYYYMMDD_HHmmss".  e.g. "2026-04-15T22:10:00Z" → "20260415_221000"
 */
export function toTimecode(isoDate: string): string {
  const d = new Date(isoDate);
  const YYYY = d.getUTCFullYear();
  const MM = String(d.getUTCMonth() + 1).padStart(2, '0');
  const DD = String(d.getUTCDate()).padStart(2, '0');
  const HH = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${YYYY}${MM}${DD}_${HH}${mm}${ss}`;
}

/** Returns today's date in "YYYY-MM-DD" UTC format for use as a schedule API startDate. */
export function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

interface ScheduleFetchResult {
  schedule: ScheduleResponse;
  update: GameUpdate | null;
}

/** Fetches and parses the current game state with exponential-backoff retry. */
async function fetchWithRetry(): Promise<ScheduleFetchResult | null> {
  let attempt = 0;
  while (attempt <= CONFIG.MAX_RETRIES) {
    try {
      const schedule = await fetchSchedule();
      const update = parseGameUpdate(schedule, CONFIG.TEAM_ID);
      return { schedule, update };
    } catch (err) {
      attempt++;
      const backoff = CONFIG.RETRY_BACKOFF_MS * 2 ** (attempt - 1);
      logger.error(
        `Fetch failed (attempt ${attempt}/${CONFIG.MAX_RETRIES}) – %s`,
        err
      );
      if (attempt > CONFIG.MAX_RETRIES) {
        logger.error('Giving up on this tick, will try again later.');
        return null;
      }
      logger.warn(`Back-off ${backoff}ms before retry…`);
      await delay(backoff);
    }
  }
  return null;
}

export interface Scheduler {
  stop(): void;
  /** Last game update that was emitted, or null if none yet. Used to replay state to newly connected clients. */
  getLastUpdate(): GameUpdate | null;
}

export function startScheduler(io: SocketIOServer): Scheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let lastTrackingMode: GameUpdate['trackingMode'] | null = null;
  let lastEmittedUpdate: GameUpdate | null = null;
  let enrichmentState: EnrichmentState | null = null;

  /**
   * Per-pitcher enrichment stats keyed by pitcherId.
   * Accumulates across innings; cleared only on game change or final.
   */
  const pitcherStatsCache = new Map<
    number,
    { enrichmentStats: PitcherGameStats; enrichmentPitchHistory: PitchEvent[] }
  >();
  let lastKnownGamePk: number | null = null;

  const venueClient = new VenueClient();
  let currentVenueFieldInfo: VenueFieldInfo | null = null;
  let lastVenueId: number | null = null;

  const loop = async () => {
    if (stopped) return;

    // ── 1. Fetch schedule + parse baseline ────────────────────────────────────
    const fetchResult = await fetchWithRetry();
    if (stopped) return;

    const schedule: ScheduleResponse | null = fetchResult?.schedule ?? null;
    const update: GameUpdate | null = fetchResult?.update ?? null;

    // ── 2. Extract active game context for enrichment management ──────────────
    // Re-find the active game in the raw schedule so we can read linescore and
    // gameDate, which are not surfaced on GameUpdate (to keep the socket
    // payload clean).
    const activeGame =
      update && schedule
        ? (schedule.dates?.[0]?.games.find((g) => g.gamePk === update.gamePk) ??
          null)
        : null;
    const currentLinescore: Linescore | null = activeGame?.linescore ?? null;
    const currentGameDate: string | null = activeGame?.gameDate ?? null;

    // ── 3. Manage enrichment state lifecycle ──────────────────────────────────
    if (!update || !activeGame) {
      // No trackable game in this tick — reset any live enrichment cursor.
      if (enrichmentState !== null) {
        logger.info(
          'Active game dropped out of scope — resetting enrichment state',
          {
            gamePk: enrichmentState.gamePk,
          }
        );
        enrichmentState = null;
      }
    } else {
      const currentGamePk = update.gamePk;
      const isNewGame =
        enrichmentState === null || enrichmentState.gamePk !== currentGamePk;

      // Only (re-)initialise enrichment state for non-final games.
      // After a final game tears down the state, we must not re-create it
      // for the same gamePk on subsequent idle-poll ticks.
      if (isNewGame && update.trackingMode !== 'final') {
        if (enrichmentState !== null) {
          logger.info('gamePk changed — resetting enrichment state', {
            from: enrichmentState.gamePk,
            to: currentGamePk,
          });
        }
        const seedTimestamp = toTimecode(currentGameDate!);
        enrichmentState = createEnrichmentState(currentGamePk, seedTimestamp);
        logger.info('Enrichment state initialized', {
          gamePk: currentGamePk,
          seedTimestamp,
        });
      }
    }

    // ── 3b. Venue field info fetch (once per venueId) ─────────────────────────
    // Kicked off as a Promise and resolved concurrently with the live-feed /
    // diffPatch fetches in step 4. lastVenueId is only advanced once a non-null
    // result is received — a null result (transient failure) keeps lastVenueId
    // unset so the next tick retries transparently.
    const currentVenueId = update?.venueId ?? null;
    if (currentVenueId === null) {
      lastVenueId = null;
      currentVenueFieldInfo = null;
    }
    const needsVenueFetch =
      currentVenueId !== null && currentVenueId !== lastVenueId;
    if (needsVenueFetch) {
      currentVenueFieldInfo = null; // clear stale info immediately
    }
    const venuePromise: Promise<VenueFieldInfo | null> = needsVenueFetch
      ? venueClient.fetchFieldInfo(currentVenueId!)
      : Promise.resolve(currentVenueFieldInfo);

    // ── 4. Parallel enrichment fetches ────────────────────────────────────────
    // Fire feed/live and diffPatch fetches concurrently after the schedule
    // resolves and gamePk is known. Both are conditional; either may be absent.
    // Promise.allSettled ensures a failure in one does not cancel the other.

    const shouldFetchAtBat =
      update !== null &&
      update.trackingMode !== 'between-innings' &&
      update.trackingMode !== 'final' &&
      update.gamePk !== undefined;

    let shouldEnrich = false;
    let isFinal = false;
    let isFirstTick = false;

    if (enrichmentState !== null) {
      isFinal = update?.trackingMode === 'final';
      isFirstTick = enrichmentState.lastLinescoreSnapshot === null;
      shouldEnrich =
        !isFirstTick &&
        (isFinal ||
          (currentLinescore !== null &&
            hasLinescoreDelta(
              currentLinescore,
              enrichmentState.lastLinescoreSnapshot
            )));
    }

    const liveFeedPromise: Promise<GameFeedLiveResponse | null> =
      shouldFetchAtBat
        ? fetchGameFeedLive(update!.gamePk).catch((err) => {
            logger.warn('feed/live fetch failed — atBat will be null', {
              gamePk: update!.gamePk,
              message: err instanceof Error ? err.message : String(err),
            });
            return null;
          })
        : Promise.resolve(null);

    const diffPatchPromise: Promise<GameFeedResponse | null> =
      shouldEnrich && enrichmentState !== null
        ? fetchGameFeed(
            enrichmentState.gamePk,
            enrichmentState.lastTimestamp
          ).catch((err) => {
            const isError = err instanceof Error;
            const httpErr = err as {
              code?: string;
              response?: { status?: number; statusText?: string };
            };
            logger.error(
              'Enrichment fetch failed — baseline game-update will still be emitted',
              {
                gamePk: enrichmentState!.gamePk,
                name: isError ? err.name : 'Unknown',
                message: isError ? err.message : String(err),
                code: httpErr.code,
                status: httpErr.response?.status,
                statusText: httpErr.response?.statusText,
              }
            );
            return null;
          })
        : Promise.resolve(null);

    const [liveFeedResult, diffPatchResult, venueResult] = await Promise.all([
      liveFeedPromise,
      diffPatchPromise,
      venuePromise,
    ]);
    if (stopped) return;

    // Apply venue result; only advance lastVenueId on success to allow retry.
    if (needsVenueFetch && venueResult !== null) {
      currentVenueFieldInfo = venueResult;
      lastVenueId = currentVenueId!;
    }

    // ── 5. Assemble atBat and pitcher stats, then build full update ───────────
    const atBat: AtBatState | null =
      liveFeedResult !== null && currentLinescore !== null
        ? parseCurrentPlay(liveFeedResult, currentLinescore)
        : null;

    // ── 5b. Pitcher stats computation ─────────────────────────────────────────
    const pitcherId = update?.currentPitcher?.id ?? null;
    const currentGamePk = update?.gamePk ?? null;

    // Clear all per-pitcher entries on game change or final.
    if (currentGamePk !== lastKnownGamePk || update?.trackingMode === 'final') {
      pitcherStatsCache.clear();
    }
    lastKnownGamePk = currentGamePk;

    if (pitcherId !== null) {
      if (!pitcherStatsCache.has(pitcherId)) {
        pitcherStatsCache.set(pitcherId, {
          enrichmentStats: ZERO_PITCHER_STATS,
          enrichmentPitchHistory: [],
        });
      }

      // merge+append (not overwrite) so stats accumulate all completed plays, not just the latest diffPatch window.
      const allPlaysList = diffPatchResult?.liveData.plays.allPlays ?? null;
      if (allPlaysList !== null) {
        const cached = pitcherStatsCache.get(pitcherId)!;
        const deltaPitchHistory = allPlaysList
          .filter((play) => play.matchup.pitcher.id === pitcherId)
          .flatMap((play) =>
            play.playEvents
              .filter((ev) => ev.type === 'pitch')
              .map(mapPitchEvent)
          );
        pitcherStatsCache.set(pitcherId, {
          enrichmentStats: mergePitcherStats(
            cached.enrichmentStats,
            deltaPitchHistory
          ),
          enrichmentPitchHistory: [
            ...cached.enrichmentPitchHistory,
            ...deltaPitchHistory,
          ],
        });
      }
    }

    // Compute current at-bat delta from the live feed.
    // Only include pitches from an in-progress (isComplete === false) at-bat.
    // A completed currentPlay's pitches are already covered by the next
    // diffPatch window — including them here would double-count them.
    const currentPlay = liveFeedResult?.liveData.plays.currentPlay ?? null;
    const currentAtBatPitches: PitchEvent[] =
      pitcherId !== null &&
      currentPlay !== null &&
      currentPlay.about.isComplete === false &&
      currentPlay.matchup.pitcher.id === pitcherId
        ? currentPlay.playEvents
            .filter((ev) => ev.type === 'pitch')
            .map(mapPitchEvent)
        : [];

    const pitcherEntry =
      pitcherId !== null ? (pitcherStatsCache.get(pitcherId) ?? null) : null;

    const mergedStats =
      pitcherEntry !== null
        ? mergePitcherStats(pitcherEntry.enrichmentStats, currentAtBatPitches)
        : null;

    const pitchHistory: PitchEvent[] =
      pitcherEntry !== null
        ? [...pitcherEntry.enrichmentPitchHistory, ...currentAtBatPitches]
        : [];

    const fullUpdate: GameUpdate | null =
      update !== null
        ? {
            ...update,
            atBat,
            pitchHistory,
            currentPitcher:
              update.currentPitcher !== null && mergedStats !== null
                ? { ...update.currentPitcher, ...mergedStats }
                : update.currentPitcher,
            venueFieldInfo: currentVenueFieldInfo,
          }
        : null;

    // ── 6. Emit baseline game-update ──────────────────────────────────────────
    // Emitted before enrichment events so clients receive current game state
    // before the enriched events that explain it — a consistent state-first
    // ordering.
    //
    // Transition-only modes: emit once when entering, then stay quiet until the
    // mode changes.  'outs' and 'runs' emit every tick because their values
    // change continuously.
    const isTransitionMode = (mode: GameUpdate['trackingMode']) =>
      mode === 'batting' || mode === 'between-innings' || mode === 'final';

    const shouldEmit =
      fullUpdate !== null &&
      (!isTransitionMode(fullUpdate.trackingMode) ||
        lastTrackingMode !== fullUpdate.trackingMode);

    if (shouldEmit && fullUpdate !== null) {
      logUpdate(fullUpdate);
      io.emit(SOCKET_EVENTS.GAME_UPDATE, fullUpdate);
      lastEmittedUpdate = fullUpdate;
    }

    lastTrackingMode = fullUpdate?.trackingMode ?? null;

    // ── 7. Process diffPatch result ───────────────────────────────────────────
    let feedResponseForFinal: GameFeedResponse | null = null;

    if (enrichmentState !== null && shouldEnrich) {
      if (!isFinal) {
        if (isFirstTick) {
          logger.debug('Enrichment skipped on first tick for new gamePk', {
            gamePk: enrichmentState.gamePk,
          });
        } else {
          logger.info('Enrichment fetch triggered', {
            gamePk: enrichmentState.gamePk,
            reason: 'linescore-delta',
          });
        }
      } else {
        logger.info('Enrichment fetch triggered', {
          gamePk: enrichmentState.gamePk,
          reason: 'final',
        });
      }

      // When diffPatch returns null (either [] from API or an error), the
      // linescore already reflects a completed play but diffPatch hasn't
      // indexed it yet. Keep the snapshot stale so hasLinescoreDelta
      // continues to return true on every subsequent tick, guaranteeing a
      // retry. The flag is reset in all non-retry cases below.
      let retryPending = false;

      if (diffPatchResult === null && shouldEnrich) {
        // null means either an error (already logged above) or an empty []
        // response (normal race condition). Either way, hold snapshot stale.
        retryPending = true;
        logger.debug(
          'Enrichment fetch returned empty or failed — will retry next tick',
          {
            gamePk: enrichmentState.gamePk,
          }
        );
      } else if (diffPatchResult !== null) {
        const feedResponse = diffPatchResult;

        const gameEvents = parseFeedEvents(
          feedResponse,
          enrichmentState.gamePk,
          enrichmentState.lastProcessedAtBatIndex
        );

        if (gameEvents.length > 0) {
          const batch: GameEventsPayload = {
            gamePk: enrichmentState.gamePk,
            events: gameEvents,
          };
          io.emit(SOCKET_EVENTS.GAME_EVENTS, batch);
          const maxAtBatIndex = Math.max(
            ...gameEvents.map((e) => e.atBatIndex)
          );
          enrichmentState.lastProcessedAtBatIndex = maxAtBatIndex;
          logger.info('game-events emitted', {
            gamePk: enrichmentState.gamePk,
            count: gameEvents.length,
            lastProcessedAtBatIndex: maxAtBatIndex,
          });
        } else {
          logger.debug('Enrichment fetch returned no new events', {
            gamePk: enrichmentState.gamePk,
          });
        }

        enrichmentState.lastTimestamp = feedResponse.metaData.timeStamp;
        logger.debug('Enrichment cursor advanced', {
          gamePk: enrichmentState.gamePk,
          lastTimestamp: enrichmentState.lastTimestamp,
          lastProcessedAtBatIndex: enrichmentState.lastProcessedAtBatIndex,
        });

        if (isFinal) {
          feedResponseForFinal = feedResponse;
        }
      }

      // Hold the linescore snapshot stale when diffPatch returned empty so
      // hasLinescoreDelta returns true next tick and the scheduler retries
      // without waiting for a further linescore change.
      if (!retryPending && currentLinescore !== null) {
        enrichmentState.lastLinescoreSnapshot = currentLinescore;
      }
    } else if (enrichmentState !== null) {
      if (isFirstTick) {
        logger.debug('Enrichment skipped on first tick for new gamePk', {
          gamePk: enrichmentState.gamePk,
        });
      } else {
        logger.debug('Enrichment skipped — no linescore delta', {
          gamePk: enrichmentState.gamePk,
        });
      }

      // Enrichment was legitimately skipped (no delta or first tick): advance
      // the snapshot so the next tick uses the current linescore as its baseline.
      if (currentLinescore !== null) {
        enrichmentState.lastLinescoreSnapshot = currentLinescore;
      }
    }

    // ── 8. Final game handling ─────────────────────────────────────────────────
    // Runs only once: enrichmentState is set to null at the end of this block,
    // preventing re-execution on subsequent idle-poll ticks.
    if (fullUpdate?.trackingMode === 'final' && enrichmentState !== null) {
      const gamePkForFinal = enrichmentState.gamePk;

      // Fetch boxscore (topPerformers) and next-game data in parallel.
      // Partial failures are tolerated: game-summary is emitted with whatever
      // data is available.
      const [boxscoreResult, nextGameResult] = await Promise.allSettled([
        fetchBoxscore(gamePkForFinal),
        fetchNextGame(CONFIG.TEAM_ID, todayUtcDate()),
      ]);

      const boxscoreResponse: BoxscoreResponse =
        boxscoreResult.status === 'fulfilled'
          ? boxscoreResult.value
          : (() => {
              logger.error(
                'Boxscore fetch failed — game-summary will have empty topPerformers',
                { gamePk: gamePkForFinal, err: boxscoreResult.reason }
              );
              return { topPerformers: [] };
            })();

      const nextGameResponse: NextGameScheduleResponse | null =
        nextGameResult.status === 'fulfilled'
          ? nextGameResult.value
          : (() => {
              logger.error(
                'Next-game fetch failed — game-summary will have null nextGame',
                { gamePk: gamePkForFinal, err: nextGameResult.reason }
              );
              return null;
            })();

      if (feedResponseForFinal !== null) {
        try {
          const summary = buildGameSummary(
            gamePkForFinal,
            { away: fullUpdate.score.away, home: fullUpdate.score.home },
            fullUpdate.inning.number,
            fullUpdate.isExtraInnings,
            feedResponseForFinal,
            boxscoreResponse,
            nextGameResponse,
            CONFIG.TEAM_ID
          );
          io.emit(SOCKET_EVENTS.GAME_SUMMARY, summary);
          logger.info('game-summary emitted', { gamePk: gamePkForFinal });
        } catch (err) {
          logger.error('buildGameSummary threw — game-summary not emitted', {
            gamePk: gamePkForFinal,
            err,
          });
        }
      } else {
        logger.error('Final enrichment failed — game-summary not emitted', {
          gamePk: gamePkForFinal,
        });
      }

      enrichmentState = null;
      logger.info('Enrichment state torn down after final game', {
        gamePk: gamePkForFinal,
      });
    }

    // ── 9. Schedule next tick ─────────────────────────────────────────────────
    const getNextIntervalSec = (update: GameUpdate | null): number => {
      if (
        update === null ||
        update.isDelayed ||
        update.trackingMode === 'final'
      ) {
        return CONFIG.IDLE_POLL_INTERVAL;
      }
      switch (update.trackingMode) {
        case 'between-innings':
          return CONFIG.ACTIVE_POLL_INTERVAL;
        case 'batting':
          return CONFIG.BATTING_POLL_INTERVAL;
        default:
          return CONFIG.ACTIVE_POLL_INTERVAL;
      }
    };

    const intervalSec = getNextIntervalSec(fullUpdate);
    logger.info(`Next tick in ${intervalSec}s`);
    timer = setTimeout(() => {
      loop().catch((err) => logger.error('Scheduler loop error: %s', err));
    }, intervalSec * 1_000);
  };

  // Kick off immediately (fire-and-forget so startup isn't blocked)
  loop().catch((err) => {
    logger.error('Scheduler initial tick failed: %s', err);
  });

  return {
    stop() {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      logger.info('Scheduler stopped');
    },
    getLastUpdate() {
      return lastEmittedUpdate;
    },
  };
}
