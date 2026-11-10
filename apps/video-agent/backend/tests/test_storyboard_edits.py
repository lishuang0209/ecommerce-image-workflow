import copy

import pytest

from config import settings
from core.orchestrator import WorkflowEngine
from core.storyboard_edits import normalize_storyboard_edits


def segment(identifier, number, content='镜头内容'):
    return {
        'segment_id': identifier, 'segment_number': number, 'episode_number': 1,
        'location': '办公室', 'characters': ['白领'], 'total_duration': 99,
        'shots': [{'shot_number': 8, 'shot_type': '中景', 'duration': 5, 'content': content}],
    }


def test_manual_edits_normalize_display_numbers_without_reassigning_ids():
    episodes = [{'episode_number': 1, 'episode_title': '广告', 'segments': [segment('seg_01_01', 1), segment('seg_01_03', 3)]}]
    original = copy.deepcopy(episodes)
    edited = normalize_storyboard_edits(episodes)
    assert [s['segment_id'] for s in edited[0]['segments']] == ['seg_01_01', 'seg_01_03']
    assert [s['segment_number'] for s in edited[0]['segments']] == [1, 2]
    assert edited[0]['segments'][1]['shots'][0]['shot_number'] == 1
    assert edited[0]['segments'][1]['total_duration'] == 5
    assert episodes == original


@pytest.mark.parametrize('episodes', [[], [{'segments': []}], [{'segments': [{'segment_id': 'empty', 'shots': []}]}]])
def test_empty_storyboards_and_empty_segments_are_not_saved(episodes):
    with pytest.raises(ValueError):
        normalize_storyboard_edits(episodes)


def test_deleted_segments_are_removed_from_downstream_tasks_and_stay_removed_after_reload(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, 'SESSION_DIR', str(tmp_path))
    engine = WorkflowEngine()
    engine.create_session('delete-storyboard', {'scenario': 'short_film'})
    state = engine.get_state('delete-storyboard')
    original = {'episodes': [{'episode_number': 1, 'segments': [segment('keep', 1), segment('remove', 2), segment('keep_later', 3)]}]}
    state.artifacts['storyboard'] = original
    state.artifacts['reference_generation'] = {'scenes': [
        {'id': identifier, 'selected': f'{identifier}.png', 'versions': [f'{identifier}.png']}
        for identifier in ['keep', 'remove', 'keep_later']
    ]}
    state.artifacts['video_generation'] = {'clips': [
        {'id': identifier, 'selected': f'{identifier}.mp4', 'versions': [f'{identifier}.mp4']}
        for identifier in ['keep', 'remove', 'keep_later']
    ]}
    # Generated files are retained; only deleted segment associations are pruned.
    generated_file = tmp_path / 'remove.mp4'
    generated_file.write_bytes(b'keep history')
    edited = copy.deepcopy(original['episodes'])
    del edited[0]['segments'][1]
    edited[0]['segments'][1]['shots'][0]['content'] = '修改后的内容'
    engine.update_artifact('delete-storyboard', 'storyboard', {'episodes': edited})
    for stage, key in [('reference_generation', 'scenes'), ('video_generation', 'clips')]:
        items = state.artifacts[stage][key]
        assert [item['id'] for item in items] == ['keep', 'keep_later']
        assert items[1]['index'] == 2
        assert items[1]['selected'].startswith('keep_later.')
        assert items[1]['description'] == '修改后的内容'
    reloaded = WorkflowEngine().get_state('delete-storyboard')
    assert [s['segment_id'] for s in reloaded.artifacts['storyboard']['episodes'][0]['segments']] == ['keep', 'keep_later']
    assert [c['id'] for c in reloaded.artifacts['video_generation']['clips']] == ['keep', 'keep_later']
    assert generated_file.read_bytes() == b'keep history'
    before = copy.deepcopy(state.artifacts)
    with pytest.raises(ValueError):
        engine.update_artifact('delete-storyboard', 'storyboard', {'episodes': [{'segments': []}]})
    assert state.artifacts == before
