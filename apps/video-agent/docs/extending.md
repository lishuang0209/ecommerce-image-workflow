# 二次开发指南

按改动从小到大排列。大多数领域适配只需要第一节：新增一个场景包。

## 新增场景（最常用）

把底座改成某个领域的 AIGC 产品（电商广告、漫剧、旅游宣传、海报……），只需在 `backend/scenarios/` 下新增一个场景包：声明阶段组成、默认参数、首页文案，再覆盖几个领域相关的提示词。不需要改 Python 或前端代码。

```bash
python3 scripts/new-scenario.py my_scenario --from ecommerce_ad --name 我的场景
```

- 字段与规则：[scenarios.md](scenarios.md)
- 手把手教程：[30 分钟做出你的第一个场景](tutorial-first-scenario.md)
- 内置示例的设计思路：[examples.md](examples.md)

## 换品牌

- 后端：`config.yaml` 的 `app.name` / `app.tagline`（或 `SFA_APP_NAME`），影响 API 标题和 HTML 视频模板里的品牌文字。
- 前端：`NEXT_PUBLIC_APP_NAME`、`NEXT_PUBLIC_APP_TAGLINE`。默认值在 `frontend/config/brand.ts`。CSS 类名统一使用 `sfa-` 前缀，主题样式集中在 `frontend/app/globals.css`。

## 新增模型（已有服务商）

不需要改代码。在 `backend/registry/models.local.yaml`（不纳入版本控制）或 `config.yaml` 的 `custom_models` 中声明：

```yaml
models:                       # models.local.yaml 需要这一层；custom_models 下直接写模型 id
  qwen3.8-plus:
    name: Qwen 3.8 Plus
    provider: dashscope
    family: qwen
    type: [llm]
    concurrency: 10
```

同名条目会与内置注册表合并，可用于覆盖内置模型的并发数等字段。重启后端或在设置页保存一次配置后生效，然后就能在设置页或创建项目时选择该模型。

图像 / 视频模型需要补充 `capabilities`（支持的比例、分辨率、时长、能力类型），可参考 `registry/models.yaml` 中同服务商的条目。

## 接入 OpenAI 兼容模型

适用于 vLLM、Ollama、OpenRouter、Moonshot 等提供 OpenAI Chat Completions 接口的服务（文本与视觉理解）：

```yaml
api_providers:
  openai_compatible:
    api_key: sk-...
    base_url: http://127.0.0.1:11434/v1

custom_models:
  qwen2.5:14b:
    name: Ollama Qwen2.5 14B
    provider: openai_compatible
    type: [llm]
    concurrency: 2

models:
  llm: qwen2.5:14b
```

## 新增服务商

1. 在 `backend/config.py` 的 `PROVIDERS` 中声明字段，例如 `"myvendor": {"label": ..., "fields": {"api_key": "", "base_url": "...", "enable_proxy": False}, "secrets": ("api_key",)}`。这会自动带来默认配置、密钥脱敏、`Config.MYVENDOR_API_KEY` 属性和 `SFA_MYVENDOR_API_KEY` 环境变量。
2. 在 `backend/models/` 下实现客户端，参考同类型的现有客户端（如 `video_kling.py`）的方法签名。
3. 在对应门面（`llm_client.py` / `vlm_client.py` / `image_client.py` / `video_client.py`）中按 `provider == "myvendor"` 路由到新客户端。
4. 在注册表中以 `provider: myvendor` 注册模型。
5. 如需在设置页编辑，在 `frontend/app/settings/page.tsx` 的 `GROUPS` 中添加字段。

## 替换或新增阶段 Agent

提示词做不到的逻辑，可以用自己的 Agent 实现：

- **只在某个场景里替换内置阶段**：在该场景 `scenario.yaml` 的阶段上写 `agent: scenarios.<场景 id>.agents:MyAgent`。
- **新增一个自定义阶段**：在 `stages` 中加入 `{id: my_stage, name: ..., agent: ...}`，前端会用通用视图展示产物。
- **所有场景统一替换**：在 `config.yaml` 中设置 `workflow.agents`：

```yaml
workflow:
  agents:
    script_generation: my_plugins.script:MyScriptAgent
```

替换内置阶段时，最稳妥的做法是继承原 Agent，并保持产物（payload）结构不变，因为编排器的跨阶段同步和前端都依赖这个结构：

```python
from core.agents.script_agent import ScriptWriterAgent

class MyScriptAgent(ScriptWriterAgent):
    async def process(self, input_data, intervention=None):
        result = await super().process(input_data, intervention)
        # 在这里后处理剧本……
        return result
```

Agent 必须继承 `core.agents.base_agent.AgentInterface`。可用的辅助方法见 [scenarios.md · 自定义阶段 Agent](scenarios.md#自定义阶段-agent)。

## 修改提示词

默认提示词在 `backend/prompts/<阶段>/`，`*_zh.txt` / `*_en.txt` 分别是中文和英文版本，风格预设在 `backend/prompts/style/`。修改默认提示词会影响所有没有覆盖它的场景。只想改一个场景时，把同名文件放到该场景的 `prompts/` 下（见 [scenarios.md · 覆盖提示词](scenarios.md#覆盖提示词)）。

## 外部 Agent 集成

`integrations/agent-skill/` 是可选的 Agent Skill：让 OpenClaw、Claude Code 等外部 Agent 通过 HTTP API 驱动 6 阶段流程，并在每个确认点停下等用户确认；其中也包含飞书 / 微信消息推送说明。运行本项目不需要它。
