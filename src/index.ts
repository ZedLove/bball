import { CONFIG } from "./config/env.ts";
import { createHttpServer } from "./server/http-server.ts";
import { startScheduler } from "./scheduler/mlb-scheduler.ts";
import { logger } from "./config/logger.ts";

async function main() {
  const { httpServer, io } = createHttpServer();

  const scheduler = startScheduler(io);
  logger.info("Scheduler started");

  httpServer.listen(CONFIG.PORT, () => {
    logger.info("Server listening on http://localhost:%d", CONFIG.PORT);
  });

  const shutdown = () => {
    logger.info("Shutting down...");
    scheduler.stop();
    io.close();
    httpServer.close(() => {
      logger.info("Server closed");
      process.exit(0);
    });
    // Force exit after 5s if connections hang
    setTimeout(() => process.exit(1), 5_000).unref();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  logger.error("Uncaught error during startup: %s", err);
  process.exit(1);
});