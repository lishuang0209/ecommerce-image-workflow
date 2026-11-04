import { createProject } from '@/core/projects/projects';
import { createEmptyProjectSnapshot } from '@/core/projects/project-snapshot';
import { buildTextCard } from '@/core/beatcanvas/text-nodes';

export async function createCreativeCanvas({ name, template, locale }: { name: string; template: 'ecommerce' | 'blank'; locale: string }) {
  const snapshot = createEmptyProjectSnapshot();
  const zh = locale === 'zh';
  if (template === 'ecommerce') {
    const start = buildTextCard({ id: 'ecommerce-start', name: zh ? '第一步：导入商品素材' : 'Step 1: Import product references', textContent: zh ? '打开左上角「电商素材」。先填写 SKU、选择素材用途并导入商品图。入库只建立素材与商品信息。再切换到「工作流」，创建白底主图、办公与户外场景节点。先采用主图成品，再生成场景图。' : 'Open Ecommerce materials. Enter a SKU, choose the image role, and import product images. Import creates assets and product facts only. Open Workflow to create listing, office and outdoor nodes. Adopt a listing version before generating scenes.' });
    snapshot.cards.push(start); snapshot.frames[start.id] = { x: 400, y: 140, w: 480, h: 320 };
    snapshot.camera = { x: 60, y: 80, z: 0.55 };
  }
  return createProject({ name, workspaceMode: 'canvas', initialSnapshot: snapshot });
}
