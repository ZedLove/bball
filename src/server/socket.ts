import { Server as SocketIOServer } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { logger } from '../config/logger.ts';
import { CONFIG } from '../config/env.ts';
import type { Scheduler } from '../scheduler/mlb-scheduler.ts';
import { SOCKET_EVENTS } from './socket-events.ts';

/**
 * Builds the Socket.IO CORS origin config.
 *
 * When the admin UI is enabled and CORS_ORIGIN is not a wildcard, we expand the
 * allowlist to include the admin.socket.io panel origin. In development we also
 * include common local dev addresses. A wildcard CORS_ORIGIN is incompatible with
 * `credentials: true`, so in that case we keep the plain string value and skip
 * the expanded allowlist.
 *
 * Localhost origins are intentionally excluded outside development: because the
 * `Origin` header is client-controlled, adding `http://localhost:*` to a
 * production allowlist would let any user's browser make credentialed requests
 * from their own localhost, which is a significant security footgun.
 *
 * Exported for unit testing.
 */
export function buildCorsOrigin(
  corsOrigin: string,
  adminEnabled: boolean,
  isDevelopment: boolean
): string | string[] {
  if (!adminEnabled || corsOrigin === '*') {
    return corsOrigin;
  }
  const origins = [corsOrigin, 'https://admin.socket.io'];
  if (isDevelopment) {
    origins.push(
      'http://localhost:3000',
      'http://localhost:4000',
      'http://127.0.0.1:4000'
    );
  }
  return origins;
}

export function attachSocketServer(httpServer: HttpServer): SocketIOServer {
  const adminEnabled = CONFIG.ENABLE_ADMIN_UI;
  const isDevelopment = process.env.NODE_ENV === 'development';
  const useExpandedOrigins = adminEnabled && CONFIG.CORS_ORIGIN !== '*';

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: buildCorsOrigin(CONFIG.CORS_ORIGIN, adminEnabled, isDevelopment),
      methods: ['GET', 'POST'],
      credentials: useExpandedOrigins,
    },
    path: '/socket.io',
  });

  if (adminEnabled) {
    const adminUsername = process.env.SOCKET_IO_ADMIN_USERNAME;
    const adminPassword = process.env.SOCKET_IO_ADMIN_PASSWORD;

    if (!isDevelopment && (!adminUsername || !adminPassword)) {
      logger.error(
        'ENABLE_ADMIN_UI is set outside development, but SOCKET_IO_ADMIN_USERNAME and SOCKET_IO_ADMIN_PASSWORD are not both configured; refusing to enable the socket.io admin UI'
      );
    } else {
      void import('@socket.io/admin-ui')
        .then(({ instrument }) => {
          if (isDevelopment) {
            instrument(io, { auth: false });
          } else {
            instrument(io, {
              auth: {
                type: 'basic',
                username: adminUsername as string,
                password: adminPassword as string,
              },
            });
          }
          logger.info('socket.io admin UI enabled');
        })
        .catch((err: unknown) => {
          logger.error('Failed to enable socket.io admin UI: %o', err);
        });
    }
  }

  return io;
}

/**
 * Registers per-connection handlers. Called after the scheduler is started
 * so the scheduler reference is available for replaying the last game state.
 */
export function registerConnectionHandlers(
  io: SocketIOServer,
  scheduler: Scheduler
): void {
  io.on('connection', (socket) => {
    logger.info('🔌  Client connected: %s', socket.id);

    // Replay the last known game state so clients that connect mid-game
    // don't wait for the next transition to receive an update.
    const lastUpdate = scheduler.getLastUpdate();
    if (lastUpdate) {
      socket.emit(SOCKET_EVENTS.GAME_UPDATE, lastUpdate);
    }

    socket.on('disconnect', () => {
      logger.info('❎  Client disconnected: %s', socket.id);
    });
  });
}
