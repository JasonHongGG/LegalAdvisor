import type {
  ArtifactPreviewDto,
  CreateTaskRequestDto,
  SourceOverviewDto,
  TaskControlResponseDto,
  TaskDetailDto,
  TaskStreamEvent,
  TaskSummaryDto,
} from '@legaladvisor/shared';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';
const DOWNLOAD_API_BASE = import.meta.env.DEV && API_BASE === '/api' ? 'http://localhost:4000/api' : API_BASE;

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

async function requestJson<T>(path: string, init?: RequestInit) {
  const response = await fetch(resolveApiUrl(path), {
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? `Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
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
    return requestJson<SourceOverviewDto[]>('/sources');
  },
  refreshSources() {
    return requestJson<SourceOverviewDto[]>('/sources/refresh', { method: 'POST' });
  },
  listTasks() {
    return requestJson<TaskSummaryDto[]>('/tasks');
  },
  getTask(taskId: string) {
    return requestJson<TaskDetailDto | null>(`/tasks/${taskId}`);
  },
  createTask(input: CreateTaskRequestDto) {
    return requestJson<TaskDetailDto>('/tasks', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  pauseTask(taskId: string) {
    return requestJson<TaskControlResponseDto>(`/tasks/${taskId}/pause`, { method: 'POST' });
  },
  resumeTask(taskId: string) {
    return requestJson<TaskControlResponseDto>(`/tasks/${taskId}/resume`, { method: 'POST' });
  },
  cancelTask(taskId: string) {
    return requestJson<TaskControlResponseDto>(`/tasks/${taskId}/cancel`, { method: 'POST' });
  },
  deleteTask(taskId: string) {
    return requestEmpty(`/tasks/${taskId}`, { method: 'DELETE' });
  },
  retryFailed(taskId: string) {
    return requestJson<TaskControlResponseDto>(`/tasks/${taskId}/retry-failed`, { method: 'POST' });
  },
  downloadArtifact(artifactId: string, fallbackFileName = `artifact-${artifactId}`) {
    return downloadFile(`/artifacts/${artifactId}/download`, fallbackFileName);
  },
  getArtifactPreview(artifactId: string) {
    return requestJson<ArtifactPreviewDto>(`/artifacts/${artifactId}/preview`);
  },
  downloadManifest(taskId: string) {
    return downloadFile(`/tasks/${taskId}/manifest/download`, `task-${taskId}-manifest.json`);
  },
  downloadTaskArchive(taskId: string) {
    return downloadFile(`/tasks/${taskId}/artifacts/archive/download`, `task-${taskId}-artifacts.zip`);
  },
  createTaskStream() {
    return new EventSource(resolveApiUrl('/tasks/stream'));
  },
  parseTaskStreamEvent(value: string) {
    return JSON.parse(value) as TaskStreamEvent;
  },
};
