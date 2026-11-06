import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { emptyOrganizationDocument } from '@/core/organization/organization-document';

import {
  ProjectOrganizationPanel,
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
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, 3);
});

test('an empty asset list does not show select all', () => {
  const html = renderToStaticMarkup(
    createElement(ProjectOrganizationPanel, {
      document: emptyOrganizationDocument(),
      revision: 0,
      assets: [],
      onApply: () => undefined,
    })
  );
  assert.equal((html.match(/aria-label="Select all"/g) ?? []).length, 0);
});
