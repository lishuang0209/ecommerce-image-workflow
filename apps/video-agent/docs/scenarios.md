# 场景包参考

**场景包**是这个底座最主要的扩展方式：一个文件夹就是一个 AIGC 产品场景（电商广告、漫剧、旅游宣传片、商品海报……）。新增一个场景通常**不需要改任何 Python 或前端代码**，只写 YAML 和提示词。

- 想快速上手：看 [30 分钟做出你的第一个场景](tutorial-first-scenario.md)
- 想看现成例子是怎么设计的：看 [示例场景拆解](examples.md)

## 目录结构

```text
backend/scenarios/
  short_film/              ← 场景 id = 文件夹名（小写字母开头，只含小写字母、数字、下划线）
    scenario.yaml          ← 必需：场景声明
    __init__.py            ← 空文件，让 agents.py 可以被导入
    prompts/               ← 可选：覆盖默认提示词
      script/generate_script_zh.txt
      character/character_zh.txt
      style/my-style.txt
    agents.py              ← 可选：自定义阶段 Agent
```

后端启动时加载 `backend/scenarios/` 下所有带 `scenario.yaml` 的文件夹。某个场景包写错了，只会跳过它并打印错误，不影响其它场景；`GET /api/scenarios` 的 `errors` 字段会列出错误原因。修改后重启后端，或调用 `POST /api/scenarios/reload` 即可生效。

用脚手架复制一个现有场景作为起点：

```bash
python3 scripts/new-scenario.py pet_food_ad --from ecommerce_ad --name 宠物食品广告
```

## scenario.yaml 字段

```yaml
name: 电商广告片                    # 显示名称
tagline: 输入商品与卖点，生成带货短视频   # 首页场景卡片上的一句话
description: 面向电商投放的竖屏广告片……   # 详细说明
category: video                      # video / image：首页分组；image 场景不需要视频模型
order: 20                            # 首页排序，越小越靠前

styles:                              # 可选：场景自带的画面风格，追加到首页风格列表
  - id: comic-drama                  #   对应 prompts/style/comic-drama.txt
    label: 国漫漫剧

defaults:                            # 可选：会话默认参数，用户在首页可以改
  style: realistic                   #   风格 id（内置风格或 styles 中声明的）
  video_ratio: "9:16"                #   16:9 / 9:16 / 1:1 / 4:3 / 3:4 / 21:9；图像场景即图片比例
  video_resolution: 720P
  video_generation_mode: first_frame #   first_frame / start_end_frame / reference
  episodes: 1                        #   剧本集数；在广告里是“版本数”，在海报里是“组数”
  expand_idea: true

ui:                                  # 可选：首页文案
  hero_title: 一句话说清商品，生成你的带货短视频
  hero_subtitle: ……
  placeholder: 输入框提示语
  episodes_label: 版本数              #   “集数”控件在这个场景里叫什么
  examples:                          #   灵感示例卡片，点击后填入输入框
    - title: 便携保温杯
      description: 通勤白领的一天
      idea: 一款 300ml 便携保温杯……
      image: /ui/inspiration-cat.png  #   可选，放在 frontend/public/ 下

stages:                              # 必需：阶段组成和顺序
  - type: script_generation          #   内置阶段：写 type
    name: 广告脚本                    #   可选：改显示名称
    short_name: 脚本                  #   可选：顶栏进度条上的短名称
    description: ……                   #   可选
    options:                         #   可选：传给 Agent 的参数（见下文）
      max_episode_lines: 14
  - type: character_design
    agent: scenarios.ecommerce_ad.agents:MyDesigner   # 可选：只在本场景替换这个阶段的 Agent
  - id: compliance_review            #   自定义阶段：写 id + agent
    name: 合规审核
    agent: scenarios.ecommerce_ad.agents:ComplianceReviewAgent
```

`stages` 的校验规则：

