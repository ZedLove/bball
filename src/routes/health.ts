import express from 'express';
import type { Response } from 'express';

export const healthRouter = express.Router();

healthRouter.get('/health', (_, res: Response) => {
  res.json({ status: 'ok' });
});
