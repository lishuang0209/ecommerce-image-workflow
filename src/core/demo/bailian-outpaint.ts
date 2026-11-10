import { PaidSubmissionRejectedError, isDefiniteSubmissionRejection, type PaidSubmissionHooks } from './paid-submission';
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getBeatDesignDataRoot } from '@/config/data-root';
import { getConfig } from '@/modules/config/service';
import { isSupportedRasterImage } from '@/lib/image-upload-validation';
import { bailianOrigin, bailianOutputUrl, downloadBailianOutput } from './bailian-image';
import { isExpandRatio } from './image-expand';
import { resizeTargets, type ResizeRatio } from './image-resize-targets';

const codeOf = (value: unknown) => String(value || 'unknown').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 80);

/**
 * Extends one image to a target ratio with Bailian's outpainting model. The source stays centred; only the
 * new margin is generated. `output_ratio` is the whole request, so this never crops and never redraws the product.
 */
export async function outpaintBailianImage({ bytes, mimeType, ratio }: { bytes: Uint8Array; mimeType: string; ratio: ResizeRatio }, deps?: { fetch?: typeof fetch; key?: string; origin?: string }, submission?: PaidSubmissionHooks) {
  if (!isExpandRatio(ratio)) throw new Error('This ratio cannot be expanded. Use crop or pad.');
  const key = deps?.key ?? await getConfig('BAILIAN_API_KEY');
  if (!key) throw new Error('Save your Bailian API key first.');
  const origin = bailianOrigin(deps?.origin ?? ((await getConfig('BAILIAN_API_BASE_URL')) || 'https://dashscope.aliyuncs.com'));
  const fetcher = deps?.fetch ?? fetch;
  await submission?.beforeSubmit();
  const submit = await fetcher(`${origin}/api/v1/services/aigc/image2image/out-painting`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, 'X-DashScope-Async': 'enable' },
    body: JSON.stringify({ model: 'image-out-painting', input: { image_url: `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}` }, parameters: { output_ratio: ratio, add_watermark: false, best_quality: false, limit_image_size: true } }),
    signal: AbortSignal.timeout(60_000),
  });
  const submitted = await submit.json();
  if (!submit.ok || submitted.code) throw new (isDefiniteSubmissionRejection(submit.status, submitted.output) ? PaidSubmissionRejectedError : Error)(`Bailian expand failed (${submit.status}, ${codeOf(submitted.code)}).`);
  const taskId = String(submitted.output?.task_id || '').replace(/[^a-zA-Z0-9-]/g, '');
  if (!taskId) throw new Error('Bailian expand returned no task.');
  const deadline = Date.now() + 180_000;
  let result = submitted;
  while (Date.now() < deadline) {
    const status = String(result.output?.task_status || '');
    if (status === 'SUCCEEDED' || status === 'FAILED') break;
    await new Promise(resolveDelay => setTimeout(resolveDelay, 2_000));
    const polled = await fetcher(`${origin}/api/v1/tasks/${taskId}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30_000) });
    result = await polled.json();
    if (!polled.ok || result.code) throw new Error(`Bailian expand failed (${polled.status}, ${codeOf(result.code)}).`);
  }
  if (result.output?.task_status !== 'SUCCEEDED') throw new Error(`Bailian expand failed (${codeOf(result.output?.task_status || 'timeout')}).`);
  if (!deps) {
    const receiptRoot = resolve(getBeatDesignDataRoot(), 'bailian-receipts');
    await mkdir(receiptRoot, { recursive: true, mode: 0o700 });
    await writeFile(resolve(receiptRoot, `${taskId}.json`), JSON.stringify(result), { mode: 0o600 });
  }
  const image = result.output?.output_image_url || result.output?.results?.find((item: { url?: string }) => item.url)?.url;
  if (!image) throw new Error('Bailian expand returned no image.');
  bailianOutputUrl(image);
  const downloaded = await downloadBailianOutput(image, fetcher);
  const raster = (['image/png', 'image/jpeg', 'image/webp'] as const).find(mime => isSupportedRasterImage(mime, downloaded));
  if (!raster) throw new Error('Invalid expanded image.');
  const [width, height] = resizeTargets[ratio];
  const meta = await sharp(downloaded).metadata();
  const got = (meta.width || 1) / (meta.height || 1);
  if (Math.abs(got - width / height) / (width / height) > 0.03) throw new Error('Expanded image ratio did not match the request.');
  const fitted = await sharp(downloaded).resize(width, height, { fit: 'fill' }).png().toBuffer();
  return { bytes: fitted, width, height, requestId: String(result.request_id || taskId) };
}
