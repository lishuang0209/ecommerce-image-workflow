import copy
from unittest.mock import AsyncMock

import pytest

from core.scenarios import SCENARIOS_DIR, ScenarioRegistry
from scenarios.ecommerce_ad.agents import EcommerceStoryboardAgent


def storyboard_input():
    return {
        "session_id": "test-ad",
        "llm_model": "test-model",
        "_session_artifacts": {
            "script_generation": {
                "characters": [{"character_id": "cup", "name": "杯子", "description": "旧杯子", "species": "物品"}],
                "settings": [{"setting_id": "office", "name": "办公室", "description": "旧场景"}],
                "episodes": [{"episode_number": 1, "content": "杯子放在办公室。"}],
            },
            "character_design": {
                "characters": [{"id": "cup", "name": "保温杯", "description": "黑色316保温杯"}],
                "settings": [{"id": "office", "name": "办公工位", "description": "窗边工位，暖色晨光"}],
            },
            "storyboard": {"episodes": [{"episode_number": 1, "segments": [{"segment_id": "old"}]}]},
        },
    }


@pytest.mark.asyncio
async def test_regeneration_uses_latest_design_without_mutating_saved_artifacts():
    data = storyboard_input()
    data["regenerate"] = True
    original = copy.deepcopy(data)
    agent = EcommerceStoryboardAgent()
    agent._design_episode_storyboard = AsyncMock(return_value=[{"segment_id": "new", "shots": []}])
    result = await agent.process(data)
    args = agent._design_episode_storyboard.call_args.args
    assert args[2] == "保温杯放在办公工位。"
    assert args[3][0]["description"] == "黑色316保温杯"
    assert args[3][0]["species"] == "物品"
    assert args[4][0]["description"] == "窗边工位，暖色晨光"
    assert result["payload"]["episodes"][0]["segments"][0]["segment_id"] == "new"
    assert data == original


@pytest.mark.asyncio
async def test_normal_execution_resumes_completed_storyboard():
    agent = EcommerceStoryboardAgent()
    agent._design_episode_storyboard = AsyncMock()
    result = await agent.process(storyboard_input())
    agent._design_episode_storyboard.assert_not_called()
    assert result["payload"]["episodes"][0]["segments"][0]["segment_id"] == "old"


def test_only_ecommerce_uses_the_adapted_storyboard_agent():
    registry = ScenarioRegistry(SCENARIOS_DIR)
    assert registry.get("ecommerce_ad").agent_class("storyboard") is EcommerceStoryboardAgent
    assert registry.get("short_film").stage("storyboard").agent is None
