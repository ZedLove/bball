import { CONFIG } from './config/env.ts';
import { createHttpServer } from './server/http-server.ts';
import { startScheduler } from './scheduler/mlb-scheduler.ts';
import { registerConnectionHandlers } from './server/socket.ts';
import { startDevSimulator } from './dev/dev-simulator.ts';
import { logger } from './config/logger.ts';

async function main() {
  const { httpServer, io } = createHttpServer();

  let stopScheduler: (() => void) | null = null;

  if (CONFIG.DEV_MODE) {
    logger.info('🎮  Dev mode – real polling disabled, interactive simulator active');
    startDevSimulator(io);
  } else {
    const scheduler = startScheduler(io);
    logger.info('Scheduler started');
    registerConnectionHandlers(io, scheduler);
    stopScheduler = () => scheduler.stop();
  }

  httpServer.listen(CONFIG.PORT, () => {
    logger.info('Server listening on http://localhost:%d', CONFIG.PORT);
  });

  const shutdown = () => {
    logger.info('Shutting down...');
    stopScheduler?.();
    io.close();
    httpServer.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
    // Force exit after 5s if connections hang
    setTimeout(() => process.exit(1), 5_000).unref();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error('Uncaught error during startup: %s', err);
  process.exit(1);
});
