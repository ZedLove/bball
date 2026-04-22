import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from 'http';
import type { Server as HttpServer } from 'http';
import type { AddressInfo } from 'net';
import { io as ioc } from 'socket.io-client';
import type { Server as SocketIOServer } from 'socket.io';

// ── Hoisted mock state (must be declared before vi.mock factories run) ────────

const mockConfig = vi.hoisted(
  (): { CORS_ORIGIN: string; ENABLE_ADMIN_UI: boolean; PORT: number } => ({
    CORS_ORIGIN: '*',
    ENABLE_ADMIN_UI: false,
    PORT: 4000,
  })
);

const mockInstrument = vi.hoisted(() => vi.fn());

// ── Module mocks (hoisted before imports) ────────────────────────────────────

vi.mock('../config/env.ts', () => ({ CONFIG: mockConfig }));

vi.mock('../config/logger.ts', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@socket.io/admin-ui', () => ({ instrument: mockInstrument }));

import {
  attachSocketServer,
  registerConnectionHandlers,
  buildCorsOrigin,
} from './socket.ts';
import { logger } from '../config/logger.ts';
import { SOCKET_EVENTS } from './socket-events.ts';
import type { GameUpdate } from '../scheduler/parser.ts';
import type { Scheduler } from '../scheduler/mlb-scheduler.ts';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAMPLE_UPDATE: GameUpdate = {
  gamePk: 823963,
  gameStatus: 'In Progress',
  teams: {
    away: { id: 119, name: 'Los Angeles Dodgers', abbreviation: 'LAD' },
    home: { id: 121, name: 'New York Mets', abbreviation: 'NYM' },
  },
  score: { away: 2, home: 3 },
  inning: { number: 7, half: 'Top', ordinal: '7th' },
  outs: 1,
  defendingTeam: 'NYM',
  battingTeam: 'LAD',
  isDelayed: false,
  delayDescription: null,
  isExtraInnings: false,
  scheduledInnings: 9,
  trackingMode: 'outs',
  outsRemaining: 2,
  totalOutsRemaining: 8,
  runsNeeded: null,
  currentPitcher: {
    id: 605113,
    fullName: 'Kodai Senga',
    pitchesThrown: 0,
    strikes: 0,
    balls: 0,
    usage: [],
  },
  upcomingPitcher: null,
  inningBreakLength: null,
  atBat: null,
  pitchHistory: [],
  trackedTeamAbbr: 'NYM',
};

// ---------------------------------------------------------------------------
// Test server lifecycle helpers
// ---------------------------------------------------------------------------

interface TestServer {
  io: SocketIOServer;
  httpServer: HttpServer;
  port: number;
}

async function createTestServer(scheduler: Scheduler): Promise<TestServer> {
  const httpServer = createServer();
  const io = attachSocketServer(httpServer);
  registerConnectionHandlers(io, scheduler);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as AddressInfo).port;
  return { io, httpServer, port };
}

async function destroyTestServer({
  io,
  httpServer,
}: TestServer): Promise<void> {
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
}

