"""电商场景专属的分镜输入适配，不改动共享分镜 Agent。"""

import copy
import re

from core.agents.storyboard_agent import StoryboardAgent


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


# Backwards-compatible import for existing integrations and tests.
from .video_editor import EcommerceVideoEditorAgent  # noqa: E402,F401