- 内置阶段只能出现一次，`id` 就是 `type`；
- 内置阶段需要的上游阶段必须排在前面（见下表“依赖”列），比如有 `video_generation` 就必须先有 `reference_generation`；
- 自定义阶段的 `id` 用 snake_case，且必须提供 `agent`。

## 内置阶段

| type | 默认名称 | 依赖 | 产物（artifact） | 主要提示词 | 用到的模型 |
| --- | --- | --- | --- | --- | --- |
| `script_generation` | 剧本生成 | – | 剧本全文、分集、角色/场景清单 | `script/*` | LLM |
| `character_design` | 角色/场景设计 | 剧本 | 每个角色/场景的设定图（多版本可选） | `character/*`、`setting/*` | 文生图、VLM |
| `storyboard` | 分镜设计 | 剧本 | 分集 → 片段 → 镜头 | `storyboard/*` | LLM |
| `reference_generation` | 参考图生成 | 分镜 | 每个片段一张首帧图（多版本可选） | `reference/*` | 图生图、VLM |
| `video_generation` | 视频生成 | 参考图 | 每个片段一段视频 | `video/*` | 视频模型 |
| `post_production` | 后期剪辑 | 视频 | 拼接后的成片 | – | – |

裁剪阶段的例子：商品海报场景只用前四个阶段，到 `reference_generation` 结束，参考图就是最终海报，也就不需要视频模型。

阶段之间的数据流：剧本阶段产出的角色和场景会同步到设定阶段；分镜阶段产出的片段会同步到参考图和视频阶段。场景里没有的阶段会被自动跳过。

## 覆盖提示词

在场景的 `prompts/` 下放一个与 `backend/prompts/` **同路径同名**的文件，这个场景运行时就会用它替换默认提示词；没放的文件继续使用默认版本。所以只需要覆盖真正和领域相关的几个文件。

**规则：覆盖文件只能使用默认文件里已有的 `{占位符}`**，因为这些值是 Agent 代码填进去的。JSON 示例里的花括号要写成 `{{` `}}`。`tests/test_scenarios.py` 会自动检查所有场景的覆盖文件，写错了测试会失败。

最常覆盖的文件：

| 文件 | 作用 | 可用占位符 |
| --- | --- | --- |
| `script/generate_script_zh.txt` | 根据用户输入写剧本，**最核心** | `{idea}` `{style}` `{episodes}` |
| `script/revise_script_zh.txt` | 根据评审意见改稿 | `{script_text}` `{dialogue_critique}` `{plot_critique}` |
| `script/eval_plot_zh.txt` | 内容评审标准 | `{script_text}` |
| `script/eval_dialogue_zh.txt` | 台词/文案评审标准 | `{script_text}` |
| `script/meta_extract_zh.txt` | 从剧本提取角色和场景（输出 JSON） | `{script_text}` |
| `character/character_zh.txt` | 角色设定图的画面提示词 | `{name}` `{desc}` `{style}` |
| `character/eval_character_zh.txt` | 设定图质检标准 | `{character_description}` |
| `setting/setting_zh.txt` | 场景设定图的画面提示词 | `{name}` `{desc}` `{style}` |
| `storyboard/segment_plan_zh.txt` | 怎样把剧本切成片段 | `{episode_number}` `{episode_title}` `{annotated_script}` `{asset_characters}` `{asset_settings}` `{retry_feedback}` |
| `reference/first_frame_zh.txt` | 片段首帧图的画面提示词 | `{original_text}` `{plot}` `{character_description}` `{setting_description}` |
| `reference/eval_first_frame_zh.txt` | 首帧图质检标准 | `{plot}` `{visual_prompt}` `{character_description}` `{setting_description}` |
| `style/<风格 id>.txt` | 画面风格描述（新增风格要同时在 `styles` 中声明） | – |

