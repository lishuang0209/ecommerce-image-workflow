import assert from 'node:assert/strict';
import test from 'node:test';
import { projectCoverCandidates } from './project-cover-candidates';

test('cover candidates collapse content copies and preserve the saved selection and order', () => {
  const images = [
    { id: 'new', sha256: 'same', publicUrl: '/new' },
    { id: 'other', sha256: 'different', publicUrl: '/other' },
    { id: 'saved', sha256: 'same', publicUrl: '/saved' },
  ];
  assert.deepEqual(projectCoverCandidates(images).map((x) => x.id), ['new', 'other']);
  assert.deepEqual(projectCoverCandidates(images, 'saved').map((x) => x.id), ['saved', 'other']);
  assert.equal(images.length, 3);
});

test('legacy files use their URL, repeated uploads use their ID, distinct images remain', () => {
  const images = [
    { id: 'upload', publicUrl: '/upload' },
    { id: 'upload', publicUrl: '/upload', sha256: 'hash' },
    { id: 'legacy', publicUrl: '/upload' },
    { id: 'other', publicUrl: '/other' },
  ];
  assert.deepEqual(projectCoverCandidates(images).map((x) => x.id), ['upload', 'other']);
});
