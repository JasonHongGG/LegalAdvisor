import type {
  CreateRunRequestDto,
  ErrorResponseDto,
  RunStreamEvent,
} from '@legaladvisor/shared';
import {
  artifactPreviewDtoSchema,
  createRunRequestSchema,
  errorResponseSchema,
  runControlResponseSchema,
  runDetailDtoSchema,
  runExecutionViewDtoSchema,
  runStreamEventSchema,
  runSummaryDtoSchema,
  sourceOverviewDtoSchema,
} from '@legaladvisor/shared';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';
const DOWNLOAD_API_BASE = import.meta.env.DEV && API_BASE === '/api' ? 'http://localhost:4000/api' : API_BASE;

type Parser<T> = {
  parse: (value: unknown) => T;
};

export class ApiError extends Error {
  readonly code: string;
  readonly details: ErrorResponseDto['details'];

  constructor(
    message: string,
    code: string,
    details: ErrorResponseDto['details'],
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

function resolveApiUrl(path: string, base = API_BASE) {
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  return new URL(`${normalizedBase}${path}`, window.location.origin).toString();
}

function extractErrorMessage(defaultMessage: string, response: Response, payload: unknown) {
  if (payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string') {
    return payload.message;
  }

  if (typeof payload === 'string' && payload.trim()) {
    return payload;
  }

  return `${defaultMessage}: ${response.status}`;
}

function extractDownloadFileName(response: Response) {
  const disposition = response.headers.get('content-disposition');
  if (!disposition) {
    return null;
  }

  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const basicMatch = disposition.match(/filename="?([^";]+)"?/i);
  return basicMatch?.[1] ?? null;
}

async function readErrorPayload(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json().catch(() => null);
  }

  return response.text().catch(() => null);
}

async function downloadFile(path: string, fallbackFileName: string) {
  const response = await fetch(resolveApiUrl(path, DOWNLOAD_API_BASE));
  if (!response.ok) {
    const payload = await readErrorPayload(response);
    throw new Error(extractErrorMessage('Download failed', response, payload));
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = extractDownloadFileName(response) ?? fallbackFileName;
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

function parsePayload<T>(parser: Parser<T>, payload: unknown, path: string) {
  try {
    return parser.parse(payload);
  } catch (error) {
    throw new Error(`Invalid API response for ${path}: ${error instanceof Error ? error.message : 'unknown schema error'}`);
  }
}

function toApiError(response: Response, payload: unknown, defaultMessage: string) {
  const parsed = errorResponseSchema.safeParse(payload);
  if (parsed.success) {
    return new ApiError(parsed.data.message, parsed.data.code, parsed.data.details);
  }

  return new ApiError(extractErrorMessage(defaultMessage, response, payload), 'request_failed', null);
}

async function requestJsonWithSchema<T>(path: string, parser: Parser<T>, init?: RequestInit) {
  const response = await fetch(resolveApiUrl(path), {
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const payload = await readErrorPayload(response);
    throw toApiError(response, payload, 'Request failed');
  }

  const payload = await response.json();
  return parsePayload(parser, payload, path);
}

async function requestEmpty(path: string, init?: RequestInit) {
  const response = await fetch(resolveApiUrl(path), init);
  if (!response.ok) {
    const payload = await readErrorPayload(response);
    throw new Error(extractErrorMessage('Request failed', response, payload));
  }
}

export const api = {
  listSources() {
    return requestJsonWithSchema('/sources', sourceOverviewDtoSchema.array());
  },
  refreshSources() {
    return requestJsonWithSchema('/sources/refresh', sourceOverviewDtoSchema.array(), { method: 'POST' });
  },
  listRuns() {
    return requestJsonWithSchema('/runs', runSummaryDtoSchema.array());
  },
  getRun(runId: string) {
    return requestJsonWithSchema(`/runs/${runId}`, runDetailDtoSchema.nullable());
  },
  getRunView(runId: string) {
    return requestJsonWithSchema(`/runs/${runId}/view`, runExecutionViewDtoSchema);
  },
  createRun(input: CreateRunRequestDto) {
    const payload = createRunRequestSchema.parse(input);
    return requestJsonWithSchema('/runs', runDetailDtoSchema, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  pauseRun(runId: string) {
    return requestJsonWithSchema(`/runs/${runId}/pause`, runControlResponseSchema, { method: 'POST' });
  },
  resumeRun(runId: string) {
    return requestJsonWithSchema(`/runs/${runId}/resume`, runControlResponseSchema, { method: 'POST' });
  },
  cancelRun(runId: string) {
    return requestJsonWithSchema(`/runs/${runId}/cancel`, runControlResponseSchema, { method: 'POST' });
  },
  deleteRun(runId: string) {
    return requestEmpty(`/runs/${runId}`, { method: 'DELETE' });
  },
  retryFailedRunItems(runId: string) {
    return requestJsonWithSchema(`/runs/${runId}/retry-failed`, runControlResponseSchema, { method: 'POST' });
  },
  downloadArtifact(artifactId: string, fallbackFileName = `artifact-${artifactId}`) {
    return downloadFile(`/artifacts/${artifactId}/download`, fallbackFileName);
  },
  getArtifactPreview(artifactId: string) {
    return requestJsonWithSchema(`/artifacts/${artifactId}/preview`, artifactPreviewDtoSchema);
  },
  downloadManifest(runId: string) {
    return downloadFile(`/runs/${runId}/manifest/download`, `run-${runId}-manifest.json`);
  },
  downloadRunArchive(runId: string) {
    return downloadFile(`/runs/${runId}/artifacts/archive/download`, `run-${runId}-artifacts.zip`);
  },
  createRunStream() {
    return new EventSource(resolveApiUrl('/runs/stream'));
  },
  parseRunStreamEvent(value: string) {
    return runStreamEventSchema.parse(JSON.parse(value)) as RunStreamEvent;
  },
};

export function getApiFieldErrors(error: unknown) {
  if (!(error instanceof ApiError) || !error.details || typeof error.details !== 'object' || !('fieldErrors' in error.details)) {
    return {} as Record<string, string>;
  }

  const fieldErrors = (error.details as { fieldErrors?: Array<{ field: string; message: string }> }).fieldErrors ?? [];
  return Object.fromEntries(fieldErrors.map((entry) => [entry.field, entry.message]));
}
