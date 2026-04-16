import { AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';
import styles from './ScrapingDashboard.module.css';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { ArtifactPreview } from '../components/dashboard/ArtifactPreview';
import { SourcePicker } from '../components/dashboard/SourcePicker';
import { TaskComposer } from '../components/dashboard/TaskComposer';
import { TaskDetailPanel } from '../components/dashboard/TaskDetailPanel';
import { TaskRail } from '../components/dashboard/TaskRail';
import { useCrawlerDashboardController } from '../features/crawler/application/useCrawlerDashboardController';

export function ScrapingDashboard() {
  const controller = useCrawlerDashboardController();

  return (
    <div className={clsx(styles.dashboard, 'animate-fade-in')}>
      {controller.errorMessage && (
        <div className={styles.errorBanner}>
          <AlertTriangle size={16} />
          <span>{controller.errorMessage}</span>
        </div>
      )}

      <div className={styles.topGrid}>
        <Card className={styles.createTaskCard}>
          <CardContent>
            <SourcePicker
              sources={controller.sources}
              selectedSourceId={controller.selectedSourceId}
              onSelectSource={controller.selectSource}
            />
            <TaskComposer
              source={controller.selectedSource}
              formValues={controller.formValues}
              isSubmitting={controller.isSubmitting}
              onSubmit={controller.handleCreateTask}
              onFieldChange={controller.updateFormValue}
            />
          </CardContent>
        </Card>
      </div>

      <Card className={styles.tasksCard}>
        <CardHeader className={styles.sectionHeader}>
          <CardTitle>任務進度</CardTitle>
        </CardHeader>
        <CardContent className={styles.taskWorkspace}>
          <TaskRail
            isLoading={controller.isLoading}
            tasks={controller.tasks}
            activeTaskId={controller.activeTaskId}
            nowTimestamp={controller.nowTimestamp}
            onSelectTask={controller.selectTask}
          />

          <div className={styles.taskPreview}>
            <TaskDetailPanel
              activeTask={controller.activeTask}
              taskDetail={controller.activeTaskDetail}
              activeErrorMessage={controller.activeErrorMessage}
              executionTimeline={controller.executionTimeline}
              nowTimestamp={controller.nowTimestamp}
              activeArtifactId={controller.artifactPreview.activeArtifactId}
              onTaskAction={controller.handleTaskAction}
              onOpenPreview={(artifact) => void controller.artifactPreview.openPreview(artifact)}
            />
          </div>
        </CardContent>
      </Card>

      <ArtifactPreview
        key={controller.artifactPreview.activeArtifactId ?? 'artifact-preview'}
        open={controller.artifactPreview.isOpen}
        isLoading={controller.artifactPreview.isLoading}
        errorMessage={controller.artifactPreview.errorMessage}
        preview={controller.artifactPreview.preview}
        onClose={controller.artifactPreview.closePreview}
        onDownload={controller.artifactPreview.downloadArtifact}
      />
    </div>
  );
}
