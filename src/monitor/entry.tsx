import { render } from 'ink';
import { App } from './app.tsx';

// Clear the visible screen and scrollback buffer before Ink takes over, so
// there is no prior terminal history visible above the dashboard.
process.stdout.write('\x1b[2J\x1b[3J\x1b[H');

// Silence console output: in Ink's alternate-screen mode any write to stdout
// or stderr corrupts the rendered layout. Warnings from formatters (e.g.
// abbreviateCall) should not bleed into the UI.
console.warn = () => undefined;
console.error = () => undefined;

render(<App />, { alternateScreen: true });
