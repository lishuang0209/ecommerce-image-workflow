import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('./beatcanvas-card-connector-overlay.tsx', import.meta.url),
  'utf8'
);

test('connector create menu shortens only the visible upload label', () => {
  assert.match(source, /aria-label=\{labels\.uploadImageLabel\}/);
  assert.match(source, /\{labels\.connectorUploadLabel\}/);
});

test('connector ports include text cards and a drop anywhere on the card connects', () => {
  assert.match(source, /TEXT_CARD_NODE_TYPE/);
  assert.match(source, /targetCard && drag\.sourceSide === 'output'/);
});

test('blank canvas opens the create menu from double-click, slash, and context menu', () => {
  assert.match(source, /dblclick/);
  assert.match(source, /contextmenu/);
  assert.match(source, /event\.key !== '\/'/);
});
