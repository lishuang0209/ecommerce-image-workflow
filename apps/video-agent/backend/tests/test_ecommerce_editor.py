import copy
import subprocess
from pathlib import Path

import pytest
from imageio_ffmpeg import get_ffmpeg_exe
from core.scenarios import SCENARIOS_DIR, ScenarioRegistry
from scenarios.ecommerce_ad.agents import EcommerceVideoEditorAgent


def editor_input(paths):
    return {"session_id": "editor-test", "_session_artifacts": {
        "storyboard": {"episodes": [{"episode_number": 1, "episode_title": "测试广告", "segments": [{"segment_id": "red"}, {"segment_id": "blue"}]}]},
        "video_generation": {"clips": [{"id": name, "selected": str(path)} for name, path in reversed(list(paths.items()))]},
    }}


@pytest.mark.asyncio
async def test_actual_assembly_order_and_history(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    executable = get_ffmpeg_exe()
    paths = {}
    for color in ("red", "blue"):
        path = tmp_path / f"{color}'s clip.mp4"
        subprocess.run([executable, "-y", "-f", "lavfi", "-i", f"color=c={color}:s=32x32:r=10:d=0.2", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(path)], check=True, capture_output=True)
        paths[color] = path
    data = editor_input(paths)
    original = copy.deepcopy(data)
    agent = EcommerceVideoEditorAgent()
    result = await agent.process(data)
    video = result["payload"]["final_videos"][0]
    assert video["name"] == "测试广告"
    output = Path(video["path"])
    first_bytes = output.read_bytes()
    decoded = subprocess.run([executable, "-i", str(output), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], check=True, capture_output=True).stdout
    frames = [decoded[i:i+3072] for i in range(0, len(decoded), 3072)]
    assert len(frames) == 4
    assert frames[0][0] > 200 and frames[0][2] < 30
    assert frames[-1][2] > 200 and frames[-1][0] < 30
    second = await agent.process(data)
    assert second["payload"]["final_video"] != str(output)
    assert output.read_bytes() == first_bytes
    assert data == original
    assert not list(tmp_path.rglob('concat_*.txt'))


@pytest.mark.asyncio
async def test_missing_clip_rejects_assembly(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    existing = tmp_path / 'existing.mp4'
    existing.write_bytes(b'placeholder')
    with pytest.raises(ValueError, match='缺少视频'):
        await EcommerceVideoEditorAgent().process(editor_input({'red': existing, 'blue': tmp_path / 'missing.mp4'}))
    assert not (tmp_path / 'code').exists()


def test_editor_override_scoped_to_ecommerce():
    registry = ScenarioRegistry(SCENARIOS_DIR)
    assert registry.get('ecommerce_ad').agent_class('post_production') is EcommerceVideoEditorAgent
    assert registry.get('short_film').stage('post_production').agent is None
