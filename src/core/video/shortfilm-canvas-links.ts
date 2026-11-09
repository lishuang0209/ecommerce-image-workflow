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
