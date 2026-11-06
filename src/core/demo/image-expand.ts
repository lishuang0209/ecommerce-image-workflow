import { resizeTargets, type ResizeRatio } from './image-resize';

/** The outpainting model keeps the source centred and refuses more than a 3× extension on either axis. */
export const EXPAND_SCALE_LIMIT = 3;
export const MAX_EXPAND_IMAGES = 8;

/**
 * Scales that turn the source into the target ratio without cropping. Null when the source is already
 * that ratio, so the caller must not spend a model call. Throws when the gap exceeds the model limit.
 */
export function expandScales(width: number, height: number, ratio: ResizeRatio) {
  if (width < 512 || height < 512 || width > 4096 || height > 4096) throw new Error('Expand needs an image between 512 and 4096 pixels on each side.');
  const [targetWidth, targetHeight] = resizeTargets[ratio];
  const source = width / height;
  const target = targetWidth / targetHeight;
  if (Math.abs(source - target) / target < 0.02) return null;
  const round = (value: number) => Math.round(value * 100) / 100;
  const xScale = source < target ? round(target / source) : 1;
  const yScale = source > target ? round(source / target) : 1;
  if (xScale > EXPAND_SCALE_LIMIT || yScale > EXPAND_SCALE_LIMIT) throw new Error('This ratio needs more than a 3× expansion, which the model does not allow.');
  return { xScale, yScale };
}
