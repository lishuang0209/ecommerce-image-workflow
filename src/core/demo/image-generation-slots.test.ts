import test from 'node:test';
import assert from 'node:assert/strict';
import { concurrentImageLimit, releaseImageGeneration, reserveImageGeneration } from './image-generation-slots';

test('image generation keeps two slots and refuses a third until one finishes', () => {
  const held = [];
  try {
    assert.equal(concurrentImageLimit, 2);
    assert.equal(reserveImageGeneration(), true);
    assert.equal(reserveImageGeneration(), true);
    held.push(true, true);
    assert.equal(reserveImageGeneration(), false);
    releaseImageGeneration();
    held.pop();
    assert.equal(reserveImageGeneration(), true);
    held.push(true);
  } finally {
    while (held.pop()) releaseImageGeneration();
  }
});
