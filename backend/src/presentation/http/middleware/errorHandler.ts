import type { ErrorRequestHandler } from 'express';
import { AppError } from '../../../domain/errors.js';

export const errorHandler: ErrorRequestHandler = (error, _request, response, next) => {
  void next;
  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      code: error.code,
      message: error.message,
      details: error.details,
    });
    return;
  }

  const message = error instanceof Error ? error.message : 'Unknown server error';
  response.status(500).json({
    code: 'internal_error',
    message,
  });
};