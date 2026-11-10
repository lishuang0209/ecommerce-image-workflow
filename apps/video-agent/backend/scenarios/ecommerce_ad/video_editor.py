"""电商成片：MP4 下载与 WebM/Opus 浏览器预览。"""

from core.agents.base_agent import AgentInterface


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
                       "-map", "0:v:0", "-map", "0:a:0?", "-c:v", "libx264", "-preset", "fast", "-crf", "22",
                       "-c:a", "aac", "-profile:a", "aac_low", "-ar", "48000", "-ac", "2", "-b:a", "192k",
                       "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output)]
            try:
                await asyncio.to_thread(subprocess.run, command, capture_output=True, text=True, check=True, timeout=600)
            except subprocess.CalledProcessError as error:
                raise RuntimeError(f"成片合成失败：{error.stderr[-1500:]}") from error
            finally:
                manifest.unlink(missing_ok=True)
            if not output.is_file() or output.stat().st_size == 0:
                raise RuntimeError("成片输出为空，请重试。")
            # WebM/Opus preview also works in embedded browsers without AAC decoding.
            self._check_cancel()
            preview = output.with_name(f"version_{number}_preview.webm")
            preview_command = [executable, "-nostdin", "-y", "-i", str(output),
                               "-map", "0:v:0", "-map", "0:a:0?", "-c:v", "libvpx-vp9",
                               "-crf", "32", "-b:v", "0", "-deadline", "realtime", "-cpu-used", "6",
                               "-c:a", "libopus", "-b:a", "128k", str(preview)]
            try:
                await asyncio.to_thread(subprocess.run, preview_command, capture_output=True, text=True, check=True, timeout=600)
            except subprocess.CalledProcessError as error:
                raise RuntimeError(f"成片预览生成失败：{error.stderr[-1500:]}") from error
            if not preview.is_file() or preview.stat().st_size == 0:
                raise RuntimeError("成片预览输出为空，请重试。")
            results.append({"episode": number, "name": title, "path": str(output), "preview_path": str(preview)})
        self._report_progress("成片", "合成完成", 100)
        return {"payload": {"session_id": data["session_id"], "final_videos": results, "final_video": results[0]["path"]}, "stage_completed": True}
