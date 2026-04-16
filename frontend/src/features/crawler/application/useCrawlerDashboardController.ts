import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CreateTaskRequestDto, SourceId, SourceOverviewDto, TaskDetailDto, TaskSummaryDto } from '@legaladvisor/shared';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../../lib/api';
import { useArtifactPreview } from './useArtifactPreview';
import { useTaskStream } from './useTaskStream';
import { buildInitialFormValues, buildTaskTarget } from '../domain/taskComposer';
import { buildExecutionTimeline } from '../domain/timeline';
import type { FieldValue } from '../domain/types';

const AUTO_TASK_SYNC_MS = 15_000;
const AUTO_SOURCE_SYNC_MS = 60_000;

export function useCrawlerDashboardController() {
  const navigate = useNavigate();
  const { taskId: routeTaskId } = useParams<{ taskId?: string }>();
  const artifactPreview = useArtifactPreview();
  const { resetPreview } = artifactPreview;

  const [sources, setSources] = useState<SourceOverviewDto[]>([]);
  const [tasks, setTasks] = useState<TaskSummaryDto[]>([]);
  const [taskDetails, setTaskDetails] = useState<Record<string, TaskDetailDto>>({});
  const [selectedSourceId, setSelectedSourceId] = useState<SourceId | null>(null);
  const [formValues, setFormValues] = useState<Record<string, FieldValue>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());
  const taskDetailsRef = useRef<Record<string, TaskDetailDto>>({});

  useEffect(() => {
    taskDetailsRef.current = taskDetails;
  }, [taskDetails]);

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedSourceId) ?? null,
    [selectedSourceId, sources],
  );

  const activeTask = useMemo(
    () => tasks.find((task) => task.id === routeTaskId) ?? null,
    [routeTaskId, tasks],
  );

  const activeTaskDetail = useMemo(
    () => (activeTask ? taskDetails[activeTask.id] ?? null : null),
    [activeTask, taskDetails],
  );

  const activeErrorMessage = useMemo(() => {
    if (!activeTask) {
      return null;
    }
    const failedItem = activeTaskDetail?.workItems.find((workItem) => workItem.status === 'failed' && workItem.lastMessage);
    if (failedItem?.lastMessage) {
      return failedItem.lastMessage;
    }
    if (['failed', 'partial_success'].includes(activeTask.status) && activeTask.summary) {
      return activeTask.summary;
    }
    return null;
  }, [activeTask, activeTaskDetail]);

  const executionTimeline = useMemo(() => {
    if (!activeTask || !activeTaskDetail) {
      return [];
    }
    return buildExecutionTimeline(activeTaskDetail, activeTask, nowTimestamp);
  }, [activeTask, activeTaskDetail, nowTimestamp]);

  const syncSources = useCallback(async (includeHealthRefresh = false) => {
    const nextSources = includeHealthRefresh
      ? await api.refreshSources().catch(() => api.listSources())
      : await api.listSources();

    setSources(nextSources);
    setSelectedSourceId((current) => {
      if (current && nextSources.some((source) => source.id === current)) {
        return current;
      }
      return nextSources[0]?.id ?? null;
    });
  }, []);

  const refreshTasks = useCallback(async () => {
    const nextTasks = await api.listTasks();
    setTasks(nextTasks);

    if (nextTasks.length === 0) {
      return;
    }

    if (!routeTaskId) {
      navigate(`/scraping/${nextTasks[0].id}`, { replace: true });
      return;
    }

    if (!nextTasks.some((task) => task.id === routeTaskId)) {
      navigate(`/scraping/${nextTasks[0].id}`, { replace: true });
    }
  }, [navigate, routeTaskId]);

  const loadTaskDetail = useCallback(async (taskId: string, force = false) => {
    if (!force && taskDetailsRef.current[taskId]) {
      return taskDetailsRef.current[taskId];
    }

    const detail = await api.getTask(taskId);
    if (detail) {
      setTaskDetails((current) => {
        const next = { ...current, [taskId]: detail };
        taskDetailsRef.current = next;
        return next;
      });
      return detail;
    }
    return null;
  }, []);

  const refreshAll = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await Promise.all([syncSources(true), refreshTasks()]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '無法載入頁面資料');
    } finally {
      setIsLoading(false);
    }
  }, [refreshTasks, syncSources]);

  useEffect(() => {
    setFormValues(buildInitialFormValues(selectedSource));
  }, [selectedSource]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    resetPreview();
    if (routeTaskId) {
      void loadTaskDetail(routeTaskId);
    }
  }, [loadTaskDetail, resetPreview, routeTaskId]);

  useTaskStream({
    activeTaskId: routeTaskId ?? null,
    onRefreshTasks: refreshTasks,
    onRefreshSources: async () => {
      await syncSources(false);
    },
    onRefreshTaskDetail: async (taskId) => {
      await loadTaskDetail(taskId, true);
    },
  });

  useEffect(() => {
    if (!activeTask || activeTask.finishedAt) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setNowTimestamp(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [activeTask]);

  useEffect(() => {
    const taskTimer = window.setInterval(() => {
      void refreshTasks();
      if (routeTaskId) {
        void loadTaskDetail(routeTaskId, true);
      }
    }, AUTO_TASK_SYNC_MS);

    const sourceTimer = window.setInterval(() => {
      void syncSources(true).catch((error: unknown) => {
        setErrorMessage(error instanceof Error ? error.message : '來源同步失敗');
      });
    }, AUTO_SOURCE_SYNC_MS);

    return () => {
      window.clearInterval(taskTimer);
      window.clearInterval(sourceTimer);
    };
  }, [loadTaskDetail, refreshTasks, routeTaskId, syncSources]);

  const handleCreateTask = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedSourceId) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const request: CreateTaskRequestDto = {
        sourceId: selectedSourceId,
        targets: [buildTaskTarget(selectedSourceId, formValues)],
      };
      const createdTask = await api.createTask(request);
      setTasks((current) => [createdTask, ...current.filter((task) => task.id !== createdTask.id)]);
      setTaskDetails((current) => ({ ...current, [createdTask.id]: createdTask }));
      navigate(`/scraping/${createdTask.id}`);
      setFormValues(buildInitialFormValues(selectedSource));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '建立任務失敗');
    } finally {
      setIsSubmitting(false);
    }
  }, [formValues, navigate, selectedSource, selectedSourceId]);

  const handleTaskAction = useCallback(async (taskId: string, action: 'pause' | 'resume' | 'cancel' | 'retry') => {
    setErrorMessage(null);
    try {
      if (action === 'pause') {
        await api.pauseTask(taskId);
      } else if (action === 'resume') {
        await api.resumeTask(taskId);
      } else if (action === 'cancel') {
        await api.cancelTask(taskId);
      } else {
        await api.retryFailed(taskId);
      }
      await Promise.all([refreshTasks(), loadTaskDetail(taskId, true)]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '任務操作失敗');
    }
  }, [loadTaskDetail, refreshTasks]);

  const updateFormValue = useCallback((name: string, value: FieldValue) => {
    setFormValues((current) => ({ ...current, [name]: value }));
  }, []);

  const selectTask = useCallback((taskId: string) => {
    navigate(`/scraping/${taskId}`);
    void loadTaskDetail(taskId);
  }, [loadTaskDetail, navigate]);

  return {
    isLoading,
    isSubmitting,
    errorMessage,
    sources,
    selectedSource,
    selectedSourceId,
    selectSource: setSelectedSourceId,
    formValues,
    updateFormValue,
    handleCreateTask,
    tasks,
    activeTaskId: routeTaskId ?? null,
    activeTask,
    activeTaskDetail,
    activeErrorMessage,
    executionTimeline,
    nowTimestamp,
    selectTask,
    handleTaskAction,
    artifactPreview,
  };
}