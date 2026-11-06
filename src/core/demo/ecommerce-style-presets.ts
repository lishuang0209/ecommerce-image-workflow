/** Background and light only. The product itself is a hard constraint in the prompt, not a pixel mask. */
export const stylePresets = {
  daylight: '背景为均匀的浅灰白纯色，无纹理、无渐变、无道具。光线是柔和的自然日光，从上方略偏前照射，阴影轻而边缘干净。',
  warm: '背景为均匀的暖米色纯色，无纹理、无渐变、无道具。光线是柔和的暖白棚灯，从上方略偏前照射，阴影轻。',
  cool: '背景为均匀的冷灰蓝纯色，无纹理、无渐变、无道具。光线是干净的冷白棚灯，从上方略偏前照射，阴影轻。',
  gray: '背景为均匀的浅灰色纯色，无纹理、无渐变、无道具。光线中性、均匀，阴影很轻。',
  dark: '背景为均匀的深炭灰纯色，无纹理、无渐变、无道具。用柔和轮廓光把商品与背景分开，商品本身的颜色保持不变。',
  festive: '背景为均匀的暖金色纯色，无纹理。光线是柔和的暖金色节日光，允许远离商品的虚化暖色光斑。不得出现礼盒、彩灯串、飘带、文字，也不得有任何道具接触或遮挡商品。',
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
  return ['只改变背景和光线，严格保持商品不变。', `风格：${instruction}`, '同一风格下，不同颜色必须使用相同的背景颜色、光线方向和阴影强度。', '禁止改变商品的颜色、外形、数量、朝向、Logo、文字和结构。禁止插画、卡通、更换商品、添加水印或额外文字。商品仍居中，构图与参考图一致。'].join('\n');
}
