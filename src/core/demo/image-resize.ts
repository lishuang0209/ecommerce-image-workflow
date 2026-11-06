import sharp, { type Sharp } from 'sharp';
import { resizeTargets, type ResizeMode, type ResizeRatio } from './image-resize-targets';

export { AUTO_CROP_LIMIT, autoResizeMode, resizeRatios, resizeTargets, type ResizeMode, type ResizeRatio } from './image-resize-targets';

async function hasWhiteBorder(bytes: Uint8Array) {
  const { data, info } = await sharp(bytes).resize(16, 16, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (x !== 0 && y !== 0 && x !== info.width - 1 && y !== info.height - 1) continue;
    const at = (y * info.width + x) * info.channels;
    if (data[at] < 242 || data[at + 1] < 242 || data[at + 2] < 242) return false;
  }
  return true;
}

/**
 * crop: centred cover crop. pad: the whole image is kept; a white-background image gets white margins,
 * any other image gets a blurred copy of itself as the margin.
 */
export async function resizeToRatio({ bytes, ratio, mode }: { bytes: Uint8Array; ratio: ResizeRatio; mode: ResizeMode }) {
  const target = resizeTargets[ratio];
  if (!target) throw new Error('Unsupported target ratio.');
  const [width, height] = target;
  let pipeline: Sharp;
  if (mode === 'crop') {
    pipeline = sharp(bytes).rotate().resize(width, height, { fit: 'cover', position: 'centre' });
  } else if (await hasWhiteBorder(bytes)) {
    pipeline = sharp(bytes).rotate().resize(width, height, { fit: 'contain', background: '#ffffff' }).flatten({ background: '#ffffff' });
  } else {
    const background = await sharp(bytes).rotate().resize(width, height, { fit: 'cover' }).blur(30).toBuffer();
    const foreground = await sharp(bytes).rotate().resize(width, height, { fit: 'inside' }).toBuffer();
    pipeline = sharp(background).composite([{ input: foreground, gravity: 'centre' }]);
  }
  const output = await pipeline.png().toBuffer();
  return { bytes: output, width, height };
}

