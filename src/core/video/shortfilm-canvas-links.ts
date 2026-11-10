import type { CanvasCard } from '@/core/beatcanvas/canvas-types';
import type { CanvasOperation } from '@/core/commands/canvas-commands';
import { SHORTFILM_FACTS_CARD_ID, SHORTFILM_SCRIPT_CARD_ID, SHORTFILM_STORYBOARD_CARD_ID, type ShortfilmStoryboardArtifact } from './shortfilm-contract';

/** Add workflow references without replacing user links, positions or content. */
export function buildShortfilmCanvasLinks(cards: readonly CanvasCard[], storyboard?: ShortfilmStoryboardArtifact | null): CanvasOperation[] {
  const known = new Set(cards.map((card) => card.id));
  const designs = cards.filter((card) => card.id.startsWith('video-design-')).map((card) => card.id);
  const operations: CanvasOperation[] = [];
  for (const card of cards) {
    let sources: string[] = [];
    if (card.id === SHORTFILM_SCRIPT_CARD_ID) sources = [SHORTFILM_FACTS_CARD_ID];
    else if (card.id.startsWith('video-design-')) sources = [SHORTFILM_SCRIPT_CARD_ID];
    else if (card.id === SHORTFILM_STORYBOARD_CARD_ID) sources = [SHORTFILM_SCRIPT_CARD_ID, ...designs];
    else if (card.id.startsWith('video-reference-')) sources = [SHORTFILM_STORYBOARD_CARD_ID];
    else if (card.id.startsWith('video-clip-')) sources = [`video-reference-${card.id.slice('video-clip-'.length)}`];
    else if (card.id.startsWith('video-final-episode-')) {
      const episode = storyboard?.episodes?.find((episode, index) => String(episode.episode_number ?? index + 1) === card.id.slice('video-final-episode-'.length));
      sources = (episode?.segments ?? []).map((segment) => `video-clip-${segment.segment_id}`);
    }
    const references = [...new Set([...(card.referenceCardIds ?? []), ...sources.filter((id) => known.has(id) && id !== card.id)])];
    if (references.length === (card.referenceCardIds ?? []).length) continue;
    if (references.length > 20) throw new Error('A canvas node supports at most 20 references. Reduce the links before syncing this workflow.');
    operations.push({ type: 'set_references', cardId: card.id, referenceCardIds: references });
  }
  return operations;
}

/** Compact left-to-right lanes; paired reference/video nodes share a row. */
export function buildShortfilmCanvasLayout(
  cards: readonly CanvasCard[],
  frames: Record<string, { x: number; y: number; w: number; h: number }>,
  storyboard?: ShortfilmStoryboardArtifact | null,
): CanvasOperation[] {
  const known = new Set(cards.map((card) => card.id));
  const segments = (storyboard?.episodes ?? []).flatMap((episode) => episode.segments ?? []);
  const segmentIds = [...new Set([...segments.map((s) => s.segment_id),
    ...cards.filter((c) => c.id.startsWith('video-reference-') || c.id.startsWith('video-clip-'))
      .map((c) => c.id.replace(/^video-(reference|clip)-/, ''))])];
  const lanes = [
    [SHORTFILM_FACTS_CARD_ID, SHORTFILM_SCRIPT_CARD_ID],
    cards.filter((c) => c.id.startsWith('video-design-')).map((c) => c.id),
    [SHORTFILM_STORYBOARD_CARD_ID],
    segmentIds.map((id) => `video-reference-${id}`),
    segmentIds.map((id) => `video-clip-${id}`),
    cards.filter((c) => c.id.startsWith('video-final-episode-')).map((c) => c.id),
  ];
  const operations: CanvasOperation[] = [];
  const rowHeight = Math.max(320, ...lanes.flat().map((id) => frames[id]?.h ?? 0)) + 48;
  let x = 120;
  for (const lane of lanes) {
    const width = Math.max(340, ...lane.map((id) => frames[id]?.w ?? 0));
    lane.forEach((id, row) => {
      if (!known.has(id)) return;
      const previous = frames[id] ?? { x: 0, y: 0, w: 340, h: 320 };
      let y = 120 + row * rowHeight;
      if (id.startsWith('video-final-episode-')) {
        const episode = storyboard?.episodes?.find((e, i) => String(e.episode_number ?? i + 1) === id.slice('video-final-episode-'.length));
        const rows = (episode?.segments ?? []).map((s) => segmentIds.indexOf(s.segment_id)).filter((i) => i >= 0);
        if (rows.length) y = 120 + (Math.min(...rows) + Math.max(...rows)) / 2 * rowHeight;
      }
      if (previous.x !== x || previous.y !== y) operations.push({ type: 'move_card', cardId: id, frame: { ...previous, x, y } });
    });
    if (lane.some((id) => known.has(id))) x += width + 80;
  }
  return operations;
}
