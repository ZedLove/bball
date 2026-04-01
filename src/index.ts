import { CONFIG } from "./config/env.ts";
import { createHttpServer } from "./server/http-server.ts";
import { startScheduler } from "./scheduler/mlb-scheduler.ts";
import { logger } from "./config/logger.ts";

async function main() {
  const { httpServer, io } = createHttpServer();

  startScheduler(io);
  logger.info("Scheduler started");

  httpServer.listen(CONFIG.PORT, () => {
    logger.info("Server listening on http://localhost:%d", CONFIG.PORT);
  });
}

// Graceful shutdown (optional but recommended)
process.on("SIGINT", () => {
  logger.info("🛑  Received SIGINT – shutting down");
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("🛑  Received SIGTERM – shutting down");
  process.exit(0);
});

main().catch((err) => {
  logger.error("❌  Uncaught error during startup:", err);
  process.exit(1);
});