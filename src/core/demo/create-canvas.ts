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
      textContent: zh
        ? '在这里写商品名称、核心卖点、目标人群和投放平台。左侧「电商视频」面板会读取这段信息生成广告脚本。'
        : 'Write the product name, selling points, audience and target platform here. The Ecommerce video panel on the left uses this brief to generate the ad script.',
      textRole: 'note',
    });
    snapshot.cards.push(facts);
    snapshot.frames[facts.id] = { x: 120, y: 120, w: 460, h: 320 };
    snapshot.camera = { x: 40, y: 60, z: 0.72 };
  }
  return createProject({ name, workspaceMode: 'canvas', initialSnapshot: snapshot });
}
