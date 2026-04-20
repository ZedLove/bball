import { Server as SocketIOServer } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { logger } from '../config/logger.ts';
import { CONFIG } from '../config/env.ts';
import type { Scheduler } from '../scheduler/mlb-scheduler.ts';
import { SOCKET_EVENTS } from './socket-events.ts';

/**
 * Builds the Socket.IO CORS origin config.
 *
 * When the admin UI is enabled, we expand the allowlist to include the
 * admin.socket.io panel origin. In development we also include common local dev
 * addresses, derived from the server port so the list stays accurate when PORT
 * differs from the default.
 *
 * The admin UI browser client always sends `withCredentials: true`, so the server
 * must respond with a specific origin rather than a wildcard. When CORS_ORIGIN is
 * `'*'` and admin is enabled in development, we replace the wildcard with an
 * explicit allowlist. Outside development the admin UI refuses to mount when
 * CORS_ORIGIN is a wildcard (handled in attachSocketServer).
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
  isDevelopment: boolean,
  serverPort: number
): string | string[] {
  if (!adminEnabled) {
    return corsOrigin;
  }
  // Dev-only localhost origins, derived from the configured port.
  const devOrigins = isDevelopment
    ? [
        'http://localhost:3000',
        `http://localhost:${serverPort}`,
        `http://127.0.0.1:${serverPort}`,
      ]
    : [];
  if (corsOrigin === '*') {
    // The admin UI client sends withCredentials: true, incompatible with a wildcard
    // origin. In dev mode, swap to an explicit allowlist. Outside dev, the admin UI
    // is blocked at the mount stage (attachSocketServer logs an error and skips it).
    if (!isDevelopment) {
      return corsOrigin;
    }
    return ['https://admin.socket.io', ...devOrigins];
  }
  return [corsOrigin, 'https://admin.socket.io', ...devOrigins];
}

export function attachSocketServer(httpServer: HttpServer): SocketIOServer {
  const adminEnabled = CONFIG.ENABLE_ADMIN_UI;
  const isDevelopment = process.env.NODE_ENV === 'development';
  const corsOriginConfig = buildCorsOrigin(
    CONFIG.CORS_ORIGIN,
    adminEnabled,
    isDevelopment,
    CONFIG.PORT
  );
  const useExpandedOrigins = Array.isArray(corsOriginConfig);

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: corsOriginConfig,
      methods: ['GET', 'POST'],
      credentials: useExpandedOrigins,
    },
    path: '/socket.io',
  });

  if (adminEnabled) {
    const adminUsername = process.env.SOCKET_IO_ADMIN_USERNAME;
    const adminPassword = process.env.SOCKET_IO_ADMIN_PASSWORD;

    if (!isDevelopment && CONFIG.CORS_ORIGIN === '*') {
      logger.error(
        'ENABLE_ADMIN_UI is set outside development with a wildcard CORS_ORIGIN; the admin UI uses credentialed requests which are incompatible with a wildcard origin. Set CORS_ORIGIN to your server URL to enable the admin UI.'
      );
    } else if (!isDevelopment && (!adminUsername || !adminPassword)) {
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
