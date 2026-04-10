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

/** One tick – fetch, parse, emit. Returns the update (or null) so callers can determine game state. */
async function tick(io: SocketIOServer): Promise<GameUpdate | null> {
  let attempt = 0;
  while (attempt <= CONFIG.MAX_RETRIES) {
    try {
      const schedule = await fetchSchedule();
      const update = parseGameUpdate(schedule, CONFIG.TEAM_ID);
      if (update) {
        logUpdate(update);
        io.emit('game-update', update);
      }
      return update;
    } catch (err) {
      attempt++;
      const backoff = CONFIG.RETRY_BACKOFF_MS * 2 ** (attempt - 1);
      logger.error(
        `Tick failed (attempt ${attempt}/${CONFIG.MAX_RETRIES}) – %s`,
        err,
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
}

export function startScheduler(io: SocketIOServer): Scheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const loop = async () => {
    if (stopped) return;

    const update = await tick(io);

    if (stopped) return;

    const intervalSec = update
      ? CONFIG.ACTIVE_POLL_INTERVAL
      : CONFIG.IDLE_POLL_INTERVAL;

    logger.info(`Next tick in ${intervalSec}s`);
    timer = setTimeout(() => {
      loop().catch((err) =>
        logger.error('Scheduler loop error: %s', err),
      );
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
  };
}
