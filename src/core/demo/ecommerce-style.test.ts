import test from 'node:test';
import assert from 'node:assert/strict';
import { nearestStyleFrame, stylePrompt } from './ecommerce-style-presets';

test('a style prompt changes only the background and forbids redrawing the product', () => {
  const prompt = stylePrompt('warm');
  assert.match(prompt, /暖米色纯色/);
  assert.match(prompt, /无道具/);
  assert.match(prompt, /不同颜色必须使用相同的背景颜色/);
  assert.match(prompt, /禁止改变商品的颜色/);
  assert.match(prompt, /禁止插画/);
  assert.match(stylePrompt('dark'), /深炭灰纯色/);
  assert.match(stylePrompt('festive'), /不得出现礼盒/);
  assert.throws(() => stylePrompt('poster' as 'warm'), /Choose a style/);
});

test('style changes keep the closest frame instead of switching ratio', () => {
  assert.equal(nearestStyleFrame(1024, 1024), '1:1');
  assert.equal(nearestStyleFrame(1024, 1280), '4:5');
  assert.equal(nearestStyleFrame(1080, 1920), '9:16');
  assert.equal(nearestStyleFrame(1920, 1080), '16:9');
});
