/** Background and light only. The product itself is a hard constraint in the prompt, not a pixel mask. */
export const stylePresets = {
  daylight: '背景为干净的自然日光环境，光线柔和均匀。',
  warm: '背景为暖色棚拍，柔和暖光。',
  cool: '背景为冷色棚拍，干净冷光。',
  gray: '背景为浅灰色简约棚拍，光线均匀。',
  dark: '背景为深色，用柔和轮廓光把商品分开，不改变商品颜色。',
  festive: '背景为节庆暖光氛围，不添加文字，道具不得遮挡商品。',
} as const;
export type StylePreset = keyof typeof stylePresets;
export const stylePresetIds = Object.keys(stylePresets) as StylePreset[];
export const MAX_STYLE_IMAGES = 8;
const styleLabels: Record<StylePreset, string> = { daylight: '自然日光', warm: '暖色棚拍', cool: '冷色棚拍', gray: '浅灰简约', dark: '深色背景', festive: '节日暖光' };
export const styleLabel = (preset: string) => stylePresetIds.includes(preset as StylePreset) ? styleLabels[preset as StylePreset] : '';

const frames = { '1:1': 1, '4:5': 0.8, '3:4': 0.75, '2:3': 2 / 3, '9:16': 9 / 16, '3:2': 1.5, '4:3': 4 / 3, '16:9': 16 / 9 } as const;
export type StyleFrame = keyof typeof frames;

/** Closest ratio the image model can emit, so a style change does not also switch the frame. */
export function nearestStyleFrame(width: number, height: number): StyleFrame {
  const aspect = width > 0 && height > 0 ? width / height : 1;
  return (Object.keys(frames) as StyleFrame[]).reduce((best, ratio) => Math.abs(Math.log(aspect / frames[ratio])) < Math.abs(Math.log(aspect / frames[best])) ? ratio : best, '1:1');
}

export function stylePrompt(preset: StylePreset) {
  const instruction = stylePresets[preset];
  if (!instruction) throw new Error('Choose a style.');
  return ['只改变背景和光线，严格保持商品不变。', `风格：${instruction}`, '禁止改变商品的颜色、外形、数量、朝向、Logo、文字和结构。禁止插画、卡通、更换商品、添加水印或额外文字。商品仍居中，构图与参考图一致。'].join('\n');
}
