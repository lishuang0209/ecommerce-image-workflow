import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('storyboard route enforces confirmations, imports one durable card, restores state and rejects stale results', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'beatdesign-storyboard-'));
  process.env.BEATDESIGN_DATA_DIR = directory;
  execFileSync(process.execPath, ['node_modules/drizzle-kit/bin.cjs', 'push', '--force'], {
    env: process.env, stdio: 'pipe',
  });
  const { createCreativeCanvas } = await import('../demo/create-canvas');
  const { loadProjectWithLatestSnapshot } = await import('../projects/projects');
  const { readShortfilmSession, writeShortfilmSession } = await import('./shortfilm-session');
  const { Route } = await import('../../routes/api/demo/ecommerce-video');
  const { closeSqliteDb } = await import('../db/sqlite');
  // Exercise the real trusted route handlers and real Command Kernel against an isolated database.
  const handlers = (Route.options as any).server.handlers;
  const project = await createCreativeCanvas({ name: 'Storyboard test', template: 'video', locale: 'zh' });
  const session = { projectId: project.id, sessionId: 'test-session', scenario: 'ecommerce_ad' as const, createdAt: new Date().toISOString() };
  await writeShortfilmSession({ ...session, confirmedStages: ['script_generation'] });
  const status = { current_stage: 'character_design', status: {
    script_generation: 'completed', character_design: 'completed', storyboard: 'pending', reference_generation: 'pending', video_generation: 'pending', post_production: 'pending',
  } };
  let storyboard: any = {};
  let references: any = { scenes: [] };
  let videos: any = { clips: [] };
  let final: any = {};
  let finalExecutions = 0;
  let failFinal = false;
  let videoExecutions = 0;
  let failVideos = false;
  let invalidVideoDownload = false;
  const mp4 = await readFile('tests/fixtures/tiny-black.mp4');
  let referenceExecutions = 0;
  let failReferences = false;
  let executions = 0;
  let invalidOutput = false;
  let storyboardSaves = 0;
  const design = { characters: [{ id: 'cup', name: 'Cup', selected: 'code/cup.png' }], settings: [] };
  t.mock.method(globalThis, 'fetch', async (input: string, init?: RequestInit) => {
    const path = new URL(input).pathname;
    if (path === '/api/health') return Response.json({ status: 'ok' });
    if (path.endsWith('/status')) return Response.json(status);
    if (path.endsWith('/artifact/character_design')) return Response.json({ artifact: design });
    if (path.endsWith('/artifact/script_generation')) return Response.json({ artifact: { original_text: 'Ad script' } });
    if (path.endsWith('/artifact/storyboard')) {
      if (init?.method === 'PATCH') {
        storyboardSaves++;
        storyboard = { ...storyboard, ...JSON.parse(String(init.body)) };
        return Response.json({ status: 'ok', artifact: storyboard });
      }
      return Response.json({ artifact: storyboard });
    }
    if (path.endsWith('/artifact/reference_generation')) {
      if (init?.method === 'PATCH') {
        for (const patch of JSON.parse(String(init.body)).scenes) {
          const index = references.scenes.findIndex((scene: any) => scene.id === patch.id);
          if (index >= 0) references.scenes[index] = { ...references.scenes[index], ...patch };
          else references.scenes.push({ name: patch.id, ...patch });
        }
      }
      return Response.json({ artifact: references });
    }
    if (path.endsWith('/artifact/post_production')) return Response.json({ artifact: final });
    if (path.startsWith('/code/final-')) return new Response(mp4, { headers: { 'content-type': 'video/mp4' } });
    if (path.endsWith('/execute/post_production')) {
      finalExecutions++;
      status.current_stage = 'post_production';
      status.status.post_production = failFinal ? 'error' : 'completed';
      if (!failFinal) final = { final_videos: [{ episode: 1, name: 'Ad', path: `code/final-${finalExecutions}.mp4` }] };
      return new Response('data: {"status":"completed"}\n\n');
    }
    if (path.endsWith('/artifact/video_generation')) {
      if (init?.method === 'PATCH') {
        for (const patch of JSON.parse(String(init.body)).clips) {
          const index = videos.clips.findIndex((clip: any) => clip.id === patch.id);
          if (index >= 0) videos.clips[index] = { ...videos.clips[index], ...patch };
          else videos.clips.push({ name: patch.id, ...patch });
        }
      }
      return Response.json({ artifact: videos });
    }
    if (path.startsWith('/code/clip-')) return new Response(invalidVideoDownload ? 'not a video' : mp4, { headers: { 'content-type': 'video/mp4' } });
    if (path.endsWith('/intervene')) {
      const body = JSON.parse(String(init?.body));
      if (body.stage === 'video_generation') {
        assert.deepEqual(body.modifications.regenerate_clips, ['seg_01_01']);
        assert.match(videos.clips[0].description, /Take 1/);
        assert.equal(videos.clips[0].duration, 5);
        videoExecutions++;
        status.current_stage = 'video_generation';
        status.status.video_generation = 'completed';
        if (!failVideos) videos.clips = videos.clips.map((clip: any) => ({ ...clip,
          selected: clip.selected || `code/clip-${videoExecutions}.mp4`, status: 'done',
          versions: [...(clip.versions ?? []), `code/clip-${videoExecutions}.mp4`],
        }));
        return new Response('data: {"status":"completed"}\n\n');
      }
      assert.equal(body.stage, 'reference_generation');
      assert.deepEqual(body.modifications.regenerate_scenes, ['seg_01_01']);
      assert.equal(references.scenes[0].visual_prompt, '', 'outdated prompts must be cleared');
      referenceExecutions++;
      status.current_stage = 'reference_generation';
      status.status.reference_generation = 'completed';
      if (!failReferences) references.scenes = references.scenes.map((scene: any) => ({ ...scene,
        selected: scene.selected || `code/frame-${referenceExecutions}.png`, status: 'done', visual_prompt: 'New prompt',
        versions: [...(scene.versions ?? []), `code/frame-${referenceExecutions}.png`],
      }));
      return new Response('data: {"status":"completed"}\n\n');
    }
    if (path.startsWith('/code/frame-')) return new Response(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'), { headers: { 'content-type': 'image/png' } });
    if (path.endsWith('/continue')) return Response.json({ status: 'ready', next_stage: 'reference_generation' });
    if (path.endsWith('/execute/storyboard')) {
      assert.deepEqual(JSON.parse(String(init?.body)), { regenerate: true });
      executions++;
      status.current_stage = 'storyboard';
      status.status.storyboard = 'completed';
      storyboard = { episodes: [{ episode_number: 1, segments: invalidOutput ? [] : [{
        segment_id: 'seg_01_01', total_duration: 5, location: 'Office', characters: ['Cup'],
        shots: [{ shot_number: 1, duration: 5, shot_type: 'Close-up', content: `Take ${executions}` }],
      }] }] };
      return new Response('data: {"status":"completed"}\n\n');
    }
    throw new Error(`Unexpected sidecar call: ${path}`);
  });
  const post = (body: Record<string, unknown>, trusted = true) => handlers.POST({ request: new Request('http://127.0.0.1:3020/api/demo/ecommerce-video', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(trusted ? { 'x-beatapi-workspace-request': '1' } : {}) },
    body: JSON.stringify({ projectId: project.id, locale: 'zh', ...body }),
  }) }) as Promise<Response>;
  const read = async () => (await handlers.GET({ request: new Request(`http://127.0.0.1:3020/api/demo/ecommerce-video?projectId=${project.id}`) })).json();
  try {
    assert.equal((await post({ action: 'run', stage: 'storyboard' }, false)).status, 403);
    assert.equal((await post({ action: 'run', stage: 'storyboard' })).status, 409);
    assert.equal(executions, 0);
    assert.equal((await post({ action: 'run', stage: 'reference_generation' })).status, 409);
    assert.equal(referenceExecutions, 0);
    assert.equal((await post({ action: 'run', stage: 'video_generation' })).status, 409);
    assert.equal(videoExecutions, 0);
    assert.equal((await post({ action: 'run', stage: 'post_production' })).status, 409);
    assert.equal(finalExecutions, 0);
    assert.equal((await post({ action: 'continue', stage: 'character_design' })).status, 200);
    assert.deepEqual((await readShortfilmSession(project.id))?.confirmedStages, ['script_generation', 'character_design']);

    const generated = await post({ action: 'run', stage: 'storyboard' });
    assert.equal(generated.status, 200);
    const first = await generated.json();
    assert.equal(first.importedCardId, 'video-ad-storyboard');
    const cards = first.document.cards.filter((card: any) => card.id === 'video-ad-storyboard');
    assert.equal(cards.length, 1);
    assert.equal(cards[0].name, '广告分镜');
    assert.match(cards[0].textContent, /镜头 1/);
    assert.match(cards[0].textContent, /Take 1/);
    assert.equal(first.state.storyboardStale, false);
    const restored = await read();
    assert.equal(restored.stages.find((stage: any) => stage.id === 'storyboard').connected, true);
    assert.equal(restored.storyboard.episodes[0].segments[0].shots[0].content, 'Take 1');
    assert.equal((await post({ action: 'continue', stage: 'storyboard' })).status, 200);
    assert.ok((await readShortfilmSession(project.id))?.confirmedStages?.includes('storyboard'));

    assert.equal((await post({ action: 'continue', stage: 'reference_generation' })).status, 409);
    const frameResponse = await post({ action: 'run', stage: 'reference_generation' });
    assert.equal(frameResponse.status, 200, await frameResponse.clone().text());
    const frames = await frameResponse.json();
    assert.equal(frames.importedCount, 1);
    const frameCard = frames.document.cards.find((card: any) => card.id === 'video-reference-seg_01_01');
    assert.ok(frameCard.assetId);
    assert.deepEqual(frameCard.referenceCardIds, ['video-ad-storyboard']);
    assert.ok(frameCard.url && !frameCard.url.includes(':8000'));
    assert.equal(frames.state.referenceStale, false);
    assert.equal((await read()).reference.scenes[0].selected, frameCard.url);
    assert.equal((await post({ action: 'continue', stage: 'reference_generation' })).status, 200);
    const rerunFrames = await post({ action: 'run', stage: 'reference_generation' });
    assert.equal(rerunFrames.status, 200);
    const updatedFrames = await rerunFrames.json();
    assert.equal(updatedFrames.document.cards.filter((card: any) => card.id === frameCard.id).length, 1);
    assert.deepEqual(updatedFrames.document.frames[frameCard.id], frames.document.frames[frameCard.id]);
    assert.equal(references.scenes[0].selected, 'code/frame-2.png', 'new version must replace old selection');
    assert.equal(updatedFrames.state.confirmedStages.includes('reference_generation'), false);
    failReferences = true;
    assert.equal((await post({ action: 'run', stage: 'reference_generation' })).status, 502);
    assert.equal((await read()).referenceStale, true);
    assert.equal((await post({ action: 'continue', stage: 'reference_generation' })).status, 409);
    failReferences = false;
    assert.equal((await post({ action: 'run', stage: 'reference_generation' })).status, 200);
    assert.equal((await post({ action: 'continue', stage: 'reference_generation' })).status, 200);

    assert.equal((await post({ action: 'continue', stage: 'video_generation' })).status, 409);
    const videoResponse = await post({ action: 'run', stage: 'video_generation' });
    assert.equal(videoResponse.status, 200, await videoResponse.clone().text());
    const generatedVideos = await videoResponse.json();
    const clipCard = generatedVideos.document.cards.find((card: any) => card.id === 'video-clip-seg_01_01');
    assert.equal(clipCard.type, 'video');
    assert.deepEqual(clipCard.referenceCardIds, ['video-reference-seg_01_01']);
    assert.equal(clipCard.durationSec, 5);
    assert.ok(clipCard.assetId);
    assert.ok(!clipCard.url.includes(':8000'));
    assert.equal((await read()).video.clips[0].selected, clipCard.url);
    assert.equal(generatedVideos.state.videoStale, false);
    assert.equal((await post({ action: 'continue', stage: 'video_generation' })).status, 200);
    const rerunVideoResponse = await post({ action: 'run', stage: 'video_generation' });
    assert.equal(rerunVideoResponse.status, 200);
    const rerunVideos = await rerunVideoResponse.json();
    assert.equal(rerunVideos.document.cards.filter((card: any) => card.id === clipCard.id).length, 1);
    assert.deepEqual(rerunVideos.document.frames[clipCard.id], generatedVideos.document.frames[clipCard.id]);
    assert.equal(videos.clips[0].selected, 'code/clip-2.mp4');
    failVideos = true;
    assert.equal((await post({ action: 'run', stage: 'video_generation' })).status, 502);
    assert.equal((await read()).videoStale, true);
    assert.equal((await read()).finalStale, true);
    assert.equal((await post({ action: 'run', stage: 'post_production' })).status, 409);
    assert.equal((await post({ action: 'continue', stage: 'video_generation' })).status, 409);
    failVideos = false;
    invalidVideoDownload = true;
    assert.equal((await post({ action: 'run', stage: 'video_generation' })).status, 502);
    assert.equal((await read()).videoStale, true);
    invalidVideoDownload = false;
    assert.equal((await post({ action: 'run', stage: 'video_generation' })).status, 200);
    assert.equal((await post({ action: 'continue', stage: 'video_generation' })).status, 200);
    const finalResponse = await post({ action: 'run', stage: 'post_production' });
    assert.equal(finalResponse.status, 200, await finalResponse.clone().text());
    const finalResult = await finalResponse.json();
    const finalCard = finalResult.document.cards.find((card: any) => card.id === 'video-final-episode-1');
    assert.equal(finalCard.type, 'video');
    assert.deepEqual(finalCard.referenceCardIds, ['video-clip-seg_01_01']);
    assert.equal((await post({ action: 'sync_canvas' }, false)).status, 403);
    const synchronized = await (await post({ action: 'sync_canvas' })).json();
    assert.equal(synchronized.version, finalResult.version, 'syncing existing links should be a no-op');
    assert.deepEqual(synchronized.document.frames, finalResult.document.frames);
    assert.ok(finalCard.assetId);
    assert.ok(!finalCard.url.includes(':8000'));
    assert.equal(finalResult.state.finalStale, false);
    assert.equal((await read()).final.final_videos[0].path, finalCard.url);
    assert.equal((await post({ action: 'continue', stage: 'post_production' })).status, 200);
    const reassembled = await post({ action: 'run', stage: 'post_production' });
    assert.equal(reassembled.status, 200);
    const reassembledResult = await reassembled.json();
    assert.equal(reassembledResult.document.cards.filter((card: any) => card.id === finalCard.id).length, 1);
    assert.deepEqual(reassembledResult.document.frames[finalCard.id], finalResult.document.frames[finalCard.id]);
    assert.equal(reassembledResult.state.confirmedStages.includes('post_production'), false);
    failFinal = true;
    assert.equal((await post({ action: 'run', stage: 'post_production' })).status, 502);
    assert.equal((await read()).finalStale, true);
    assert.equal((await post({ action: 'continue', stage: 'post_production' })).status, 409);
    const preservedFinal = await loadProjectWithLatestSnapshot({ projectId: project.id });
    assert.equal(preservedFinal!.snapshot.cards.find((card: any) => card.id === finalCard.id)!.url, reassembledResult.document.cards.find((card: any) => card.id === finalCard.id).url);
    failFinal = false;
    assert.equal((await post({ action: 'run', stage: 'reference_generation' })).status, 200);
    assert.equal((await read()).videoStale, true);
    assert.equal((await read()).finalStale, true);
    assert.equal((await post({ action: 'run', stage: 'post_production' })).status, 409);
    assert.equal((await post({ action: 'continue', stage: 'video_generation' })).status, 409);

    const editable = (artifact: any) => ({ episodes: artifact.episodes.map((episode: any) => ({
      episode_number: episode.episode_number, episode_title: episode.episode_title ?? '',
      segments: episode.segments.map((segment: any) => ({
        segment_id: segment.segment_id, location: segment.location ?? '',
        scene_time: segment.scene_time ?? '', scene_space: segment.scene_space ?? '',
        scene_context: segment.scene_context ?? '', characters: segment.characters ?? [],
        shots: segment.shots.map((shot: any) => ({ shot_type: shot.shot_type, duration: shot.duration, content: shot.content })),
      })),
    })) });
    const revisionBeforeEdit = (await read()).storyboardRevision;
    const edits = editable(storyboard);
    edits.episodes[0].segments[0].location = 'Updated office';
    edits.episodes[0].segments[0].shots[0].content = 'Manual storyboard edit';
    edits.episodes[0].segments[0].shots[0].duration = 7;
    const editedResponse = await post({ action: 'save_storyboard', baseRevision: revisionBeforeEdit, edits });
    assert.equal(editedResponse.status, 200);
    assert.equal(executions, 1, 'manual edits must not execute a model');
    assert.equal(storyboardSaves, 1);
    const edited = await editedResponse.json();
    assert.equal(edited.state.confirmedStages.includes('storyboard'), false);
    assert.equal(edited.state.referenceStale, true);
    assert.equal((await post({ action: 'continue', stage: 'reference_generation' })).status, 409);
    assert.deepEqual(edited.state.confirmedStages, ['script_generation', 'character_design']);
    assert.equal(edited.state.storyboard.episodes[0].segments[0].total_duration, 7);
    assert.equal(edited.state.storyboard.episodes[0].segments[0].segment_id, 'seg_01_01');
    assert.equal(edited.state.storyboard.episodes[0].segments[0].shots[0].shot_number, 1);
    assert.equal(edited.document.cards.filter((card: any) => card.id === 'video-ad-storyboard').length, 1);
    const editedCard = edited.document.cards.find((card: any) => card.id === 'video-ad-storyboard');
    assert.match(editedCard.textContent, /Manual storyboard edit/);
    assert.match(editedCard.textContent, /Updated office/);
    assert.match(editedCard.textContent, /7秒/);
    assert.deepEqual(edited.document.frames['video-ad-storyboard'], first.document.frames['video-ad-storyboard']);
    assert.equal((await read()).storyboard.episodes[0].segments[0].shots[0].content, 'Manual storyboard edit');
    assert.equal((await post({ action: 'save_storyboard', baseRevision: revisionBeforeEdit, edits })).status, 409);
    const malformed = structuredClone(edits);
    malformed.episodes[0].segments[0].shots[0].duration = 0;
    assert.equal((await post({ action: 'save_storyboard', baseRevision: edited.state.storyboardRevision, edits: malformed })).status, 400);
    const wrongStructure = structuredClone(edits);
    wrongStructure.episodes[0].segments[0].segment_id = 'unknown_segment';
    assert.equal((await post({ action: 'save_storyboard', baseRevision: edited.state.storyboardRevision, edits: wrongStructure })).status, 409);
    assert.equal(storyboardSaves, 1, 'rejected edits must not be persisted');
    assert.equal((await post({ action: 'continue', stage: 'storyboard' })).status, 200);

    // An empty legacy segment can be removed, together with a selected shot,
    // without replacing the surviving segment id or its generation metadata.
    storyboard.episodes[0].segments[0].shots.push({ shot_number: 2, shot_type: 'Wide', duration: 5,
      content: 'Surviving shot', original_text: 'Keep surviving source' });
    storyboard.episodes[0].segments.push({ segment_id: 'empty_legacy', shots: [] });
    const deletionRevision = (await read()).storyboardRevision;
    const deleted = editable(storyboard);
    deleted.episodes[0].segments.pop();
    deleted.episodes[0].segments[0].shots = [{ ...deleted.episodes[0].segments[0].shots[1], shot_number: 2 }];
    const deletionResponse = await post({ action: 'save_storyboard', baseRevision: deletionRevision, edits: deleted });
    assert.equal(deletionResponse.status, 200);
    const deletion = await deletionResponse.json();
    const remainingSegment = deletion.state.storyboard.episodes[0].segments[0];
    assert.equal(deletion.state.storyboard.episodes[0].segments.length, 1);
    assert.equal(remainingSegment.segment_id, 'seg_01_01');
    assert.equal(remainingSegment.shots.length, 1);
    assert.equal(remainingSegment.shots[0].shot_number, 1);
    assert.equal(remainingSegment.shots[0].original_text, 'Keep surviving source');
    assert.equal(remainingSegment.total_duration, 5);
    assert.equal(deletion.state.confirmedStages.includes('storyboard'), false);
    assert.equal(deletion.document.cards.filter((card: any) => card.id === 'video-ad-storyboard').length, 1);
    assert.match(deletion.document.cards.find((card: any) => card.id === 'video-ad-storyboard').textContent, /Surviving shot/);
    assert.equal(executions, 1, 'deletion must not run generation');
    assert.equal((await read()).storyboard.episodes[0].segments.length, 1);
    const emptyEdit = { episodes: [{ ...deleted.episodes[0], segments: [] }] };
    assert.equal((await post({ action: 'save_storyboard', baseRevision: deletion.state.storyboardRevision, edits: emptyEdit })).status, 400);

    const rerun = await post({ action: 'run', stage: 'storyboard' });
    assert.equal(rerun.status, 200);
    const second = await rerun.json();
    assert.equal(second.document.cards.filter((card: any) => card.id === 'video-ad-storyboard').length, 1);
    assert.deepEqual(second.document.frames['video-ad-storyboard'], first.document.frames['video-ad-storyboard']);
    assert.equal(second.state.confirmedStages.includes('storyboard'), false);
    assert.match(second.document.cards.find((card: any) => card.id === 'video-ad-storyboard').textContent, /Take 2/);

    invalidOutput = true;
    assert.equal((await post({ action: 'run', stage: 'storyboard' })).status, 502);
    assert.equal((await read()).storyboardStale, true);
    assert.equal((await post({ action: 'save_storyboard', baseRevision: revisionBeforeEdit, edits })).status, 409);
    assert.equal((await post({ action: 'continue', stage: 'storyboard' })).status, 409);
    const saved = await loadProjectWithLatestSnapshot({ projectId: project.id });
    assert.match(saved!.snapshot.cards.find((card: any) => card.id === 'video-ad-storyboard')!.textContent!, /Take 2/);

    status.status.storyboard = 'running';
    assert.equal((await post({ action: 'run', stage: 'storyboard' })).status, 409);
    assert.equal((await post({ action: 'continue', stage: 'storyboard' })).status, 409);
  } finally {
    await closeSqliteDb();
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
