import { useCallback, useState } from 'react';
import type { ArtifactDto, ArtifactPreviewDto } from '@legaladvisor/shared';
import { api } from '../../../lib/api';

export function useArtifactPreview() {
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const [preview, setPreview] = useState<ArtifactPreviewDto | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const openPreview = useCallback(async (artifact: ArtifactDto) => {
    setActiveArtifactId(artifact.id);
    setPreview(null);
    setErrorMessage(null);
    setIsOpen(true);
    setIsLoading(true);

    try {
      const nextPreview = await api.getArtifactPreview(artifact.id);
      setPreview(nextPreview);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '無法載入檔案預覽');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const closePreview = useCallback(() => {
    setIsOpen(false);
  }, []);

  const resetPreview = useCallback(() => {
    setIsOpen(false);
    setPreview(null);
    setActiveArtifactId(null);
    setErrorMessage(null);
    setIsLoading(false);
  }, []);

  const downloadArtifact = useCallback((artifactId: string) => {
    window.open(api.artifactDownloadUrl(artifactId), '_blank', 'noopener,noreferrer');
  }, []);

  return {
    activeArtifactId,
    preview,
    isOpen,
    isLoading,
    errorMessage,
    openPreview,
    closePreview,
    resetPreview,
    downloadArtifact,
  };
}