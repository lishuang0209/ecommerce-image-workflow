import { createProject } from '@/core/projects/projects';
import { createEmptyProjectSnapshot } from '@/core/projects/project-snapshot';
import { buildTextCard } from '@/core/beatcanvas/text-nodes';
import { SHORTFILM_FACTS_CARD_ID } from '@/core/video/shortfilm-contract';

export async function createCreativeCanvas({ name, template, locale }: { name: string; template: 'ecommerce' | 'video' | 'blank'; locale: string }) {
  const snapshot = createEmptyProjectSnapshot();
  const zh = locale === 'zh';
  if (template === 'video') {
    snapshot.workflows = { product: 'video' };
    const facts = buildTextCard({
      id: SHORTFILM_FACTS_CARD_ID,
      name: zh ? '商品信息' : 'Product brief',
      textContent: '',
      textRole: 'note',
    });
    snapshot.cards.push(facts);
    snapshot.frames[facts.id] = { x: 120, y: 120, w: 460, h: 320 };
    snapshot.camera = { x: 40, y: 60, z: 0.72 };
  }
  return createProject({ name, workspaceMode: 'canvas', initialSnapshot: snapshot });
}
