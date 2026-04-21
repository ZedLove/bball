import { useEffect, useRef } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { io } from 'socket.io-client';
import { SOCKET_EVENTS } from '../server/socket-events.ts';
import type {
  GameEventsPayload,
  GameSummary,
  PitchEvent,
} from '../server/socket-events.ts';
import type { GameUpdate } from '../scheduler/parser.ts';
import { useDashboardState } from './hooks/use-dashboard-state.ts';
import { THEME } from './theme.ts';
import { StatusBar } from './components/StatusBar.tsx';
import { Header } from './components/Header.tsx';
import { EventsPanel } from './components/EventsPanel.tsx';
import { AtBatPanel } from './components/AtBatPanel.tsx';
import { StrikeZone } from './components/StrikeZone.tsx';
import { BaseDiamond } from './components/BaseDiamond.tsx';
import { OnDeckPanel } from './components/OnDeckPanel.tsx';

const SOCKET_URL = process.env['SOCKET_URL'] ?? 'http://localhost:4000';

export function App() {
  const { exit } = useApp();
  const [state, dispatch] = useDashboardState();

  // Persist the last completed at-bat's pitch sequence for the StrikeZone.
  // When atBat goes null between plate appearances, the zone continues to
  // show the finished PA. It clears automatically when the new batter's
  // first pitch arrives (atBat is non-null with an empty pitchSequence).
  const lastPitchSequenceRef = useRef<PitchEvent[]>([]);

  const atBat = state.lastUpdate?.atBat ?? null;

  // Update the ref whenever the current at-bat has pitches.
  if (atBat !== null && atBat.pitchSequence.length > 0) {
    lastPitchSequenceRef.current = atBat.pitchSequence;
  }

  // Pitches to display in the StrikeZone:
  // – New batter, no pitches yet (empty sequence) → show empty zone (cleared).
  // – Active at-bat with pitches → show current pitches.
  // – Between PAs (atBat null) → persist last completed PA pitches.
  const displayPitchSequence: PitchEvent[] =
    atBat !== null ? atBat.pitchSequence : lastPitchSequenceRef.current;

  // Extract strike zone dimensions from the most recent tracked pitch, if any.
  const lastTracked = [...displayPitchSequence]
    .reverse()
    .find((p) => p.tracking !== null);
  const szTop = lastTracked?.tracking?.strikeZoneTop;
  const szBottom = lastTracked?.tracking?.strikeZoneBottom;

  const showAtBatRow = atBat !== null || displayPitchSequence.length > 0;

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

  useInput((input) => {
    switch (input) {
      case 'q':
        exit();
        break;
      case 'a':
        dispatch({ type: 'set-filter', filter: 'all' });
        break;
      case 's':
        dispatch({ type: 'set-filter', filter: 'scoring' });
        break;
      case 'p':
        dispatch({ type: 'toggle-pitch-display' });
        break;
    }
  });

  return (
    <Box flexDirection="column">
      <StatusBar
        connectedAt={state.connectedAt}
        filter={state.filter}
        pitchDisplay={state.pitchDisplay}
      />
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={THEME.borderAccent}
        paddingX={1}
        marginTop={1}
      >
        <Text color={THEME.borderAccent} bold>
          {'bball dev socket monitor'}
        </Text>
        <Header lastUpdate={state.lastUpdate} />
      </Box>
      <EventsPanel
        lastUpdate={state.lastUpdate}
        events={state.events}
        filter={state.filter}
      />
      {showAtBatRow && (
        <Box flexDirection="row" flexWrap="nowrap" marginTop={1}>
          <AtBatPanel atBat={atBat} pitchDisplay={state.pitchDisplay} />
          <StrikeZone
            pitchSequence={displayPitchSequence}
            mode={state.pitchDisplay}
            szTop={szTop}
            szBottom={szBottom}
          />
          <BaseDiamond
            first={atBat?.first ?? null}
            second={atBat?.second ?? null}
            third={atBat?.third ?? null}
          />
          <OnDeckPanel atBat={atBat} />
        </Box>
      )}
    </Box>
  );
}
