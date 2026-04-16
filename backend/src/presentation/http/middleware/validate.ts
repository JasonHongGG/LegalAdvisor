import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { RequestValidationError } from '../../../domain/errors.js';

export function validateBody<T>(schema: ZodType<T>): RequestHandler {
  return (request, _response, next) => {
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      next(new RequestValidationError('Invalid request body', { issues: parsed.error.flatten() }));
      return;
    }

    request.body = parsed.data;
    next();
  };
}