import test from 'node:test';
import assert from 'node:assert/strict';
import { updateShortfilmDesignAsset, regenerateShortfilmDesignAsset, runShortfilmStage, getShortfilmStoryboard } from './shortfilm-client';

for (const group of ['characters', 'settings'] as const) {
  test(`editing ${group} persists only the target without model execution`, async (t) => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return Response.json({ status: 'ok' });
    });
    const asset = { id: 'asset_1', name: 'Edited name', description: 'Edited description' };
    await updateShortfilmDesignAsset('session', group, asset);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /artifact\/character_design$/);
    assert.equal(calls[0].init?.method, 'PATCH');
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { [group]: [asset] });
  });

  test(`regenerating ${group} targets one item with its edited description`, async (t) => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response('data: {"status":"completed"}\n\n');
    });
    await regenerateShortfilmDesignAsset('session', group, {
      id: 'asset_1', name: 'Updated', description: 'New instructions',
    });
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /session\/intervene$/);
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
      stage: 'character_design',
      modifications: {
        [`regenerate_${group}`]: ['asset_1'],
        update_descriptions: { [group]: { asset_1: { name: 'Updated', description: 'New instructions' } } },
      },
    });
  });
}

test('failed regeneration propagates the upstream failure', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('Service unavailable', { status: 503 }));
  await assert.rejects(regenerateShortfilmDesignAsset('session', 'characters', {
    id: 'asset_1', name: 'Name', description: 'Description',
  }), /Service unavailable/);
});


test('storyboard execution forwards explicit regeneration and retrieves the artifact', async (t) => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return url.endsWith('/artifact/storyboard')
      ? Response.json({ artifact: { episodes: [{ episode_number: 1, segments: [] }] } })
      : new Response('data: {"status":"completed"}\n\n');
  });
  await runShortfilmStage('session', 'storyboard', 300_000, { regenerate: true });
  assert.match(calls[0].url, /execute\/storyboard$/);
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { regenerate: true });
  const artifact = await getShortfilmStoryboard('session');
  assert.equal(artifact.episodes?.[0].episode_number, 1);
});
