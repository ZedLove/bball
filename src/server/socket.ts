import { Server as SocketIOServer } from "socket.io";
import type { Server as HttpServer } from "http";
import { logger } from "../config/logger.ts";
import { CONFIG } from "../config/env.ts";
import type { Scheduler } from "../scheduler/mlb-scheduler.ts";

export function attachSocketServer(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: CONFIG.CORS_ORIGIN,
      methods: ["GET", "POST"],
    },
  });
  return io;
}

/**
 * Registers per-connection handlers. Called after the scheduler is started
 * so the scheduler reference is available for replaying the last game state.
 */
export function registerConnectionHandlers(io: SocketIOServer, scheduler: Scheduler): void {
  io.on("connection", (socket) => {
    logger.info("🔌  Client connected: %s", socket.id);

    // Replay the last known game state so clients that connect mid-game
    // don't wait for the next transition to receive an update.
    const lastUpdate = scheduler.getLastUpdate();
    if (lastUpdate) {
      socket.emit("game-update", lastUpdate);
    }

    socket.on("disconnect", () => {
      logger.info("❎  Client disconnected: %s", socket.id);
    });
  });
}