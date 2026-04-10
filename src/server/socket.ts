import { Server as SocketIOServer } from "socket.io";
import type { Server as HttpServer } from "http";
import { logger } from "../config/logger.ts";
import { CONFIG } from "../config/env.ts";

export function attachSocketServer(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: CONFIG.CORS_ORIGIN,
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    logger.info("🔌  Client connected: %s", socket.id);

    // Example of a welcome message – you can also emit cached data here
    // socket.emit("welcome", { msg: "Welcome!" });

    socket.on("disconnect", () => {
      logger.info("❎  Client disconnected: %s", socket.id);
    });
  });

  return io;
}