/**
 * Zenburn-inspired dark mode color palette.
 * All monitor components reference this constant — never hard-code colors.
 */
export const THEME = {
  // Backgrounds
  bg: '#3f3f3f',
  bgHeader: '#2a2a2a',
  bgPanel: '#3f3f3f',

  // Foreground
  fg: '#dcdccc',
  fgDim: '#7f7f7f',
  fgBright: '#ffffff',

  // Status
  connected: '#7f9f7f',
  disconnected: '#cc9393',

  // Borders
  border: '#636363',
  borderAccent: '#8cd0d3',

  // Event category colors
  scoring: '#f0dfaf',
  homeRun: '#f0dfaf',
  strikeout: '#cc9393',
  substitution: '#94bff3',
  baserunning: '#9faf9f',
  neutral: '#dcdccc',

  // Strike zone pitch symbols
  zoneStrike: '#cc9393',
  zoneBall: '#7f9f7f',
  zoneFoul: '#d0bf8f',
  zoneInPlay: '#94bff3',
  zoneBorder: '#636363',

  // Base diamond
  baseEmpty: '#7f7f7f',
  baseOccupied: '#f0dfaf',

  // Keyboard hint highlights
  keyActive: '#8cd0d3',
  keyInactive: '#636363',
} as const;
