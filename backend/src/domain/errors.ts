export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
    public readonly details: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, details: Record<string, unknown> | null = null) {
    super(message, 404, 'not_found', details);
  }
}

export class RequestValidationError extends AppError {
  constructor(message: string, details: Record<string, unknown> | null = null) {
    super(message, 400, 'validation_error', details);
  }
}

export class AdapterExecutionError extends Error {
  constructor(
    message: string,
    public readonly kind: 'validation' | 'transient' | 'rate-limit' | 'unexpected' = 'unexpected',
    public readonly details: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class AdapterValidationError extends AdapterExecutionError {
  constructor(message: string, details: Record<string, unknown> | null = null) {
    super(message, 'validation', details);
  }
}

export class AdapterTransientError extends AdapterExecutionError {
  constructor(message: string, details: Record<string, unknown> | null = null) {
    super(message, 'transient', details);
  }
}

export class AdapterRateLimitError extends AdapterExecutionError {
  constructor(message: string, details: Record<string, unknown> | null = null) {
    super(message, 'rate-limit', details);
  }
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unknown error';
}