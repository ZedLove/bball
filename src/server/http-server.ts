import http from "http";
import { createApp } from "./app.ts";
import { attachSocketServer } from "./socket.ts";

export function createHttpServer() {
  const app = createApp();          // Express instance
  const httpServer = http.createServer(app);
  const io = attachSocketServer(httpServer);
  return { httpServer, io };
}