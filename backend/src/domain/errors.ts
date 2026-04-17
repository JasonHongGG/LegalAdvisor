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

type ErrorLike = Error & {
  code?: string;
  detail?: string | null;
  constraint?: string | null;
};

function translateInfrastructureError(error: ErrorLike) {
  const message = error.message ?? '';

  if (
    error.code === '42P10'
    || message.includes('there is no unique or exclusion constraint matching the ON CONFLICT specification')
  ) {
    return '法規資料寫入失敗，系統資料表唯一鍵設定不一致。';
  }

  if (error.code === '23505') {
    return '資料寫入時發生重複鍵衝突，系統會以既有資料為準。';
  }

  if (error.code === 'ECONNREFUSED' || message.includes('connect ECONNREFUSED')) {
    return '系統目前無法連線到所需服務，請稍後再試。';
  }

  if (message.includes('timeout') || message.includes('timed out')) {
    return '系統處理逾時，請稍後再試。';
  }

  return null;
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return translateInfrastructureError(error as ErrorLike) ?? error.message;
  }
  return 'Unknown error';
}

export function toErrorResponsePayload(error: unknown) {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }

  if (error instanceof Error) {
    return {
      statusCode: 500,
      code: 'internal_error',
      message: translateInfrastructureError(error as ErrorLike) ?? error.message,
      details: null,
    };
  }

  return {
    statusCode: 500,
    code: 'internal_error',
    message: 'Unknown server error',
    details: null,
  };
}