/** Waits `ms` milliseconds to allow any unexpected async emissions to arrive. */
function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('registerConnectionHandlers', () => {
  it('replays last game-update to a newly connected client', async () => {
    const scheduler: Scheduler = {
      stop: vi.fn(),
      getLastUpdate: vi.fn(() => SAMPLE_UPDATE),
    };

    const server = await createTestServer(scheduler);

    // Register the game-update listener before connecting to avoid a race
    // where the server emits during the connection handler before the client
    // has set up its listener.
    const client = ioc(`http://localhost:${server.port}`, {
      autoConnect: false,
    });
    const receivedPromise = new Promise<GameUpdate>((resolve) => {
      client.once(SOCKET_EVENTS.GAME_UPDATE, (data: GameUpdate) =>
        resolve(data)
      );
    });
    client.connect();

    expect(await receivedPromise).toEqual(SAMPLE_UPDATE);

    client.disconnect();
    await destroyTestServer(server);
  });

  it('emits no game-update when scheduler has no last update', async () => {
    const scheduler: Scheduler = {
      stop: vi.fn(),
      getLastUpdate: vi.fn(() => null),
    };

    const server = await createTestServer(scheduler);
    const received: unknown[] = [];

    const client = ioc(`http://localhost:${server.port}`);
    client.on(SOCKET_EVENTS.GAME_UPDATE, (data: unknown) =>
      received.push(data)
    );

    await new Promise<void>((resolve) => client.once('connect', resolve));
    await waitMs(50);

    expect(received).toHaveLength(0);

    client.disconnect();
    await destroyTestServer(server);
  });

  it('does not replay game-events to a newly connected client', async () => {
    const scheduler: Scheduler = {
      stop: vi.fn(),
      getLastUpdate: vi.fn(() => SAMPLE_UPDATE),
    };

    const server = await createTestServer(scheduler);
    const gameEventsReceived: unknown[] = [];

    const client = ioc(`http://localhost:${server.port}`);
    client.on(SOCKET_EVENTS.GAME_EVENTS, (data: unknown) =>
      gameEventsReceived.push(data)
    );

    await new Promise<void>((resolve) => client.once('connect', resolve));
    await waitMs(50);

    expect(gameEventsReceived).toHaveLength(0);

    client.disconnect();
    await destroyTestServer(server);
  });

  it('does not replay game-summary to a newly connected client', async () => {
    const scheduler: Scheduler = {
      stop: vi.fn(),
      getLastUpdate: vi.fn(() => SAMPLE_UPDATE),
    };

    const server = await createTestServer(scheduler);
    const gameSummaryReceived: unknown[] = [];

    const client = ioc(`http://localhost:${server.port}`);
    client.on(SOCKET_EVENTS.GAME_SUMMARY, (data: unknown) =>
      gameSummaryReceived.push(data)
    );

    await new Promise<void>((resolve) => client.once('connect', resolve));
    await waitMs(50);

    expect(gameSummaryReceived).toHaveLength(0);

    client.disconnect();
    await destroyTestServer(server);
  });
});

// ---------------------------------------------------------------------------
// buildCorsOrigin unit tests
// ---------------------------------------------------------------------------

describe('buildCorsOrigin', () => {
  it('returns the origin string unchanged when admin UI is disabled', () => {
    expect(buildCorsOrigin('http://example.com', false, true, 4000)).toBe(
      'http://example.com'
    );
  });

  it('expands to an allowlist of admin+localhost origins when admin UI is enabled with wildcard CORS in development', () => {
    expect(buildCorsOrigin('*', true, true, 4000)).toEqual([
      'https://admin.socket.io',
      'http://localhost:3000',
      'http://localhost:4000',
      'http://127.0.0.1:4000',
    ]);
  });

  it('returns "*" unchanged when admin UI is enabled with wildcard CORS outside development', () => {
    expect(buildCorsOrigin('*', true, false, 4000)).toBe('*');
  });

  it('expands to an allowlist including localhost origins when admin UI is enabled in development', () => {
    expect(buildCorsOrigin('http://example.com', true, true, 4000)).toEqual([
      'http://example.com',
      'https://admin.socket.io',
      'http://localhost:3000',
      'http://localhost:4000',
      'http://127.0.0.1:4000',
    ]);
  });

  it('excludes localhost origins when admin UI is enabled outside development', () => {
    expect(buildCorsOrigin('http://example.com', true, false, 4000)).toEqual([
      'http://example.com',
      'https://admin.socket.io',
    ]);
  });

  it('derives localhost origins from the configured server port', () => {
    expect(buildCorsOrigin('http://example.com', true, true, 8080)).toEqual([
      'http://example.com',
      'https://admin.socket.io',
      'http://localhost:3000',
      'http://localhost:8080',
      'http://127.0.0.1:8080',
    ]);
  });
});

// ---------------------------------------------------------------------------
// attachSocketServer — admin UI mounting
// ---------------------------------------------------------------------------

