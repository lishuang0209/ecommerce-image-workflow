/** Delivery sizes for the MVP. Deterministic local processing: no model call and no cost. */
export const resizeTargets = {
  '1:1': [1080, 1080],
  '4:5': [1080, 1350],
  '3:4': [1080, 1440],
  '2:3': [1080, 1620],
  '9:16': [1080, 1920],
  '3:2': [1620, 1080],
  '4:3': [1440, 1080],
  '16:9': [1920, 1080],
} as const;
export type ResizeRatio = keyof typeof resizeTargets;
export const resizeRatios = Object.keys(resizeTargets) as ResizeRatio[];
export type ResizeMode = 'crop' | 'pad';

/** Largest aspect-ratio gap a scene image may be centre-cropped across; beyond it the product could be cut off. */
export const AUTO_CROP_LIMIT = 1.15;
/** Auto mode: main images keep the whole picture with margins; scenes crop only for small ratio changes, otherwise pad. */
export function autoResizeMode(task: string, sourceWidth: number, sourceHeight: number, ratio: ResizeRatio): ResizeMode {
  if (task === 'main') return 'pad';
  const [width, height] = resizeTargets[ratio];
  const gap = Math.max((sourceWidth / sourceHeight) / (width / height), (width / height) / (sourceWidth / sourceHeight));
  return gap <= AUTO_CROP_LIMIT ? 'crop' : 'pad';
}
