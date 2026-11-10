# 贡献指南

欢迎！这个仓库是一个 AIGC 产品教学底座：你可以 fork 后把它改造成自己领域的 AI 创作产品（电商广告、漫剧、文旅宣传、商品海报……），也欢迎把好的场景和改进提 PR 回来。

本指南面向第一次参与开源的同学，尽量只讲必要的部分。

> **安全提醒：任何时候都不要把 API Key 粘贴到 Issue、PR、截图、提交记录或聊天里。** 密钥只放在本地的 `backend/config.yaml` 或 `.env` 中，这两个文件已被 git 忽略。

## 1. 本地开发环境

按 [README 的「快速开始」](README.md#快速开始) 安装依赖（Python 3.12 + uv、Node.js、ffmpeg），然后在项目根目录：

```bash
./scripts/dev.sh        # 同时启动后端 :8000 和前端 :3000
```

常用检查命令：

```bash
cd backend && uv run --extra dev pytest                     # 后端测试，不需要 API Key
cd frontend && npx tsc --noEmit -p . && npm run build        # 前端类型检查与构建
```

每次 push 和 PR 都会在 GitHub Actions 上自动跑这两项（见 `.github/workflows/ci.yml`）。

## 2. 项目地图

| 位置 | 作用 |
| --- | --- |
| `backend/scenarios/<id>/` | **场景包**：`scenario.yaml` + 可选 `prompts/` 覆盖 + 可选 `agents.py`，大多数改造只需要动这里 |
| `backend/prompts/<stage>/` | 默认提示词（`*_zh.txt` / `*_en.txt`），场景没覆盖的提示词会回退到这里 |
| `backend/core/` | 阶段注册表 `stages.py`、工作流引擎 `orchestrator.py`、六个阶段 Agent `agents/` |
| `backend/models/` + `backend/registry/models.yaml` | 模型客户端与模型注册表 |
| `backend/config.py` | 配置加载：默认值 → `config.yaml` → `SFA_*` 环境变量 |
| `frontend/` | Next.js 前端，品牌配置在 `frontend/config/brand.ts` |
| `docs/` | 架构、配置、扩展、API 等文档 |

## 3. 贡献一个场景（推荐路径）

完整教程见 [docs/tutorial-first-scenario.md](docs/tutorial-first-scenario.md)，字段说明见 [docs/scenarios.md](docs/scenarios.md)，内置场景拆解见 [docs/examples.md](docs/examples.md)。

1. **先开 Issue（可选但推荐）**：用「场景提案 / 分享」模板写下领域、目标用户和阶段设计，方便提前讨论。
2. **从最接近的内置场景复制一份**：

   ```bash
   python3 scripts/new-scenario.py pet_food_ad --from ecommerce_ad --name 宠物食品广告
   ```

3. **修改 `backend/scenarios/<id>/scenario.yaml`**：名称、首页文案、示例、阶段名称、默认比例和风格等。
4. **修改 `prompts/` 下的提示词**：只保留需要覆盖的文件，其余删掉即可回退到默认提示词。确实需要改阶段逻辑时再写 `agents.py`。
5. **跑测试**：

   ```bash
   cd backend && uv run --extra dev pytest tests/test_scenarios.py
   ```

6. **本地实际跑一遍**：重启后端（或调用 `POST /api/scenarios/reload`），在首页选择新场景走完流程，截几张图（首页卡片 + 关键阶段结果）。
7. **提交 PR**：按 PR 模板勾选自查清单并附上截图。

## 4. 代码约定

以下约定来自 [CLAUDE.md](CLAUDE.md)：

- **品牌中立**：不要硬编码产品名。后端用 `settings.APP_NAME`，前端用 `brand.name`。
- **新增配置项**：写进 `backend/config.py` 的 `DEFAULT_CONFIG` / `PROVIDERS`，同步更新 `backend/config.yaml.example`，需要时提供 `SFA_*` 环境变量。
- **提示词位置**：默认提示词放 `backend/prompts/<stage>/`，场景专属提示词放 `backend/scenarios/<id>/prompts/<stage>/`，文件名用 `*_zh.txt` / `*_en.txt`。
- **替换阶段 Agent**：必须继承 `AgentInterface`，并保持该阶段原有的 payload 结构（工作流引擎依赖它做跨阶段同步）。
- **界面配色**：保持黑白灰的中性配色，不要引入蓝色、紫色等强调色；CSS 类名使用 `sfa-` 前缀。
- **产物路径**：生成产物以相对 `backend/` 的路径保存（`code/result/...`）。

## 5. 提交信息

- 中文或英文都可以，用祈使句描述做了什么，例如「新增宠物食品广告场景」「Fix storyboard ratio fallback」。
- 一个提交只做一件事；场景包、后端修复、前端改动尽量分开提交。
- 不要提交 `backend/config.yaml`、`.env`、`backend/code/` 等本地文件。

## 6. 用 AI 编程工具协作

大多数同学会用 Claude Code、Cursor 等 AI 编程工具来改代码，这完全没问题。几点建议：

- **先让工具读项目说明**：开始前让它先阅读 `CLAUDE.md`、`AGENTS.md` 和本文件，再动手。例如：「先读 CLAUDE.md 和 CONTRIBUTING.md，然后帮我基于 ecommerce_ad 新建一个宠物食品广告场景」。
- **把改动范围说清楚**：做场景时明确告诉它「只改 `backend/scenarios/<id>/`」，避免它顺手改动核心代码。
- **提交前让它跑测试**：要求它运行 `cd backend && uv run --extra dev pytest`，改了前端再运行 `npx tsc --noEmit -p . && npm run build`，并把失败的地方修好。
- **自己检查一遍 diff**：确认没有多余文件、没有硬编码品牌名、没有密钥。
- **不要把密钥交给工具写进代码**：密钥只在前端「设置」页或本地 `config.yaml` / `.env` 里填写。

有任何问题，欢迎开 Issue 讨论。
