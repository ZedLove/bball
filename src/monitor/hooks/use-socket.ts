import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_EVENTS } from '../../server/socket-events.ts';
import type {
  GameEventsPayload,
  GameSummary,
} from '../../server/socket-events.ts';
import type { GameUpdate } from '../../scheduler/parser.ts';
import type { DashboardDispatch } from '../types.ts';

const SOCKET_URL = process.env['SOCKET_URL'] ?? 'http://localhost:4000';

/**
 * Manages the socket.io-client lifecycle. Connects to the backend on mount,
 * dispatches DashboardActions on every socket event, and disconnects on
 * unmount. Idiomatic React: socket lifetime is tied to component lifetime.
 */
export function useSocket(dispatch: DashboardDispatch): void {
  useEffect(() => {
    const socket = io(SOCKET_URL);

    socket.on('connect', () => {
      dispatch({ type: 'connected' });
    });

    socket.on('disconnect', () => {
      dispatch({ type: 'disconnected' });
    });

    socket.on(SOCKET_EVENTS.GAME_UPDATE, (payload: GameUpdate) => {
      dispatch({ type: 'game-update', payload });
    });

    socket.on(SOCKET_EVENTS.GAME_EVENTS, (payload: GameEventsPayload) => {
      dispatch({ type: 'game-events', payload });
    });

    socket.on(SOCKET_EVENTS.GAME_SUMMARY, (payload: GameSummary) => {
      dispatch({ type: 'game-summary', payload });
    });

    return () => {
      socket.disconnect();
    };
  }, [dispatch]);
}
