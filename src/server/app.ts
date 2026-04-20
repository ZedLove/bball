import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { healthRouter } from '../routes/health.ts';
import { logger } from '../config/logger.ts';
import { CONFIG } from '../config/env.ts';

export function createApp(): express.Application {
  const app = express();

  // ----- Global middlewares -------------------------------------------------
  app.use(cors({ origin: CONFIG.CORS_ORIGIN, methods: ['GET', 'POST'] }));
  app.use(express.json());

  // ----- Routes -------------------------------------------------------------
  app.use('/', healthRouter);
  // future: app.use("/users", usersRouter); etc.

  // ----- 404 handler --------------------------------------------------------
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    const err = new Error('Not Found') as Error & { status?: number };
    err.status = 404;
    next(err);
  });

  // ----- Central error handler ----------------------------------------------
  app.use(
    (
      err: Error & { status?: number },
      _req: Request,
      res: Response,
      _next: NextFunction
    ) => {
      const status = err.status || 500;
      logger.error('❗  %s – %s', err.message, err.stack);
      res.status(status).json({
        error: err.message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
      });
    }
  );

  return app;
}
