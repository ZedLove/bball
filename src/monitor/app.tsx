import { useEffect, useRef } from 'react';
import { Box, Text, useApp, useInput, useWindowSize } from 'ink';
import type { PitchEvent } from '../server/socket-events.ts';
import { useDashboardState } from './hooks/use-dashboard-state.ts';
import { useSocket } from './hooks/use-socket.ts';
import { THEME } from './theme.ts';
import { StatusBar } from './components/StatusBar.tsx';
import { Header } from './components/Header.tsx';
import { EventsPanel } from './components/EventsPanel.tsx';
import { GameSummaryPanel } from './components/GameSummaryPanel.tsx';
import { AtBatPanel } from './components/AtBatPanel.tsx';
import { StrikeZone } from './components/StrikeZone.tsx';
import { BaseDiamond } from './components/BaseDiamond.tsx';
import { OnDeckPanel } from './components/OnDeckPanel.tsx';

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

  useSocket(dispatch);

  const { columns, rows } = useWindowSize();

  // When the terminal is resized, clear the scrollback buffer so mis-rendered
  // frames from the narrow phase don't accumulate above the current view.
  // This matters even with alternateScreen:true because some terminals (e.g.
  // iTerm2 with "Scroll alternate screen" enabled) maintain a scrollback in
  // the alternate screen buffer.
  useEffect(() => {
    process.stdout.write('\x1b[3J');
  }, [columns, rows]);

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
      {state.summary !== null ? (
        <GameSummaryPanel
          summary={state.summary}
          teams={state.lastUpdate?.teams ?? null}
        />
      ) : (
        <EventsPanel
          lastUpdate={state.lastUpdate}
          events={state.events}
          filter={state.filter}
        />
      )}
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
