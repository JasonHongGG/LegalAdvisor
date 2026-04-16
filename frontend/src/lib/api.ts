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

async function requestJson<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${API_BASE}${path}`, {
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
  retryFailed(taskId: string) {
    return requestJson<TaskControlResponseDto>(`/tasks/${taskId}/retry-failed`, { method: 'POST' });
  },
  artifactDownloadUrl(artifactId: string) {
    return `${API_BASE}/artifacts/${artifactId}/download`;
  },
  getArtifactPreview(artifactId: string) {
    return requestJson<ArtifactPreviewDto>(`/artifacts/${artifactId}/preview`);
  },
  manifestDownloadUrl(taskId: string) {
    return `${API_BASE}/tasks/${taskId}/manifest/download`;
  },
  taskArchiveDownloadUrl(taskId: string) {
    return `${API_BASE}/tasks/${taskId}/artifacts/archive/download`;
  },
  createTaskStream() {
    return new EventSource(`${API_BASE}/tasks/stream`);
  },
  parseTaskStreamEvent(value: string) {
    return JSON.parse(value) as TaskStreamEvent;
  },
};
