import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDeliveryMatrix, deliveryPackage, type DeliveryCard, type DeliveryColumn } from './ecommerce-delivery';

const white = 'sku-aaaaaaaaaaaaaaaa';
const black = 'sku-bbbbbbbbbbbbbbbb';
const columns: DeliveryColumn[] = [
  { sku: '白色', prefix: white, product: "Nike Air Force 1 '07" },
  { sku: '黑色', prefix: black, product: "Nike Air Force 1 '07" },
];

function cards(entries: DeliveryCard[]) {
  return Object.fromEntries(entries.map(card => [card.id, card]));
}

test('delivery lines scenes up by description and keeps the latest successful output', () => {
  const matrix = buildDeliveryMatrix(columns, cards([
    { id: `${white}-adopted-main`, kind: 'asset', assetId: 'main-w', url: '/w-main.png', aspectRatio: '1:1' },
    { id: `${black}-adopted-main`, kind: 'asset', assetId: 'main-b', url: '/b-main.png' },
    { id: `${white}-scene-grass-image`, kind: 'generation', name: '白色 · 场景' },
    { id: `${white}-scene-grass-brief`, kind: 'text', textContent: '草地' },
    { id: `${white}-old`, kind: 'output', status: 'succeeded', assetId: 'old', url: '/old.png', sourceConfigCardId: `${white}-scene-grass-image` },
    { id: `${white}-new`, kind: 'output', status: 'succeeded', assetId: 'grass-w', url: '/grass-w.png', sourceConfigCardId: `${white}-scene-grass-image`, aspectRatio: '4:5' },
    { id: `${white}-failed`, kind: 'output', status: 'failed', assetId: 'nope', url: '/nope.png', sourceConfigCardId: `${white}-scene-grass-image` },
    { id: `${black}-scene-grass-image`, kind: 'generation', name: '黑色 · 场景' },
    { id: `${black}-scene-grass-brief`, kind: 'text', textContent: '草地' },
    { id: `${white}-scene-city-image`, kind: 'generation', name: '白色 · 场景' },
    { id: `${white}-scene-city-brief`, kind: 'text', textContent: '城市街头' },
    { id: `${white}-city`, kind: 'output', status: 'succeeded', assetId: 'city-w', url: '/city-w.png', sourceConfigCardId: `${white}-scene-city-image` },
    { id: `${black}-scene-lawn-image`, kind: 'generation', name: '黑色 · 场景' },
    { id: `${black}-scene-lawn-brief`, kind: 'text', textContent: '户外草地' },
  ]));
  assert.equal(matrix.product, "Nike Air Force 1 '07");
  assert.deepEqual(matrix.rows.map(row => row.scene), ['', '草地', '城市街头', '户外草地']);
  const grass = matrix.rows[1];
  assert.equal(grass.cells[0].url, '/grass-w.png');
  assert.equal(grass.cells[0].assetId, 'grass-w');
  assert.equal(grass.cells[1].missing, true);
  assert.equal(matrix.rows[2].cells[1].missing, true);
  assert.equal(matrix.rows[3].cells[0].missing, true);
  assert.equal(matrix.rows[0].cells[1].ratio, '1:1');
});

test('a second scene with the same description on one SKU stays on its own row', () => {
  const matrix = buildDeliveryMatrix([{ sku: '白色', prefix: white, product: 'AF1' }], cards([
    { id: `${white}-scene-one-image`, kind: 'generation', name: '白色 · 场景' },
    { id: `${white}-scene-one-brief`, kind: 'text', textContent: '城市街头' },
    { id: `${white}-scene-two-image`, kind: 'generation', name: '白色 · 场景' },
    { id: `${white}-scene-two-brief`, kind: 'text', textContent: '城市街头' },
  ]));
  assert.equal(matrix.rows.filter(row => row.scene === '城市街头').length, 2);
  assert.equal(matrix.rows[2].key, `${'城市街头'}#${white}-scene-two-image`);
});

test('the manifest lists current images and adds resized copies only when they are passed in', () => {
  const matrix = buildDeliveryMatrix(columns, cards([
    { id: `${white}-adopted-main`, kind: 'asset', assetId: 'main-w', url: '/w-main.png' },
    { id: `${white}-scene-city-image`, kind: 'generation', name: '白色 · 城市/街头' },
    { id: `${white}-scene-city-brief`, kind: 'text', textContent: '城市/街头' },
    { id: `${white}-city`, kind: 'output', status: 'succeeded', assetId: 'city-w', url: '/city-w.png', sourceConfigCardId: `${white}-scene-city-image` },
  ]));
  const plain = deliveryPackage(matrix);
  assert.deepEqual(plain.files.map(file => file.relativePath), ['白色/主图_1x1.png', '白色/城市-街头_4x5.png']);
  assert.equal(plain.csvPath, "Nike Air Force 1 '07/清单.csv");
  assert.ok(plain.csv.startsWith('\uFEFF商品,SKU,类型,场景名,画幅,处理方式,风格,文件名\n'));
  assert.ok(plain.csv.includes(",主图,,1:1,原图,原图,白色/主图_1x1.png"));
  const packed = deliveryPackage(matrix, [
    { id: 'old-size', url: '/old.png', sourceAssetId: 'not-current', ratio: '9:16', mode: 'pad' },
    { id: 'size-1', url: '/size-1.png', sourceAssetId: 'main-w', ratio: '3:4', mode: 'crop' },
    { id: 'size-2', url: '/size-2.png', sourceAssetId: 'main-w', ratio: '3:4', mode: 'crop' },
  ]);
  assert.deepEqual(packed.files.map(file => file.relativePath), ['白色/主图_1x1.png', '白色/主图_3x4_居中裁剪.png', '白色/城市-街头_4x5.png']);
  assert.equal(packed.files[1].url, '/size-2.png');
  assert.ok(packed.csv.includes('居中裁剪,原图,白色/主图_3x4_居中裁剪.png'));
  const withStyle = deliveryPackage(matrix, [], [{ id: 'warm', url: '/warm.png', sourceAssetId: 'main-w', preset: 'warm' }]);
  assert.ok(withStyle.files.some(file => file.relativePath === '白色/主图_1x1_暖色棚拍.png'));
  assert.ok(withStyle.csv.includes('原图,暖色棚拍,白色/主图_1x1_暖色棚拍.png'));
});

test('filenames that sanitise to the same name get a numeric suffix', () => {
  const matrix = buildDeliveryMatrix([{ sku: '白/色', prefix: white, product: '' }], cards([
    { id: `${white}-scene-one-image`, kind: 'generation', name: '白/色 · a/b' },
    { id: `${white}-scene-one-brief`, kind: 'text', textContent: 'a/b' },
    { id: `${white}-one`, kind: 'output', status: 'succeeded', assetId: 'one', url: '/one.png', sourceConfigCardId: `${white}-scene-one-image` },
    { id: `${white}-scene-two-image`, kind: 'generation', name: '白/色 · a:b' },
    { id: `${white}-scene-two-brief`, kind: 'text', textContent: 'a:b' },
    { id: `${white}-two`, kind: 'output', status: 'succeeded', assetId: 'two', url: '/two.png', sourceConfigCardId: `${white}-scene-two-image` },
  ]));
  const packed = deliveryPackage(matrix);
  assert.deepEqual(packed.files.map(file => file.path), ['白-色/a-b_4x5.png', '白-色/a-b_4x5-2.png']);
  assert.equal(packed.csvPath, '清单.csv');
});
