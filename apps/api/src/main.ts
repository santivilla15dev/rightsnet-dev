import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Module, type ExceptionFilter, type ArgumentsHost, HttpException } from '@nestjs/common';
import { json } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { randomUUID } from 'node:crypto';
import { DomainError } from '../../../packages/domain/src/index.js';
import {
  PublicController,
  AccountsController,
  CommerceController,
  AdminController,
  PlatformController,
  WebhooksController,
} from './modules/controllers.js';
import { assertConfiguration, config } from './common/config.js';
import { rateLimitPort } from './common/rate-limit.js';
assertConfiguration();
@Module({
  controllers: [
    PublicController,
    AccountsController,
    CommerceController,
    AdminController,
    PlatformController,
    WebhooksController,
  ],
})
class AppModule {}
class ErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof DomainError
        ? exception.status
        : exception instanceof ZodError
          ? 422
          : exception instanceof HttpException
            ? exception.getStatus()
            : 500;
    const code =
      exception instanceof DomainError
        ? exception.code
        : exception instanceof ZodError
          ? 'VALIDATION_ERROR'
          : status === 500
            ? 'INTERNAL_ERROR'
            : 'REQUEST_ERROR';
    if (status === 500) console.error('API error', exception);
    res
      .status(status)
      .json({
        error: {
          code,
          message:
            exception instanceof DomainError
              ? exception.message
              : exception instanceof ZodError
                ? 'Revisa los campos de la solicitud.'
                : 'No se pudo completar la solicitud.',
          details: exception instanceof ZodError ? exception.flatten() : {},
          request_id: res.getHeader('X-Request-Id'),
        },
      });
  }
}
export async function bootstrap(port = config.port) {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    logger: ['error', 'warn', 'log'],
  });
  // Preserve raw bytes for Stripe signature verification. A plain `json()`
  // middleware would parse the body and leave `req.rawBody` empty → HTTP 400.
  app.use(
    json({
      limit: '3mb',
      verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.useGlobalFilters(new ErrorFilter());
  const limiter = rateLimitPort();
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Request-Id', randomUUID());
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    const bucket = req.path.includes('/auth/') ? 'auth' : 'api';
    const key = `${req.ip}:${bucket}`;
    const max = bucket === 'auth' ? 60 : 1500;
    void limiter
      .hit(key, max, 60_000)
      .then((r) => {
        if (!r.allowed) {
          res.status(429).json({
            error: {
              code: 'RATE_LIMITED',
              message: 'Espera un momento antes de volver a intentarlo.',
            },
          });
          return;
        }
        next();
      })
      .catch(next);
  });
  await app.listen(port, '127.0.0.1');
  return app;
}
if (process.argv[1]?.endsWith('main.ts')) bootstrap();
