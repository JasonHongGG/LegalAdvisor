import { AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';
import styles from './ScrapingDashboard.module.css';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { ArtifactPreview } from '../components/dashboard/ArtifactPreview';
import { SourcePicker } from '../components/dashboard/SourcePicker';
import { RunComposer } from '../components/dashboard/RunComposer';
import { RunDetailPanel } from '../components/dashboard/RunDetailPanel';
import { RunRail } from '../components/dashboard/RunRail';
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
        <Card className={styles.createRunCard}>
          <CardContent>
            <SourcePicker
              sources={controller.sources}
              selectedSourceId={controller.selectedSourceId}
              onSelectSource={controller.selectSource}
            />
            <RunComposer
              source={controller.selectedSource}
              formValues={controller.formValues}
              isSubmitting={controller.isSubmitting}
              onSubmit={controller.handleCreateRun}
              onFieldChange={controller.updateFormValue}
            />
          </CardContent>
        </Card>
      </div>

      <Card className={styles.runsCard}>
        <CardHeader className={styles.sectionHeader}>
          <CardTitle>任務進度</CardTitle>
        </CardHeader>
        <CardContent className={styles.runWorkspace}>
          <RunRail
            isLoading={controller.isLoading}
            runs={controller.runs}
            activeRunId={controller.activeRunId}
            nowTimestamp={controller.nowTimestamp}
            onSelectRun={controller.selectRun}
          />

          <div className={styles.runPreview}>
            <RunDetailPanel
              activeRun={controller.activeRun}
              artifacts={controller.activeRunArtifacts}
              events={controller.activeRunEvents}
              activeErrorMessage={controller.activeErrorMessage}
              executionTimeline={controller.executionTimeline}
              nowTimestamp={controller.nowTimestamp}
              activeArtifactId={controller.artifactPreview.activeArtifactId}
              isRunViewLoading={controller.isRunViewLoading}
              onRunAction={controller.handleRunAction}
              onDeleteRun={controller.handleDeleteRun}
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
