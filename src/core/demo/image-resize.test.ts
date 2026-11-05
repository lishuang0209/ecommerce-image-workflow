import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { resizeToRatio, resizeTargets, type ResizeRatio } from './image-resize';

const whiteMain = () => sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#ffffff' } })
  .composite([{ input: { create: { width: 400, height: 200, channels: 3, background: '#000000' } }, left: 312, top: 412 }]).png().toBuffer();
const greenScene = () => sharp({ create: { width: 1024, height: 1280, channels: 3, background: '#2f6f2f' } })
  .composite([{ input: { create: { width: 300, height: 300, channels: 3, background: '#ffffff' } }, left: 362, top: 490 }]).png().toBuffer();
const pixel = async (bytes: Uint8Array, x: number, y: number) => {
  const { data, info } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (y * info.width + x) * info.channels;
  return [data[at], data[at + 1], data[at + 2]];
};

test('every target ratio produces the exact delivery size in both modes', async () => {
  for (const ratio of Object.keys(resizeTargets) as ResizeRatio[]) for (const mode of ['crop', 'pad'] as const) {
    const out = await resizeToRatio({ bytes: await whiteMain(), ratio, mode });
    const meta = await sharp(out.bytes).metadata();
    assert.deepEqual([meta.width, meta.height], [...resizeTargets[ratio]]);
  }
});

test('padding a white-background main image keeps the whole product and adds pure white margins', async () => {
  const out = await resizeToRatio({ bytes: await whiteMain(), ratio: '9:16', mode: 'pad' });
  assert.deepEqual(await pixel(out.bytes, 5, 5), [255, 255, 255]);
  assert.deepEqual(await pixel(out.bytes, 540, 960), [0, 0, 0]);
  assert.deepEqual(await pixel(out.bytes, 540, 20), [255, 255, 255]);
});

test('padding a scene image uses a blurred copy as the margin instead of white', async () => {
  const out = await resizeToRatio({ bytes: await greenScene(), ratio: '9:16', mode: 'pad' });
  const [r, g, b] = await pixel(out.bytes, 540, 20);
  assert.ok(g > r && g > b && g > 80, 'margin follows the scene colour');
});

test('centre crop keeps the centred subject and drops the edges', async () => {
  const out = await resizeToRatio({ bytes: await greenScene(), ratio: '1:1', mode: 'crop' });
  assert.deepEqual(await pixel(out.bytes, 540, 540), [255, 255, 255]);
});

test('unsupported ratios are rejected', async () => {
  await assert.rejects(async () => resizeToRatio({ bytes: await whiteMain(), ratio: '5:7' as ResizeRatio, mode: 'crop' }), /Unsupported/);
});
