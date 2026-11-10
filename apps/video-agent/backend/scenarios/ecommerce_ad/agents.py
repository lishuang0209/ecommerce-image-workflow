"""电商场景专属的分镜输入适配，不改动共享分镜 Agent。"""

import copy
import re

from core.agents.storyboard_agent import StoryboardAgent
from core.agents.base_agent import AgentInterface


class EcommerceStoryboardAgent(StoryboardAgent):
    async def process(self, input_data, intervention=None):
        data = copy.deepcopy(input_data)
        artifacts = self._session_artifacts(data)
        script = artifacts.get("script_generation", {})
        design = artifacts.get("character_design", {})
        renamed = {}

        # 设定阶段的用户修改优先；保留原脚本里的稳定 ID 和 species 等字段。
        for group, id_key in (("characters", "character_id"), ("settings", "setting_id")):
            edited = {item["id"]: item for item in design.get(group, []) if item.get("id")}
            for item in script.get(group, []):
                current = edited.get(item.get(id_key) or item.get("id"))
                if not current:
                    continue
                old_name = item.get("name")
                for key in ("name", "description"):
                    if key in current:
                        item[key] = current[key]
                if old_name and item.get("name") and old_name != item["name"]:
                    renamed[old_name] = item["name"]

        # 仅调整本次分镜输入中的名称，让场志/人物行仍能与最新设定匹配。
        if renamed:
            pattern = re.compile("|".join(re.escape(name) for name in sorted(renamed, key=len, reverse=True)))
            for episode in script.get("episodes", []):
                if isinstance(episode.get("content"), str):
                    episode["content"] = pattern.sub(lambda match: renamed[match.group()], episode["content"])

        # 普通执行保留断点续跑；明确重生成时只忽略本次输入的缓存。
        # 不在调用共享 Agent 前删除会话数据或修改原始脚本。
        if data.get("regenerate") is True:
            artifacts.pop("storyboard", None)
        return await super().process(data, intervention)


class EcommerceVideoEditorAgent(AgentInterface):
    """按当前广告分镜顺序合成，每次输出独立版本，不覆盖历史文件。"""

    def __init__(self):
        super().__init__(name="EcommerceVideoEditor")

    async def process(self, input_data, intervention=None):
        import asyncio
        import subprocess
        from pathlib import Path
        from uuid import uuid4
        from imageio_ffmpeg import get_ffmpeg_exe

        data = self._merge_session_params(input_data)
        artifacts = self._session_artifacts(data)
        episodes = artifacts.get("storyboard", {}).get("episodes", [])
        clips = {clip["id"]: clip for clip in artifacts.get("video_generation", {}).get("clips", []) if clip.get("id")}
        if not episodes:
            raise ValueError("请先完成并确认分镜和视频。")
        jobs = []
        for index, episode in enumerate(episodes, 1):
            segments = episode.get("segments", [])
            if not segments:
                raise ValueError("分镜版本没有片段，无法合成。")
            paths = []
            for segment in segments:
                clip = clips.get(segment.get("segment_id"), {})
                path = Path(clip.get("selected") or "")
                if not clip.get("selected") or not path.is_file() or path.stat().st_size == 0:
                    raise ValueError(f"片段 {segment.get('segment_id')} 缺少视频，请重新生成。")
                paths.append(path.resolve())
            jobs.append((episode.get("episode_number", index), episode.get("episode_title") or episode.get("act_title") or f"版本 {index}", paths))

        output_dir = Path("code/result/video") / data["session_id"] / "output" / uuid4().hex
        output_dir.mkdir(parents=True, exist_ok=True)
        executable = get_ffmpeg_exe()
        results = []
        for index, (number, title, paths) in enumerate(jobs):
            self._check_cancel()
            self._report_progress("成片", f"正在合成版本 {number}", 10 + int(index / len(jobs) * 80))
            manifest = output_dir / f"concat_{index}.txt"
            manifest.write_text("".join("file '" + str(path).replace("'", "'\\''") + "'\n" for path in paths), encoding="utf-8")
            output = output_dir / f"version_{number}.mp4"
            command = [executable, "-nostdin", "-y", "-f", "concat", "-safe", "0", "-i", str(manifest),
                       "-c:v", "libx264", "-preset", "fast", "-crf", "22", "-c:a", "aac", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output)]
            try:
                await asyncio.to_thread(subprocess.run, command, capture_output=True, text=True, check=True, timeout=600)
            except subprocess.CalledProcessError as error:
                raise RuntimeError(f"成片合成失败：{error.stderr[-1500:]}") from error
            finally:
                manifest.unlink(missing_ok=True)
            if not output.is_file() or output.stat().st_size == 0:
                raise RuntimeError("成片输出为空，请重试。")
            results.append({"episode": number, "name": title, "path": str(output)})
        self._report_progress("成片", "合成完成", 100)
        return {"payload": {"session_id": data["session_id"], "final_videos": results, "final_video": results[0]["path"]}, "stage_completed": True}
