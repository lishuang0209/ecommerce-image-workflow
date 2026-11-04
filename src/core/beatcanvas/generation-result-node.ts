import type { CanvasAssetCard, CanvasGenerationCard, CanvasOutputCard } from './canvas-types';
import { parseLocalProjectAssetUrl } from '@/core/projects/local-project-asset-url';

/** A visible placement of an existing take; never a second generation. */
export function buildGenerationResultAsset(output: CanvasOutputCard, source: CanvasGenerationCard): CanvasAssetCard | null {
  if (output.status !== 'succeeded' || !output.url || /^(blob:|data:)/.test(output.url) || output.generationSnapshot.generationMode === 'analysis' || output.sourceConfigCardId !== source.id) return null;
  return {
    id: `result:${output.id}`, kind: 'asset', type: output.type,
    assetId: output.assetId ?? parseLocalProjectAssetUrl(output.url)?.assetId ?? null,
    name: output.name, url: output.url, prompt: '', referenceCardIds: [source.id],
    workflowTemplateId: null, status: 'succeeded', error: null, modelId: '',
    aspectRatio: output.aspectRatio, outputQuality: output.outputQuality,
    duration: output.duration, mode: 'quality', variant: 'standard', quality: 'standard',
    sourceGenerationId: output.sourceGenerationId,
  };
}
