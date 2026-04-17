import type { ErrorRequestHandler } from 'express';
import { toErrorResponsePayload } from '../../../domain/errors.js';

export const errorHandler: ErrorRequestHandler = (error, _request, response, next) => {
  void next;
  const payload = toErrorResponsePayload(error);
  response.status(payload.statusCode).json({
    code: payload.code,
    message: payload.message,
    details: payload.details,
  });
};