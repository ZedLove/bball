import cron from 'node-cron';
import { Server as SocketIOServer } from 'socket.io';
import { CONFIG } from '../config/env.ts';
import { fetchSchedule } from './poller.ts';
import { parseGameUpdate } from './parser.ts';
import { logUpdate } from './logger.ts';
import type { GameUpdate } from './types.ts';
import { logger } from '../config/logger.ts';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** One tick - fetch, parse, emit. Returns the update (or null) so callers can determine game state. */
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
        `Tick failed (attempt ${attempt}/${CONFIG.MAX_RETRIES}) - %s`,
        err
      );
      if (attempt > CONFIG.MAX_RETRIES) {
        logger.error('Giving up on this tick, will try again later.');
        return null;
      }
      logger.warn(`Back-off ${backoff}ms before retry...`);
      await delay(backoff);
    }
  }
  return null;
}

/** Helper - turn a seconds interval into a node-cron expression */
const secondsToCron = (sec: number) => `*/${sec} * * * * *`;

export function startScheduler(io: SocketIOServer): void {
  let currentJob: ReturnType<typeof cron.schedule> | null = null;

  const scheduleNext = async () => {
    if (currentJob) {
      currentJob.stop();
      currentJob = null;
    }

    const update = await tick(io);

    const intervalSec = update
      ? CONFIG.ACTIVE_POLL_INTERVAL
      : CONFIG.IDLE_POLL_INTERVAL;
    const cronExp = secondsToCron(intervalSec);

    currentJob = cron.schedule(cronExp, scheduleNext);

    logger.info(
      `Next tick scheduled in ${intervalSec}s (cron: "${cronExp}")`
    );
  };

  // Kick off the first execution right away (fire-and-forget so startup isn't blocked)
  scheduleNext().catch((err) => {
    logger.error('Scheduler initial tick failed: %s', err);
  });
}
