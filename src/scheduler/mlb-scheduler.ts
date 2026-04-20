import { Server as SocketIOServer } from 'socket.io';
import { CONFIG } from '../config/env.ts';
import { fetchSchedule } from './schedule-client.ts';
import type { ScheduleResponse, Linescore } from './schedule-client.ts';
import { parseGameUpdate } from './parser.ts';
import { logUpdate } from './logger.ts';
import type { GameUpdate } from './parser.ts';
import { logger } from '../config/logger.ts';
import { fetchGameFeed } from './game-feed-client.ts';
import type { GameFeedResponse } from './game-feed-types.ts';
import type {
  BoxscoreResponse,
  NextGameScheduleResponse,
} from './game-feed-types.ts';
import { fetchBoxscore } from './boxscore-client.ts';
import { fetchNextGame } from './next-game-client.ts';
import { parseFeedEvents } from './feed-parser.ts';
import { buildGameSummary } from './summary-parser.ts';
import { createEnrichmentState } from './enrichment-state.ts';
import type { EnrichmentState } from './enrichment-state.ts';
import { hasLinescoreDelta } from './change-detector.ts';
import { SOCKET_EVENTS } from '../server/socket-events.ts';
import type { GameEventsPayload } from '../server/socket-events.ts';

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

    // ── 4. Emit baseline game-update ──────────────────────────────────────────
    // Emitted before enrichment so clients receive current game state before
    // the enriched events that explain it — a consistent state-first ordering.
    //
    // Transition-only modes: emit once when entering, then stay quiet until the
    // mode changes.  'outs' and 'runs' emit every tick because their values
    // change continuously.
    const isTransitionMode = (mode: GameUpdate['trackingMode']) =>
      mode === 'batting' || mode === 'between-innings' || mode === 'final';

    const shouldEmit =
      update !== null &&
      (!isTransitionMode(update.trackingMode) ||
        lastTrackingMode !== update.trackingMode);

    if (shouldEmit && update !== null) {
      logUpdate(update);
      io.emit(SOCKET_EVENTS.GAME_UPDATE, update);
      lastEmittedUpdate = update;
    }

    lastTrackingMode = update?.trackingMode ?? null;

    // ── 5. Enrichment fetch ───────────────────────────────────────────────────
    let feedResponseForFinal: GameFeedResponse | null = null;

    if (enrichmentState !== null) {
      const isFinal = update?.trackingMode === 'final';
      // First tick for this gamePk: lastLinescoreSnapshot is null.
      // Enrichment is intentionally skipped to avoid a full-game replay on
      // bootstrap; the cursor is seeded from gameDate in step 3.
      const isFirstTick = enrichmentState.lastLinescoreSnapshot === null;
      const shouldEnrich =
        !isFirstTick &&
        (isFinal ||
          (currentLinescore !== null &&
            hasLinescoreDelta(
              currentLinescore,
              enrichmentState.lastLinescoreSnapshot
            )));

      if (shouldEnrich) {
        logger.info('Enrichment fetch triggered', {
          gamePk: enrichmentState.gamePk,
          reason: isFinal ? 'final' : 'linescore-delta',
        });

        // When diffPatch returns [] (null), the linescore already reflects a
        // completed play but diffPatch hasn't indexed it yet.  Keep the snapshot
        // stale so hasLinescoreDelta continues to return true on every subsequent
        // tick, guaranteeing a retry every 10 s regardless of whether the
        // linescore changes again.  The flag is reset to true in every other
        // code path so the snapshot advances normally in all non-retry cases.
        let retryPending = false;

        try {
          const feedResponse = await fetchGameFeed(
            enrichmentState.gamePk,
            enrichmentState.lastTimestamp
          );

          // The diffPatch endpoint returns [] when there are no new events since
          // the cursor timecode. This is a normal race: the linescore endpoint
          // detects a change before diffPatch has indexed the new events.
          // Leave the cursor unchanged and hold the snapshot stale so the
          // scheduler retries on the very next tick.
          if (feedResponse === null) {
            retryPending = true;
            logger.debug(
              'Enrichment fetch returned empty — will retry next tick',
              {
                gamePk: enrichmentState.gamePk,
              }
            );
          } else {
            // Parse completed plays into domain events and emit if non-empty.
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

            // Advance the cursor for the next diffPatch call.
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
        } catch (err) {
          const isError = err instanceof Error;
          // Cast to the superset of fields an AxiosError exposes so we can log
          // HTTP status and network-level error codes without using `any`.
          const httpErr = err as {
            code?: string;
            response?: { status?: number; statusText?: string };
          };
          logger.error(
            'Enrichment fetch failed — baseline game-update will still be emitted',
            {
              gamePk: enrichmentState.gamePk,
              name: isError ? err.name : 'Unknown',
              message: isError ? err.message : String(err),
              code: httpErr.code,
              status: httpErr.response?.status,
              statusText: httpErr.response?.statusText,
            }
          );
        }

        // Hold the linescore snapshot stale when diffPatch returned empty so
        // hasLinescoreDelta returns true next tick and the scheduler retries
        // without waiting for a further linescore change.
        if (!retryPending && currentLinescore !== null) {
          enrichmentState.lastLinescoreSnapshot = currentLinescore;
        }
      } else {
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
    }

    // ── 6. Final game handling ─────────────────────────────────────────────────
    // Runs only once: enrichmentState is set to null at the end of this block,
    // preventing re-execution on subsequent idle-poll ticks.
    if (update?.trackingMode === 'final' && enrichmentState !== null) {
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
            { away: update.score.away, home: update.score.home },
            update.inning.number,
            update.isExtraInnings,
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

      // Tear down enrichment state after the final game is fully processed.
      enrichmentState = null;
      logger.info('Enrichment state torn down after final game', {
        gamePk: gamePkForFinal,
      });
    }

    // ── 7. Schedule next tick ─────────────────────────────────────────────────
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
          return (
            (update.inningBreakLength ?? 120) + CONFIG.BETWEEN_INNINGS_BUFFER_S
          );
        case 'batting':
          return CONFIG.BATTING_POLL_INTERVAL;
        default:
          return CONFIG.ACTIVE_POLL_INTERVAL;
      }
    };

    const intervalSec = getNextIntervalSec(update);
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
