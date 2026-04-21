import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      reporter: ['text', 'html', 'json'],
      // Exclude dev-only tooling (simulator, CLI) — it is not production code
      // and its contract tests live in event-handlers.test.ts.
      // Exclude dev monitor — internal dev tool, not subject to coverage thresholds.
      exclude: ['src/dev/**', 'src/monitor/**'],
      thresholds: {
        lines: 93,
        functions: 91,
        branches: 86,
        statements: 93,
      },
    },
    include: ['**/*.test.ts', '**/*.test.tsx'],
  },
});
