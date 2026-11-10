import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTextCard } from '@/core/beatcanvas/text-nodes';
import { applyCanvasOperations } from '@/core/commands/canvas-commands';
import { createProjectSnapshotRestorePlan } from '@/core/projects/project-canvas-document';
import type { ProjectSnapshotDocument } from '@/core/projects/project-snapshot';
import { buildShortfilmCanvasLinks } from './shortfilm-canvas-links';

test('workflow references restore visible connectors and preserve positions and manual links', () => {
  const ids = ['manual', 'video-product-facts', 'video-ad-script', 'video-design-cup', 'video-ad-storyboard',
    'video-reference-a', 'video-clip-a', 'video-reference-b', 'video-clip-b', 'video-final-episode-1', 'video-final-episode-2'];
  const cards = ids.map((id) => buildTextCard({ id, name: id, textContent: 'Keep content' }));
  cards.find((card) => card.id === 'video-ad-storyboard')!.referenceCardIds = ['manual'];
  const source: ProjectSnapshotDocument = { version: 4, cards, frames: Object.fromEntries(ids.map((id, i) => [id, { x: i * 400, y: 250, w: 300, h: 200 }])) };
  const storyboard = { episodes: [{ episode_number: 1, segments: [{ segment_id: 'a' }] }, { episode_number: 2, segments: [{ segment_id: 'b' }] }] };
  const result = applyCanvasOperations(source, buildShortfilmCanvasLinks(cards, storyboard)).document;
  assert.deepEqual(result.frames, source.frames);
  assert.equal(result.cards.every((card) => card.textContent === 'Keep content'), true);
  assert.deepEqual(result.cards.find((card) => card.id === 'video-ad-storyboard')!.referenceCardIds, ['manual', 'video-ad-script', 'video-design-cup']);
  assert.deepEqual(result.cards.find((card) => card.id === 'video-final-episode-1')!.referenceCardIds, ['video-clip-a']);
  assert.deepEqual(result.cards.find((card) => card.id === 'video-final-episode-2')!.referenceCardIds, ['video-clip-b']);
  const connectors = createProjectSnapshotRestorePlan(result).connectors;
  assert.ok(connectors.some((edge) => edge.sourceCardId === 'video-product-facts' && edge.targetCardId === 'video-ad-script'));
  assert.ok(connectors.some((edge) => edge.sourceCardId === 'video-reference-a' && edge.targetCardId === 'video-clip-a'));
  assert.equal(new Set(connectors.map((edge) => `${edge.sourceCardId}->${edge.targetCardId}`)).size, connectors.length);
  assert.deepEqual(buildShortfilmCanvasLinks(result.cards, storyboard), [], 'repeat syncing must not create duplicates or revisions');
  assert.deepEqual(source.cards.find((card) => card.id === 'video-ad-script')!.referenceCardIds, [], 'input must not mutate');
});

test('missing nodes and unknown episode membership never produce guessed or dangling links', () => {
  const cards = ['video-ad-script', 'video-clip-a', 'video-final-episode-1'].map((id) => buildTextCard({ id, name: id }));
  assert.deepEqual(buildShortfilmCanvasLinks(cards), []);
});

test('compact workflow lanes align corresponding clips and keep manual nodes untouched', async () => {
  const { buildShortfilmCanvasLayout } = await import('./shortfilm-canvas-links');
  const ids = ['manual', 'video-ad-script', 'video-ad-storyboard', 'video-reference-a', 'video-reference-b', 'video-clip-b', 'video-clip-a', 'video-final-episode-1'];
  const cards = ids.map((id) => buildTextCard({ id, name: id }));
  const frames = Object.fromEntries(ids.map((id) => [id, { x: 100, y: 3820, w: 340, h: 320 }]));
  const storyboard = { episodes: [{ episode_number: 1, segments: [{ segment_id: 'a' }, { segment_id: 'b' }] }] };
  const result = applyCanvasOperations({ version: 4, cards, frames }, buildShortfilmCanvasLayout(cards, frames, storyboard)).document;
  assert.deepEqual(result.frames.manual, frames.manual);
  assert.equal(result.frames['video-reference-a'].y, result.frames['video-clip-a'].y);
  assert.equal(result.frames['video-reference-b'].y, result.frames['video-clip-b'].y);
  assert.equal(result.frames['video-clip-a'].x - result.frames['video-reference-a'].x, 420);
  assert.equal(result.frames['video-final-episode-1'].x - result.frames['video-clip-a'].x, 420);
  assert.deepEqual(buildShortfilmCanvasLayout(cards, result.frames, storyboard), []);
});
