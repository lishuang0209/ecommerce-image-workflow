import { createProject } from '@/core/projects/projects';
import { createEmptyProjectSnapshot } from '@/core/projects/project-snapshot';
import { buildTextCard } from '@/core/beatcanvas/text-nodes';

function placeStart(snapshot: ReturnType<typeof createEmptyProjectSnapshot>, card: ReturnType<typeof buildTextCard>) {
  snapshot.cards.push(card);
  snapshot.frames[card.id] = { x: 400, y: 140, w: 480, h: 320 };
  snapshot.camera = { x: 60, y: 80, z: 0.55 };
}

export async function createCreativeCanvas({ name, template, locale }: { name: string; template: 'ecommerce' | 'video' | 'blank'; locale: string }) {
  const snapshot = createEmptyProjectSnapshot();
  const zh = locale === 'zh';
  if (template === 'video') {
    snapshot.workflows = { product: 'video' };
    placeStart(snapshot, buildTextCard({ id: 'ecommerce-video-start', name: zh ? '电商视频' : 'Product video', textContent: zh ? '这是商品视频项目。视频生成还没有接入，当前不会调用模型，也不会打开图片工作流。' : 'This project is for product video. Video generation is not connected yet, so this canvas does not call a model or open the image workflow.' }));
  }
  return createProject({ name, workspaceMode: 'canvas', initialSnapshot: snapshot });
}
