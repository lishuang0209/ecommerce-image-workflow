import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bailianOrigin } from './bailian-image';

test('Bailian credentials may only be sent to the configured official Beijing origin', () => {
  assert.equal(bailianOrigin('https://dashscope.aliyuncs.com'), 'https://dashscope.aliyuncs.com');
  assert.equal(bailianOrigin('https://workspace-123.cn-beijing.maas.aliyuncs.com/'), 'https://workspace-123.cn-beijing.maas.aliyuncs.com');
  for (const url of ['http://dashscope.aliyuncs.com', 'https://dashscope.aliyuncs.com.evil.test', 'https://evil.test', 'https://user:pass@dashscope.aliyuncs.com', 'https://dashscope.aliyuncs.com:444', 'https://dashscope.aliyuncs.com/path', 'https://dashscope.aliyuncs.com?key=x', 'https://dashscope.aliyuncs.com/#x']) assert.throws(() => bailianOrigin(url));
});
