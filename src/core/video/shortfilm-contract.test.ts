import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildScriptCardText,
  buildStoryboardCardText,
  hasStoryboardContent,
  storyboardIsReady,
  storyboardCardName,
  confirmationsBeforeStage,
  designCardName,
  designIsReady,
  SHORTFILM_SCRIPT_CARD_MAX_CHARS,
  SHORTFILM_STAGES,
  stageStatusKey,
} from './shortfilm-contract';

test('the video skeleton exposes six ordered stages with the all six connected', () => {
  assert.deepEqual(
    SHORTFILM_STAGES.map((stage) => stage.id),
    [
      'script_generation',
      'character_design',
      'storyboard',
      'reference_generation',
      'video_generation',
      'post_production',
    ]
  );
  assert.deepEqual(
    SHORTFILM_STAGES.filter((stage) => stage.connected).map((stage) => stage.id),
    ['script_generation', 'character_design', 'storyboard', 'reference_generation', 'video_generation', 'post_production']
  );
});

test('script card text keeps title, logline and episode headings', () => {
  const text = buildScriptCardText({
    title: 'Bottle ad',
    logline: 'A commuter keeps coffee warm.',
    episodes: [
      {
        episode_number: 1,
        act_title: '第1集',
        content: '**第1集-第1场 日 内 地铁**\n<action>她拧开杯盖。',
      },
    ],
  });
  assert.match(text, /^# Bottle ad/m);
  assert.match(text, /A commuter keeps coffee warm\./);
  assert.match(text, /## 第1集/);
  assert.match(text, /她拧开杯盖/);
});

test('script card text falls back to the raw script and truncates oversized output', () => {
  assert.equal(
    buildScriptCardText({ meta: { original_text: 'raw script' } }),
    'raw script'
  );
  assert.equal(
    buildScriptCardText({ original_text: 'raw script' }),
    'raw script'
  );
  assert.equal(
    buildScriptCardText({ meta: { original_text: 'x'.repeat(100_500) } }).length,
    SHORTFILM_SCRIPT_CARD_MAX_CHARS
  );
  assert.equal(buildScriptCardText(null), '');
});

test('stage status keys map known shortfilm states', () => {
  assert.equal(stageStatusKey('running'), 'videoStatusRunning');
  assert.equal(stageStatusKey('waiting'), 'videoStatusWaiting');
  assert.equal(stageStatusKey('completed'), 'videoStatusCompleted');
  assert.equal(stageStatusKey('stopped'), 'videoStatusStopped');
  assert.equal(stageStatusKey('error'), 'videoStatusError');
  assert.equal(stageStatusKey('pending'), 'videoStatusPending');
  assert.equal(stageStatusKey(undefined), 'videoStatusPending');
});

test('design readiness and localized card names', () => {
  assert.equal(designIsReady({ character_design: 'completed' }), true);
  assert.equal(designIsReady({ character_design: 'waiting' }), true);
  assert.equal(designIsReady({ character_design: 'running' }), false);
  assert.equal(designIsReady(undefined), false);

  assert.equal(designCardName('character', 'Bottle', 'en'), 'Character · Bottle');
  assert.match(designCardName('setting', 'Office', 'zh'), /场景/);
});


test('design asset actions resolve in the ecommerce message namespace for every locale', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../components/beatcanvas/ecommerce-video-panel.tsx', import.meta.url), 'utf8');
  const keys = [...source.matchAll(/['"](videoDesignAsset\w+)['"]/g)].map((match) => match[1]);
  assert.ok(keys.length > 0);
  for (const locale of ['zh', 'en', 'ja']) {
    const messages = JSON.parse(await readFile(new URL(`../../../messages/${locale}.json`, import.meta.url), 'utf8'));
    const labels = messages.AppShell.studio.ecommerce;
    for (const key of keys) {
      assert.equal(typeof labels[key], 'string', `${locale}: missing ecommerce.${key}`);
      assert.ok(labels[key].trim());
    }
    if (locale === 'zh') {
      assert.equal(labels.videoDesignAssetEdit, '修改');
      assert.equal(labels.videoDesignAssetRegenerate, '重新生成');
      assert.equal(labels.videoDesignAssetSave, '保存修改');
      assert.equal(labels.videoDesignAssetSaveRegenerate, '保存并重新生成');
      assert.equal(labels.videoDesignAssetCancel, '取消');
    }
  }
});


const storyboardFixture = {
  episodes: [{ episode_number: 1, episode_title: 'Morning commute', segments: [{
    segment_id: 'seg_01_01', segment_number: 1, total_duration: 8,
    location: 'Office', scene_time: 'Day', scene_space: 'Interior',
    scene_context: 'Window light', characters: ['Cup', 'Commuter'],
    shots: [
      { shot_number: 1, shot_type: 'Wide', duration: 3, content: 'She picks up the cup.' },
      { shot_number: 2, shot_type: 'Close-up', duration: 5, content: 'Coffee is still warm.' },
    ],
  }] }],
};

test('storyboard text preserves episode, segment, shot details and localized labels', () => {
  const text = buildStoryboardCardText(storyboardFixture, 'zh');
  for (const detail of ['Morning commute', '片段 1 · 8秒', 'Office', 'Window light', 'Cup / Commuter', '镜头 2 · Close-up · 5秒', 'Coffee is still warm.']) {
    assert.ok(text.includes(detail), `Missing ${detail}`);
  }
  assert.match(buildStoryboardCardText(storyboardFixture, 'en'), /Shot 1/);
  assert.match(buildStoryboardCardText(storyboardFixture, 'ja'), /ショット 1/);
  assert.equal(buildStoryboardCardText(null, 'zh'), '');
  assert.equal(storyboardCardName('zh'), '广告分镜');
});

test('empty or partially generated storyboards cannot be confirmed', () => {
  assert.equal(hasStoryboardContent(storyboardFixture), true);
  assert.equal(hasStoryboardContent(null), false);
  assert.equal(hasStoryboardContent({ episodes: [] }), false);
  assert.equal(hasStoryboardContent({ episodes: [{ segments: [] }] }), false);
  assert.equal(hasStoryboardContent({ episodes: [{ segments: [{ segment_id: 's', shots: [] }] }] }), false);
  assert.equal(hasStoryboardContent({ episodes: [{ segments: [{ segment_id: 's', shots: [{ content: ' ' }] }] }] }), false);
  assert.equal(hasStoryboardContent({ episodes: [...storyboardFixture.episodes, { segments: [] }] }), false);
  assert.equal(storyboardIsReady({ storyboard: 'running' }), false);
  assert.equal(storyboardIsReady({ storyboard: 'error' }), false);
  assert.equal(storyboardIsReady({ storyboard: 'completed' }), true);
});

test('upstream edits invalidate dependent confirmations', () => {
  const confirmed = ['script_generation', 'character_design', 'storyboard', 'reference_generation', 'video_generation', 'post_production'];
  assert.deepEqual(confirmationsBeforeStage(confirmed, 'script_generation'), []);
  assert.deepEqual(confirmationsBeforeStage(confirmed, 'character_design'), ['script_generation']);
  assert.deepEqual(confirmationsBeforeStage(confirmed, 'storyboard'), ['script_generation', 'character_design']);
});

test('all storyboard messages resolve from the ecommerce namespace', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../components/beatcanvas/ecommerce-video-panel.tsx', import.meta.url), 'utf8');
  const editorSource = await readFile(new URL('../../components/beatcanvas/ecommerce-storyboard-editor.tsx', import.meta.url), 'utf8');
  const keys = [...(source + editorSource).matchAll(/['"](video\w*Storyboard\w*|videoStoryboard\w*)['"]/g)].map((match) => match[1]);
  assert.ok(keys.length);
  for (const locale of ['zh', 'en', 'ja']) {
    const messages = JSON.parse(await readFile(new URL(`../../../messages/${locale}.json`, import.meta.url), 'utf8'));
    for (const key of keys) assert.equal(typeof messages.AppShell.studio.ecommerce[key], 'string', `${locale}: ${key}`);
  }
});
