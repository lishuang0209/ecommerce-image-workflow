import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { emptyOrganizationDocument } from '@/core/organization/organization-document';

import {
  ProjectOrganizationPanel,
  folderNameTaken,
  toggleVisibleSelection,
} from './project-organization-panel';

test('select all adds every listed asset and clears only those assets', () => {
  assert.deepEqual(toggleVisibleSelection(['kept'], ['a', 'b']), [
    'kept',
    'a',
    'b',
  ]);
  assert.deepEqual(toggleVisibleSelection(['kept', 'a'], ['a', 'b']), [
    'kept',
    'a',
    'b',
  ]);
  assert.deepEqual(toggleVisibleSelection(['kept', 'a', 'b'], ['a', 'b']), [
    'kept',
  ]);
  assert.deepEqual(toggleVisibleSelection(['kept'], []), ['kept']);
});

test('a new folder name cannot repeat a root folder', () => {
  const folders = [
    { id: 'shoes', name: '鞋子品类', parentId: null },
    { id: 'child', name: '鞋子品类', parentId: 'shoes' },
  ];
  assert.equal(folderNameTaken(folders, ' 鞋子品类 ', null), true);
  assert.equal(folderNameTaken(folders, '鞋子品类', 'shoes'), true);
  assert.equal(folderNameTaken(folders, '鞋子品类', 'shoes', 'child'), false);
  assert.equal(folderNameTaken(folders, '鞋子品类', null, 'shoes'), false);
  assert.equal(folderNameTaken(folders, '   ', null), false);
});

test('the asset list offers one select-all control for the listed files', () => {
  const html = renderToStaticMarkup(
    createElement(ProjectOrganizationPanel, {
      document: emptyOrganizationDocument(),
      revision: 0,
      assets: [
        { id: 'a', type: 'image', filename: 'one.jpg' },
        { id: 'b', type: 'image', filename: 'two.jpg' },
      ],
      onApply: () => undefined,
    })
  );
  assert.equal((html.match(/aria-label="Select all"/g) ?? []).length, 1);
  assert.equal((html.match(/aria-label="View"/g) ?? []).length, 1);
  assert.equal((html.match(/aria-label="Search scope"/g) ?? []).length, 0);
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, 3);
});

test('an empty asset list keeps select all disabled', () => {
  const html = renderToStaticMarkup(
    createElement(ProjectOrganizationPanel, {
      document: emptyOrganizationDocument(),
      revision: 0,
      assets: [],
      onApply: () => undefined,
    })
  );
  const selectAll =
    html.match(/<input\b[^>]*aria-label="Select all"[^>]*>/)?.[0] ?? '';
  assert.match(selectAll, /disabled=""/);
});
