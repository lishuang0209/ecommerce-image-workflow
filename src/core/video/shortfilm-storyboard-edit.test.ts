import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeStoryboardEdits, storyboardEditSchema } from './shortfilm-storyboard-edit';

const edits = { episodes: [{ episode_number: 1, episode_title: 'Edited ad', segments: [{
  segment_id: 'segment', location: 'Office', scene_time: 'Day', scene_space: 'Interior', scene_context: 'Morning',
  characters: ['Cup'], shots: [{ shot_type: 'Wide', duration: 7, content: 'Edited shot' }],
}] }] };

test('manual storyboard edits preserve metadata and ids while recomputing timing', () => {
  const current = { session_id: 'session', episodes: [{ episode_number: 1, episode_title: 'Old', segments: [{
    segment_id: 'segment', segment_number: 4, total_duration: 5, visual_prompt: 'Keep prompt',
    shots: [{ shot_number: 3, content: 'Old shot', duration: 5, original_text: 'Keep source' }],
  }] }] };
  const before = structuredClone(current);
  const result = mergeStoryboardEdits(current, storyboardEditSchema.parse(edits));
  assert.equal(result.session_id, 'session');
  const segment = result.episodes![0].segments![0] as any;
  assert.equal(segment.segment_number, 1);
  assert.equal(segment.total_duration, 7);
  assert.equal(segment.visual_prompt, 'Keep prompt');
  assert.equal(segment.shots[0].shot_number, 1);
  assert.equal(segment.shots[0].original_text, 'Keep source');
  assert.equal(segment.shots[0].content, 'Edited shot');
  assert.deepEqual(current, before);
});

test('editing rejects invalid timing, blank content and structural replacement', () => {
  for (const duration of [0, 1, 4, 16, 5.5]) {
    const invalid = structuredClone(edits);
    invalid.episodes[0].segments[0].shots[0].duration = duration;
    assert.equal(storyboardEditSchema.safeParse(invalid).success, false);
  }
  const blank = structuredClone(edits);
  blank.episodes[0].segments[0].shots[0].content = '   ';
  assert.equal(storyboardEditSchema.safeParse(blank).success, false);
  const current = { episodes: [{ episode_number: 1, segments: [{ segment_id: 'other', shots: [{ content: 'Original' }] }] }] };
  assert.throws(() => mergeStoryboardEdits(current, storyboardEditSchema.parse(edits)), /structure changed/);
});


test('deleting segments and shots keeps the surviving identity and metadata', () => {
  const original = { episodes: [{ episode_number: 1, segments: [
    { segment_id: 'deleted', shots: [{ shot_number: 1, content: 'Removed', duration: 5 }] },
    { segment_id: 'survivor', segment_number: 2, shots: [
      { shot_number: 1, content: 'Delete this shot', duration: 3, original_text: 'old source' },
      { shot_number: 2, content: 'Keep this shot', duration: 5, original_text: 'keep source' },
    ] },
  ] }] };
  const changed = structuredClone(edits);
  changed.episodes[0].segments[0].segment_id = 'survivor';
  const parsed = storyboardEditSchema.parse(changed);
  parsed.episodes[0].segments[0].shots[0].shot_number = 2;
  const result = mergeStoryboardEdits(original, parsed);
  const segment = result.episodes![0].segments![0];
  assert.equal(result.episodes![0].segments!.length, 1);
  assert.equal(segment.segment_id, 'survivor');
  assert.equal(segment.segment_number, 1);
  assert.equal(segment.shots!.length, 1);
  assert.equal((segment.shots![0] as any).original_text, 'keep source');
  assert.equal(segment.shots![0].shot_number, 1);
  assert.equal(segment.total_duration, 7);
  parsed.episodes[0].segments[0].shots[0].shot_number = 99;
  assert.throws(() => mergeStoryboardEdits(original, parsed), /structure changed/);
});
