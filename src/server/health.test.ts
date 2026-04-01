import request from 'supertest';
import { createApp } from './app.ts';

describe('GET /health', () => {
  it('responds with status 200 and a JSON payload', async () => {
    const app = createApp();
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);

    expect(response.body).toEqual(expect.objectContaining({ status: 'ok' }));
  });
});