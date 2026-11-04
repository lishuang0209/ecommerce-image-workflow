import { z } from 'zod';

export const demoModels = {
  text: 'qwen3.7-flash',
  image: 'qwen-image-2.1-turbo',
  video: 'wan2.6-i2v-flash',
} as const;

export const demoInputSchema = z.object({
  kind: z.enum(['ecommerce', 'drama']),
  name: z.string().trim().min(1).max(100),
  brief: z.string().trim().max(12000).default(''),
  subjects: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
  ratios: z.array(z.enum(['1:1', '4:5', '9:16'])).min(1).max(3),
  shots: z.number().int().min(1).max(6).default(3),
  locale: z.enum(['zh', 'en', 'ja']).default('zh'),
}).strict();

export type DemoInput = z.infer<typeof demoInputSchema>;
export type DemoAsset = { id: string; cardId: string; filename: string; source: string; subject: string; sha256: string; url: string };
export type DemoPlan = {
  id: string;
  projectId: string;
  input: DemoInput;
  assets: DemoAsset[];
  createdAt: string;
  updatedAt: string;
  revision: number;
  steps?: DemoStep[];
  runs?: DemoRun[];
};

export type DemoStep = { id: string; title: string; prompt: string; model: string; subject: string; ratio: '1:1' | '4:5' | '9:16' };

// Tasks are ordered drafts. No media is generated while planning or importing.
export function buildDemoSteps(input: DemoInput): DemoStep[] {
  const zh = input.locale === 'zh';
  if (input.kind === 'ecommerce') {
    return input.subjects.flatMap((subject, subjectIndex) => ['main', 'scene'].flatMap((role) => input.ratios.map((ratio) => ({
      id: `sku-${subjectIndex}-${role}-${ratio.replace(':', '-')}`,
      title: `${subject} · ${zh ? role === 'main' ? '主图' : '场景图' : role === 'main' ? 'Main image' : 'Scene image'} · ${ratio}`,
      prompt: zh
        ? `商品：${subject}。${role === 'main' ? '白底电商主图，柔和影棚光。' : '与品牌风格统一的生活场景图。'}依据实际商品参考图保留结构、颜色、Logo 和包装文字；缺少参考图时不得生成。画幅 ${ratio}。用户要求：${input.brief || '待补充商品信息和视觉要求。'}`
        : `Product: ${subject}. ${role === 'main' ? 'White-background listing image, soft studio lighting.' : 'Lifestyle scene in a consistent brand style.'} Preserve the real reference product structure, color, logo and packaging text. Do not generate without product references. Ratio ${ratio}. Brief: ${input.brief || 'Product details and direction are pending.'}`,
      model: demoModels.image, subject, ratio,
    }))));
  }
  return Array.from({ length: input.shots }, (_, index) => ({
    id: `shot-${index + 1}`,
    title: `${zh ? '镜头' : 'Shot'} ${index + 1} · ${input.subjects[0]}`,
    prompt: zh
      ? `镜头 ${index + 1}/${input.shots}，待编写并确认分镜。角色：${input.subjects.join('、')}。故事与风格要求：${input.brief || '待提供故事。'}。使用已采用的角色参考图，保持面部、发型、服装一致。先确认静态分镜，再生成 5 秒无声视频。`
      : `Shot ${index + 1}/${input.shots}; storyboard requires writing and approval. Characters: ${input.subjects.join(', ')}. Story and style: ${input.brief || 'Story pending.'} Use approved character references; preserve face, hair and clothing. Approve the still before generating a 5-second silent video.`,
    model: `${demoModels.image} → ${demoModels.video}`, subject: input.subjects[0], ratio: input.ratios[0],
  }));
}

export type DemoRun = { id: string; stepId: string; referenceId: string; prompt: string; status: 'processing' | 'succeeded' | 'failed'; generationId: string; createdAt: string; url?: string; assetId?: string; error?: string };
