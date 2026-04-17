import type { Server as SocketIOServer } from 'socket.io';
import { createStateStore } from './state/store.ts';
import { createCliInterface } from './cli/interface.ts';
import { logger } from '../config/logger.ts';
import { SOCKET_EVENTS } from '../server/socket-events.ts';

/**
 * Start the interactive dev event simulator.
 *
 * Replaces the real MLB polling scheduler when DEV_MODE=true.
 * Registers Socket.IO connection handlers so newly connected clients receive
 * the last emitted game state immediately, then boots the interactive CLI.
 */
export function startDevSimulator(io: SocketIOServer): void {
  const store = createStateStore();

  io.on('connection', (socket) => {
    logger.info('🔌  Client connected: %s', socket.id);

    const lastUpdate = store.getLastEmitted();
    if (lastUpdate) {
      socket.emit(SOCKET_EVENTS.GAME_UPDATE, lastUpdate);
    }

    socket.on('disconnect', () => {
      logger.info('❎  Client disconnected: %s', socket.id);
    });
  });

  createCliInterface(io, store);
}
