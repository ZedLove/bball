import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';
import { createApp } from './app.ts';

describe('GET /health', () => {
  it('responds with status 200 and a JSON payload', async () => {
    const app = createApp();
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({ status: 'ok' }));
  });
});

describe('Express app', () => {
  it('should be defined', () => {
    const app = createApp();
    expect(app).toBeDefined();
  });

  it('should handle requests', async () => {
    const app = createApp();
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
  });

  it('should return 404 for undefined routes', async () => {
    const app = createApp();
    const response = await request(app).get('/undefined-route');
    expect(response.status).toBe(404);
  });

  describe('CORS', () => {
    it('should have CORS enabled', async () => {
      const app = createApp();
      const response = await request(app)
        .get('/health')
        .set('Origin', 'http://example.com');

      // CORS headers should be present
      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });
  });
});
