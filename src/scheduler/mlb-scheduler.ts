import { Server as SocketIOServer } from 'socket.io';
import { CONFIG } from '../config/env.ts';
import { fetchSchedule } from './poller.ts';
import { parseGameUpdate } from './parser.ts';
import { logUpdate } from './logger.ts';
import type { GameUpdate } from './parser.ts';
import { logger } from '../config/logger.ts';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fetch and parse the current game state, with retry logic. */
async function fetchUpdate(): Promise<GameUpdate | null> {
  let attempt = 0;
  while (attempt <= CONFIG.MAX_RETRIES) {
    try {
      const schedule = await fetchSchedule();
      return parseGameUpdate(schedule, CONFIG.TEAM_ID);
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
  let lastPitcherId: number | null = null;

  const loop = async () => {
    if (stopped) return;

    const rawUpdate = await fetchUpdate();

    if (stopped) return;

    // Detect pitching changes by comparing the incoming pitcher ID to the last known one.
    // The parser always sets pitchingChange: false; we override it here if a change occurred.
    let update = rawUpdate;
    if (update?.currentPitcher) {
      const pitcher = update.currentPitcher;
      const pitchingChange =
        lastPitcherId !== null && pitcher.id !== lastPitcherId;
      if (pitchingChange) {
        update = { ...update, pitchingChange: true };
      }
      lastPitcherId = pitcher.id;
    }

    // Transition-only modes: emit once when entering, then stay quiet until the mode changes.
    // 'outs' and 'runs' emit every tick because their values change continuously.
    const isTransitionMode = (mode: GameUpdate['trackingMode']) =>
      mode === 'batting' || mode === 'between-innings' || mode === 'final';

    const shouldEmit =
      update !== null &&
      (!isTransitionMode(update.trackingMode) ||
        lastTrackingMode !== update.trackingMode);

    if (shouldEmit && update !== null) {
      logUpdate(update);
      io.emit('game-update', update);
      lastEmittedUpdate = update;
    }

    lastTrackingMode = update?.trackingMode ?? null;

    const intervalSec =
      update === null
        ? CONFIG.IDLE_POLL_INTERVAL
        : update.isDelayed
          ? CONFIG.IDLE_POLL_INTERVAL
          : update.trackingMode === 'final'
            ? CONFIG.IDLE_POLL_INTERVAL
            : update.trackingMode === 'between-innings'
              ? (update.inningBreakLength ?? 120) +
                CONFIG.BETWEEN_INNINGS_BUFFER_S
              : update.trackingMode === 'batting'
                ? CONFIG.BATTING_POLL_INTERVAL
                : CONFIG.ACTIVE_POLL_INTERVAL;

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
