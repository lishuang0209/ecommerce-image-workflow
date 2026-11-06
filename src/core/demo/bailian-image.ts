import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getBeatDesignDataRoot } from '@/config/data-root';
import { getConfig } from '@/modules/config/service';
import { isSupportedRasterImage } from '@/lib/image-upload-validation';

export function bailianOrigin(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash || !(url.hostname === 'dashscope.aliyuncs.com' || /^[a-zA-Z0-9-]+\.cn-beijing\.maas\.aliyuncs\.com$/.test(url.hostname))) throw new Error('Invalid Bailian endpoint.');
  return url.origin;
}
/** Official result objects only. Redirects are refused so a download cannot leave the result host. */
export function bailianOutputUrl(image: string) {
  const url = new URL(image);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !/^[a-z0-9-]+\.oss-[a-z0-9-]+\.aliyuncs\.com$/.test(url.hostname)) throw new Error(`Unexpected Bailian output host: ${url.hostname}`);
  return url;
}
export async function downloadBailianOutput(image: string, fetcher: typeof fetch = fetch) {
  const download = await fetcher(bailianOutputUrl(image), { redirect: 'error', signal: AbortSignal.timeout(120000) });
  if (!download.ok || Number(download.headers.get('content-length')) > 20 * 1024 * 1024) throw new Error('Unable to download image.');
  const chunks: Uint8Array[] = []; let length = 0;
  if (!download.body) throw new Error('Empty image.');
  const reader = download.body.getReader();
  try { while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 20 * 1024 * 1024) { await reader.cancel(); throw new Error('Image exceeds size limit.'); } chunks.push(value); } } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
export async function generateBailianImage({ bytes, mimeType, prompt, ratio, references, quality }: { bytes?: Uint8Array; mimeType?: string; prompt: string; ratio: string; references?: { bytes: Uint8Array; mimeType: string }[]; quality?: string }) {
  const key = await getConfig('BAILIAN_API_KEY');
  if (!key) throw new Error('Save your Bailian API key first.');
  const origin = bailianOrigin(await getConfig('BAILIAN_API_BASE_URL') || 'https://dashscope.aliyuncs.com');
  const dimensions: Record<string, string> = { '1:1': '1024*1024', '4:5': '1024*1280', '9:16': '768*1360', '16:9': '1360*768', '4:3': '1184*888', '3:4': '888*1184', '3:2': '1248*832', '2:3': '832*1248' };
  if (!dimensions[ratio]) throw new Error('Choose a supported explicit aspect ratio.');
  const size = dimensions[ratio];
  if (quality && quality !== '1k') throw new Error('Bailian MVP currently supports 1k output only.');
  const images = references || (bytes && mimeType ? [{ bytes, mimeType }] : []);
  if (!images.length || images.length > 10) throw new Error('Connect 1–10 image references.');
  const response = await fetch(`${origin}/api/v1/services/aigc/multimodal-generation/generation`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: 'qwen-image-2.1-turbo', input: { messages: [{ role: 'user', content: [...images.map(image => ({ image: `data:${image.mimeType};base64,${Buffer.from(image.bytes).toString('base64')}` })), { text: prompt }] }] }, parameters: { size, n: 1, prompt_extend: false, watermark: false } }),
    signal: AbortSignal.timeout(600000),
  });
  const result = await response.json();
  if (!response.ok || result.code) throw new Error(`Bailian request failed (${response.status}, ${String(result.code || 'unknown').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 80)}).`);
  const receiptRoot = resolve(getBeatDesignDataRoot(), 'bailian-receipts');
  await mkdir(receiptRoot, { recursive: true, mode: 0o700 });
  await writeFile(resolve(receiptRoot, `${String(result.request_id).replace(/[^a-zA-Z0-9-]/g, '')}.json`), JSON.stringify(result), { mode: 0o600 });
  const image = result.output?.choices?.[0]?.message?.content?.find((item: { image?: string }) => item.image)?.image;
  if (!image) throw new Error('Bailian returned no image.');
  const output = await downloadBailianOutput(image);
  if (!isSupportedRasterImage('image/png', output)) throw new Error('Invalid output image.');
  return { bytes: output, requestId: result.request_id, usage: result.usage };
}
