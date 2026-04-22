import { vi, describe, it, expect, afterEach } from 'vitest';
import axios from 'axios';
import { VenueClient } from './venue-client.ts';
import type { VenueFieldInfo } from './venue-client.ts';

const mockGet = vi.spyOn(axios, 'get');

vi.mock('../config/logger.ts', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

afterEach(() => mockGet.mockReset());

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeVenueResponse(overrides: Partial<VenueFieldInfo> = {}): {
  data: { venues: Array<{ id: number; fieldInfo: Partial<VenueFieldInfo> }> };
} {
  const fi: VenueFieldInfo = {
    venueId: 3313,
    leftLine: 318,
    leftCenter: 399,
    center: 408,
    rightCenter: 385,
    rightLine: 314,
    ...overrides,
  };
  return {
    data: {
      venues: [
        {
          id: fi.venueId,
          fieldInfo: {
            leftLine: fi.leftLine,
            leftCenter: fi.leftCenter,
            center: fi.center,
            rightCenter: fi.rightCenter,
            rightLine: fi.rightLine,
          },
        },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VenueClient.fetchFieldInfo', () => {
  it('calls the correct URL', async () => {
    mockGet.mockResolvedValueOnce(makeVenueResponse());
    const client = new VenueClient();

    await client.fetchFieldInfo(3313);

    expect(mockGet).toHaveBeenCalledOnce();
    expect(mockGet).toHaveBeenCalledWith(
      'https://statsapi.mlb.com/api/v1/venues/3313?hydrate=fieldInfo',
      expect.objectContaining({ timeout: 8_000 })
    );
  });

  it('returns parsed VenueFieldInfo on success', async () => {
    mockGet.mockResolvedValueOnce(makeVenueResponse());
    const client = new VenueClient();

    const result = await client.fetchFieldInfo(3313);

    expect(result).toEqual({
      venueId: 3313,
      leftLine: 318,
      leftCenter: 399,
      center: 408,
      rightCenter: 385,
      rightLine: 314,
    });
  });

  it('returns null on network error (non-throwing)', async () => {
    mockGet.mockRejectedValueOnce(new Error('network timeout'));
    const client = new VenueClient();

    const result = await client.fetchFieldInfo(3313);

    expect(result).toBeNull();
  });

  it('returns null when fieldInfo is absent from the response', async () => {
    mockGet.mockResolvedValueOnce({ data: { venues: [{ id: 3313 }] } });
    const client = new VenueClient();

    const result = await client.fetchFieldInfo(3313);

    expect(result).toBeNull();
  });

  it('returns null when a distance field is missing', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        venues: [{ id: 3313, fieldInfo: { leftLine: 318, center: 408 } }],
      },
    });
    const client = new VenueClient();

    const result = await client.fetchFieldInfo(3313);

    expect(result).toBeNull();
  });

  it('returns null when venues array is empty', async () => {
    mockGet.mockResolvedValueOnce({ data: { venues: [] } });
    const client = new VenueClient();

    const result = await client.fetchFieldInfo(3313);

    expect(result).toBeNull();
  });

  describe('cache behaviour', () => {
    it('returns cached result without a second network call', async () => {
      mockGet.mockResolvedValueOnce(makeVenueResponse());
      const client = new VenueClient();

      const first = await client.fetchFieldInfo(3313);
      const second = await client.fetchFieldInfo(3313);

      expect(mockGet).toHaveBeenCalledOnce();
      expect(second).toStrictEqual(first);
    });

    it('fetches separately for different venueIds', async () => {
      mockGet.mockResolvedValue(makeVenueResponse());
      const client = new VenueClient();

      await client.fetchFieldInfo(3313);
      await client.fetchFieldInfo(15);

      expect(mockGet).toHaveBeenCalledTimes(2);
    });

    it('does not cache null results (retries on next call)', async () => {
      mockGet.mockRejectedValueOnce(new Error('timeout'));
      mockGet.mockResolvedValueOnce(makeVenueResponse());
      const client = new VenueClient();

      const first = await client.fetchFieldInfo(3313);
      const second = await client.fetchFieldInfo(3313);

      expect(first).toBeNull();
      expect(second).not.toBeNull();
      expect(mockGet).toHaveBeenCalledTimes(2);
    });
  });
});