**注意剧本格式。** 分镜阶段用程序解析剧本，所以改写 `generate_script` / `revise_script` 时必须保留这些格式约定：`## 第N集` 分集标题、`**第x集-第y场 日/夜 内/外 场景名**` 场志、紧跟的 `人物：A, B` 行、`<action>` 开头的动作行，以及 `角色名（情绪）：台词` 格式的台词行。画外音可以写成 `旁白（语气）：……`。可以改的是内容要求、篇幅和语气。

## 阶段 options

`options` 会原样交给这个阶段的 Agent（`self.stage_options`）。内置 Agent 目前支持：

| 阶段 | option | 默认值 | 说明 |
| --- | --- | --- | --- |
| `script_generation` | `min_episode_lines` | 25 | 每集最少的动作/台词行数（传给改稿和修复提示词） |
| `script_generation` | `max_episode_lines` | 30 | 每集最多行数，超出会自动删减。广告、海报这类短内容可以调小 |

你自己写的 Agent 可以读取任意 options。

## 自定义阶段 Agent

需要提示词做不到的逻辑时，比如调用外部接口、做合规审核、生成文案表格，就写一个 Agent：

```python
# backend/scenarios/ecommerce_ad/agents.py
import asyncio

from core.agents.base_agent import AgentInterface
from models.llm_client import LLM


class ComplianceReviewAgent(AgentInterface):
    """检查广告脚本里的极限词和夸大宣传。"""

    async def process(self, input_data, intervention=None):
        script = self._session_artifact(input_data, "script_generation")
        # 新提示词放在本场景的 prompts/review/compliance_zh.txt
        prompt = self._prompt("review", "compliance").format(script_text=script.get("original_text", ""))
        # 当前项目选择的模型等参数在会话参数里
        data = self._merge_session_params(input_data)
        # LLM 调用是同步的，放到线程里执行，避免阻塞其它请求
        loop = asyncio.get_running_loop()
        report = await loop.run_in_executor(None, self._cancellable_query, LLM(), prompt, [], data.get("llm_model"))
        return {
            "payload": {"report": str(report)},   # 前端用通用视图展示 payload
            "requires_intervention": True,        # True：等待用户确认后再进入下一阶段
            "stage_completed": True,
        }
```

```yaml
stages:
  - type: script_generation
  - id: compliance_review
    name: 合规审核
    agent: scenarios.ecommerce_ad.agents:ComplianceReviewAgent
  - type: character_design
  # ...
```

Agent 可用的工具（见 `core/agents/base_agent.py`）：

| 方法 / 属性 | 作用 |
| --- | --- |
| `self._prompt(category, name)` | 加载提示词：先找本场景的 `prompts/`，再找默认目录 |
| `self._session_artifact(input_data, stage_id)` | 读取某个阶段的产物 |
| `self._merge_session_params(input_data)` | 合并会话参数（模型、风格、比例等） |
| `self._report_progress(phase, step, percent)` | 推送进度到前端 |
| `self._check_cancel()` | 用户点了停止时抛出异常，长任务中定期调用 |
| `self.stage_options` / `self.scenario` | 本阶段的 options / 场景信息 |

自定义阶段的产物会在前端以通用视图显示（格式化 JSON）。想要专门的界面，可以在 `frontend/components/stages/` 下仿照现有组件写一个。

**替换内置阶段的 Agent**：在内置阶段上写 `agent:`，就只在这个场景里替换；想所有场景一起替换，用 `config.yaml` 的 `workflow.agents`。替换的 Agent 最好继承原 Agent，并保持产物结构不变，因为后续阶段和前端都依赖这个结构。

## 相关配置与接口

- `config.yaml` 的 `workflow.default_scenario`（或环境变量 `SFA_DEFAULT_SCENARIO`）：创建项目时没指定场景就用它，默认 `short_film`。
- `GET /api/scenarios`：场景列表（含阶段、默认参数、首页文案）。
- `GET /api/scenarios/{id}`：单个场景。
- `POST /api/scenarios/reload`：重新加载场景包。已创建的项目仍按创建时的阶段列表运行。
- `POST /api/project/start` 的 `scenario` 字段：用哪个场景创建项目。
