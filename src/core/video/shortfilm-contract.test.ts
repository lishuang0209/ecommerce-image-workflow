import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildScriptCardText,
  SHORTFILM_SCRIPT_CARD_MAX_CHARS,
  SHORTFILM_STAGES,
  stageStatusKey,
} from './shortfilm-contract';

test('the video skeleton exposes six ordered stages and only the script stage is connected', () => {
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
    ['script_generation']
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
