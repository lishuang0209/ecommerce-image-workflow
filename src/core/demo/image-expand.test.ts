import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { expandScales } from './image-expand';
import { outpaintBailianImage } from './bailian-outpaint';

test('expansion scales keep the whole picture and skip an image that already matches', () => {
  assert.deepEqual(expandScales(1024, 1024, '3:4'), { xScale: 1, yScale: 1.33 });
  assert.deepEqual(expandScales(1024, 1024, '9:16'), { xScale: 1, yScale: 1.78 });
  assert.deepEqual(expandScales(1024, 1280, '1:1'), { xScale: 1.25, yScale: 1 });
  assert.equal(expandScales(1080, 1440, '3:4'), null);
  assert.throws(() => expandScales(4000, 1000, '9:16'), /3×/);
  assert.throws(() => expandScales(200, 200, '1:1'), /512/);
});

test('outpainting asks for the ratio, refuses a watermark, and only downloads an official result', async () => {
  const png = await sharp({ create: { width: 888, height: 1184, channels: 3, background: '#224466' } }).png().toBuffer();
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchMock: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/out-painting')) return new Response(JSON.stringify({ output: { task_id: 'task-1', task_status: 'PENDING' } }), { status: 200 });
    if (String(url).endsWith('/tasks/task-1')) return new Response(JSON.stringify({ request_id: 'req-1', output: { task_status: 'SUCCEEDED', output_image_url: 'https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/out.png' } }), { status: 200 });
    return new Response(png, { status: 200 });
  };
  const result = await outpaintBailianImage({ bytes: png, mimeType: 'image/png', ratio: '3:4' }, { fetch: fetchMock, key: 'test-key', origin: 'https://dashscope.aliyuncs.com' });
  const body = JSON.parse(String(calls[0].init?.body));
  assert.equal(body.parameters.output_ratio, '3:4');
  assert.equal(body.parameters.add_watermark, false);
  assert.equal(new Headers(calls[0].init?.headers).get('X-DashScope-Async'), 'enable');
  assert.equal(new Headers(calls[0].init?.headers).get('Authorization'), 'Bearer test-key');
  assert.equal(calls[1].url, 'https://dashscope.aliyuncs.com/api/v1/tasks/task-1');
  assert.equal(result.width, 1080);
  assert.equal(result.height, 1440);
  await assert.rejects(() => outpaintBailianImage({ bytes: png, mimeType: 'image/png', ratio: '3:4' }, {
    fetch: async () => new Response(JSON.stringify({ output: { task_id: 'task-2', task_status: 'SUCCEEDED', output_image_url: 'https://evil.test/out.png' } }), { status: 200 }),
    key: 'test-key', origin: 'https://dashscope.aliyuncs.com',
  }), /Unexpected Bailian output host/);
});