describe('attachSocketServer admin UI', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    mockConfig.ENABLE_ADMIN_UI = false;
    mockConfig.CORS_ORIGIN = '*';
    process.env.NODE_ENV = 'development';
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    delete process.env.SOCKET_IO_ADMIN_USERNAME;
    delete process.env.SOCKET_IO_ADMIN_PASSWORD;
  });

  it('does not mount admin UI when ENABLE_ADMIN_UI is false', async () => {
    const httpServer = createServer();
    const io = attachSocketServer(httpServer);

    await waitMs(0);

    expect(mockInstrument).not.toHaveBeenCalled();

    io.close();
    httpServer.close();
  });

  it('mounts admin UI and logs info when ENABLE_ADMIN_UI is true', async () => {
    mockConfig.ENABLE_ADMIN_UI = true;

    const httpServer = createServer();
    const io = attachSocketServer(httpServer);

    await waitMs(0);

    expect(mockInstrument).toHaveBeenCalledWith(io, { auth: false });
    expect(logger.info).toHaveBeenCalledWith('socket.io admin UI enabled');

    io.close();
    httpServer.close();
  });

  it('does not log a warning when ENABLE_ADMIN_UI is true in development', async () => {
    mockConfig.ENABLE_ADMIN_UI = true;
    process.env.NODE_ENV = 'development';

    const httpServer = createServer();
    const io = attachSocketServer(httpServer);

    await waitMs(0);

    expect(logger.warn).not.toHaveBeenCalled();

    io.close();
    httpServer.close();
  });

  it('logs an error and does not mount when ENABLE_ADMIN_UI is set outside development without credentials', () => {
    mockConfig.ENABLE_ADMIN_UI = true;
    mockConfig.CORS_ORIGIN = 'http://example.com';
    process.env.NODE_ENV = 'production';

    const httpServer = createServer();
    const io = attachSocketServer(httpServer);

    expect(logger.error).toHaveBeenCalledWith(
      'ENABLE_ADMIN_UI is set outside development, but SOCKET_IO_ADMIN_USERNAME and SOCKET_IO_ADMIN_PASSWORD are not both configured; refusing to enable the socket.io admin UI'
    );
    expect(mockInstrument).not.toHaveBeenCalled();

    io.close();
    httpServer.close();
  });

  it('logs an error and does not mount when ENABLE_ADMIN_UI is set outside development with wildcard CORS_ORIGIN', () => {
    mockConfig.ENABLE_ADMIN_UI = true;
    mockConfig.CORS_ORIGIN = '*';
    process.env.NODE_ENV = 'production';

    const httpServer = createServer();
    const io = attachSocketServer(httpServer);

    expect(logger.error).toHaveBeenCalledWith(
      'ENABLE_ADMIN_UI is set outside development with a wildcard CORS_ORIGIN; the admin UI uses credentialed requests which are incompatible with a wildcard origin. Set CORS_ORIGIN to your server URL to enable the admin UI.'
    );
    expect(mockInstrument).not.toHaveBeenCalled();

    io.close();
    httpServer.close();
  });

  it('mounts with basic auth when ENABLE_ADMIN_UI is set outside development with credentials', async () => {
    mockConfig.ENABLE_ADMIN_UI = true;
    mockConfig.CORS_ORIGIN = 'http://example.com';
    process.env.NODE_ENV = 'production';
    process.env.SOCKET_IO_ADMIN_USERNAME = 'admin';
    process.env.SOCKET_IO_ADMIN_PASSWORD = 'secret';

    const httpServer = createServer();
    const io = attachSocketServer(httpServer);

    await waitMs(0);

    expect(mockInstrument).toHaveBeenCalledWith(io, {
      auth: { type: 'basic', username: 'admin', password: 'secret' },
    });
    expect(logger.info).toHaveBeenCalledWith('socket.io admin UI enabled');

    io.close();
    httpServer.close();
  });

  it('catches and logs an error when the admin UI setup throws', async () => {
    mockConfig.ENABLE_ADMIN_UI = true;
    mockInstrument.mockImplementationOnce(() => {
      throw new Error('setup error');
    });

    const httpServer = createServer();
    const io = attachSocketServer(httpServer);

    await waitMs(0);

    expect(logger.error).toHaveBeenCalledWith(
      'Failed to enable socket.io admin UI: %o',
      expect.any(Error)
    );

    io.close();
    httpServer.close();
  });
});
