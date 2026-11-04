import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTextCard } from './text-nodes';
import type { CanvasGenerationCard, CanvasOutputCard } from './canvas-types';
import { buildGenerationResultAsset } from './generation-result-node';
import { createProjectSnapshotRestorePlan } from '@/core/projects/project-canvas-document';

test('visible result preserves the saved asset and source edge across snapshot restore', () => {
  const source = { ...buildTextCard({ id: 'gen', name: 'Image' }), kind: 'generation', type: 'image', referenceCardIds: ['product', 'prompt'] } as CanvasGenerationCard;
  const output = { ...source, id: 'out', kind: 'output', sourceConfigCardId: source.id, generationRunId: 'run', generationSnapshot: { ...source, type: 'image', capturedAt: '2026-11-04T10:00:00Z' }, status: 'succeeded', assetId: 'asset', url: '/api/app/projects/project/assets/asset', sourceGenerationId: 'job' } as CanvasOutputCard;
  const result = buildGenerationResultAsset(output, source);
  assert.ok(result);
  assert.equal(result.assetId, output.assetId);
  assert.equal(result.sourceGenerationId, 'job');
  assert.deepEqual(result.referenceCardIds, ['gen']);
  assert.equal(result.id, buildGenerationResultAsset(output, source)!.id);
  const restored = createProjectSnapshotRestorePlan({ version: 4, cards: [source, output, result], frames: {} });
  assert.ok(restored.connectors.some(edge => edge.sourceCardId === 'gen' && edge.targetCardId === result.id));
  assert.equal(buildGenerationResultAsset({ ...output, status: 'failed' }, source), null);
  assert.equal(buildGenerationResultAsset({ ...output, sourceConfigCardId: 'different' }, source), null);
  assert.equal(buildGenerationResultAsset({ ...output, url: 'blob:transient' }, source), null);
  assert.equal(buildGenerationResultAsset({ ...output, generationSnapshot: { ...output.generationSnapshot, generationMode: 'analysis' } }, source), null);
});
