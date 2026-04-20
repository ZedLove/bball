---
description: "Use when authoring or updating JSON test fixtures in `src/scheduler/__fixtures__/`. Covers fixture structure, realism, and integration with test helpers."
applyTo: "**/__fixtures__/**"
---

# JSON Fixture Guidelines

Test fixtures are the single source of truth for API response shapes and sample data flow through parsers. Every fixture must be realistic and deliberately structured.

## Fixture Files

Fixtures live in `src/scheduler/__fixtures__/` and are imported with import assertions:

```typescript
import fixture from './__fixtures__/game-feed.json' with { type: 'json' };
```

Never import fixtures without the `with { type: 'json' }` syntax.

## Realism and Completeness

- **Real data preferred**: Pull from a live MLB game feed via `GET /api/v1.1/game/{gamePk}/feed/live` and extract 2–3 representative plays or at-bats.
- **Complete fields**: Include all fields present in the actual API response, not a minimal subset. If the API includes `pitchData.breaks.spinRate`, it must be in the fixture.
- **Null coalescing**: Absent optional fields should be `null`, not omitted (matching the codebase convention).
- **Document the source**: Add a comment at the top of the fixture file with the `gamePk`, date, and which plays/events were extracted.

## Fixture Structure

**game-feed.json** (static snapshot of completed game):
```json
{
  "liveData": {
    "plays": {
      "allPlays": [
        {
          "playEvents": [
            { "type": "pitch", "pitchData": {...}, "details": {...}, ... },
            { "type": "pitch", "isInPlay": true, "hitData": {...}, ... }
          ]
        }
      ]
    }
  }
}
```

**game-feed-live.json** (in-progress game, includes `currentPlay`):
```json
{
  "liveData": {
    "plays": {
      "currentPlay": { "playEvents": [{...}] },
      "allPlays": [...]
    }
  }
}
```

## Using Fixtures in Tests

Fixtures are wrapped by test helpers to scope overrides:

```typescript
function withCurrentPlay(overrides: Partial<...>): GameFeedLiveResponse {
  return { liveData: { plays: { currentPlay: { ...fixture.liveData.plays.currentPlay, ...overrides } } } };
}
```

The helper pattern allows tests to mutate a specific boundary (e.g., `currentPlay`) without rewriting the entire fixture. This keeps tests focused and fixtures reusable.

## Updates on API Changes

When the API adds new fields (e.g., new tracking data on `pitchData`):
1. Fetch a fresh game feed with the updated schema.
2. Extract 2–3 representative plays.
3. Replace the entire `allPlays` section (or `currentPlay` if updating the live feed).
4. Verify all new fields are present in the fixture.
5. Commit fixture changes separately from code changes: `test(fixtures): enrich fixture with [field/data]`.

## Coverage Expectations

- Every code path in a parser that reads fixture fields must have corresponding assertions in the test.
- If a fixture field is not asserted, it is dead code — remove it from the fixture or add a test that uses it.
- Fixture updates that add fields require corresponding parser updates and tests.
