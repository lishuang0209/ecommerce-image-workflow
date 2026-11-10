<h1 align="center">ShortFilm Agent</h1>

<p align="center">
  <b>AIGC 内容生产 Agent 底座：一套流程引擎，适配不同行业的图像 / 视频生成产品</b>
</p>

<p align="center">
  <b>简体中文</b> · <a href="./README_EN.md">English</a>
</p>

<p align="center">
  <img alt="Python" src="https://img.shields.io/badge/Python-3.10+-black.svg">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-18+-black.svg">
  <img alt="License" src="https://img.shields.io/badge/License-MIT-black.svg">
</p>

---

## ✨ 这是什么

ShortFilm Agent 是一个**可二次开发的 AIGC 项目底座**。用户输入一句需求，系统把它拆成一条多阶段的生产流水线，每个阶段的产出都可以**查看、确认、修改、单项重新生成**，人始终在回路里。

```
文案/剧本 → 角色与场景设定 → 分镜 → 画面 → 视频 → 成片
```

核心特性：

- 🧩 **场景包即产品** —— 一个文件夹就是一个行业场景，换一个场景包就是另一个产品
- 🔄 **多阶段流水线** —— 内置 6 种阶段类型，按场景自由组合
- 👥 **人在回路** —— 每阶段产出可确认、修改、重生成
- 🔌 **模型可插拔** —— 通义 / 火山方舟 / 可灵 / OpenAI / Gemini / DeepSeek 任意切换
- 🚫 **零代码扩展** —— 新增场景通常只需复制场景包、改 YAML 和提示词

内置 5 个开箱即用的场景：

| 内置场景 | 输入 | 产出 |
| :--- | :--- | :--- |
| **AI 短片** | 一句故事灵感 | 多集剧情短片 |
| **电商广告片** | 商品与卖点 | 30–45 秒竖屏带货视频 |
| **漫剧** | 世界观与主角设定 | 竖屏多集漫画短剧 |
| **旅游宣传片** | 目的地与宣传重点 | 45–60 秒宣传片 |
| **商品海报** | 商品与卖点 | 一组 3–4 张电商海报（纯图像） |

> 其中 4 个视频类场景均为 6 阶段流水线，商品海报为 4 阶段的纯图像流水线。

新增一个场景通常**不需要写代码**：复制一个场景包，改 YAML 和提示词即可。需要更复杂的逻辑时，可以给场景加自定义阶段 Agent。

## 🎓 写给 AI 产品经理同学

这个项目是为「基于底座做行业 AIGC 产品」的课程准备的。建议这样使用：

1. **先跑起来**：用 5 个内置场景各生成一次，感受多阶段 + 人在回路的产品形态。
2. **读 [示例场景拆解](docs/examples.md)**：看同一套引擎怎样通过阶段组合和提示词变成不同产品。
3. **跟着 [30 分钟做出你的第一个场景](docs/tutorial-first-scenario.md)**：为你的目标行业（电商、旅游、教育、房产、餐饮……）做一个场景包。
4. **用 AI 编程工具迭代**：项目附带 [CLAUDE.md](CLAUDE.md) / [AGENTS.md](AGENTS.md)，Claude Code、Cursor 等工具读完就知道该改哪里。你的主要工作是**定义场景、写好提示词、验收效果**。

## 🚀 快速开始

### 环境要求

- Python 3.10+（推荐 3.12，用 [uv](https://docs.astral.sh/uv/) 管理）
- Node.js 18+ / npm 9+
- ffmpeg（拼接视频片段）
- 至少一家模型服务商的 API Key（默认配置使用阿里云百炼 DashScope 和火山方舟 Ark）

### 一键安装与启动

```bash
./scripts/install.sh          # Windows: scripts\install.bat
./scripts/dev.sh              # 同时启动后端 :8000 和前端 :3000，Ctrl+C 一起停止
```

打开 http://localhost:3000 ，在「设置」页填写 API Key，回到首页选择场景、输入需求即可开始。

### 手动启动

```bash
# 后端
cd backend
uv sync --python 3.12
cp config.yaml.example config.yaml     # 也可以在前端「设置」页填写 API Key
uv run python api_server.py            # http://localhost:8000

# 前端（新终端）
cd frontend
npm install
npm run dev                            # http://localhost:3000
```

### Docker Compose

```bash
cp .env.example .env                   # 填入 SFA_*_API_KEY
docker compose up --build
```

## 📁 目录结构

```text
.
├── backend/                     # Python FastAPI 后端
│   ├── scenarios/               # ★ 场景包：每个子目录是一个场景（scenario.yaml + prompts/ + agents.py）
│   ├── core/
│   │   ├── scenarios.py         # 场景包加载与校验
│   │   ├── stages.py            # 6 种内置阶段类型
│   │   ├── orchestrator.py      # 工作流引擎：按场景的阶段列表驱动状态机
│   │   └── agents/              # 内置阶段 Agent
│   ├── prompts/                 # 默认提示词（场景包可按文件覆盖）
│   ├── models/                  # 模型服务商客户端 + 统一门面
│   ├── registry/models.yaml     # 模型注册表
│   └── config.py                # 配置：默认值 → config.yaml → SFA_* 环境变量
├── frontend/                    # Next.js 前端（首页场景选择、阶段工作台、设置页）
├── docs/                        # 文档
├── scripts/                     # install / dev / new-scenario 脚本
└── integrations/agent-skill/    # 可选：供外部 Agent（OpenClaw 等）调用的 Skill
```

## 📚 文档

| 文档 | 内容 |
| :--- | :--- |
| [30 分钟做出你的第一个场景](docs/tutorial-first-scenario.md) | 手把手教程 |
| [示例场景拆解](docs/examples.md) | 5 个内置场景的设计思路 |
| [场景包参考](docs/scenarios.md) | scenario.yaml 字段、提示词覆盖、自定义 Agent |
| [二次开发指南](docs/extending.md) | 换品牌、加模型、加服务商、替换 Agent |
| [架构](docs/architecture.md) | 分层、数据流、状态机 |
| [配置](docs/configuration.md) | 配置文件与环境变量 |
| [HTTP API](docs/api.md) | 接口说明 |
| [贡献指南](CONTRIBUTING.md) | 开发约定与提交流程 |

## 🔧 模型与配置

LLM / VLM / 图像 / 视频各环节的模型可以在通义、火山方舟、可灵、OpenAI、Gemini、DeepSeek，以及任意 OpenAI 兼容接口之间切换。密钥统一填写在 `config.yaml` 的 `api_providers.<服务商 id>.<字段>` 下（「设置」页填写的也是它），各服务商的 id 依次为 `dashscope`、`ark`、`kling`、`openai`、`gemini`、`deepseek`、`openai_compatible`：

| 服务商 | 密钥字段 |
| :--- | :--- |
| 阿里云百炼 DashScope<br>通义千问、通义万相 Wan 图像/视频 | `api_key` |
| 火山方舟 Ark<br>豆包 Seedream 图像、Seedance 视频 | `api_key` |
| 可灵 Kling<br>可灵视频生成 | `access_key`<br>`secret_key` |
| OpenAI<br>GPT 文本/视觉、OpenAI 图像 | `api_key` |
| Google Gemini<br>Gemini 文本/视觉 | `api_key` |
| DeepSeek<br>DeepSeek 文本 | `api_key` |
| OpenAI 兼容接口<br>vLLM、Ollama、OpenRouter 等 | `api_key`<br>`base_url` |

配置按三层合并：`backend/config.py` 默认值 → `backend/config.yaml`（「设置」页写入的就是它）→ `SFA_*` 环境变量（只在运行时生效，不写回文件）。详见 [docs/configuration.md](docs/configuration.md)。

> ⚠️ `backend/config.yaml` 和 `.env` 已被 git 忽略。**不要把 API Key 提交到仓库。**

## ✅ 测试

```bash
cd backend && uv run --extra dev pytest      # 含场景包格式检查
cd frontend && npx tsc --noEmit && npm run build
```

## 🗺️ 路线图

- [ ] 更多场景包：知识科普、房产展示、餐饮探店
- [ ] 内置阶段组件读取场景的 options，支持更多无代码配置
- [ ] 跨镜头连贯性审查 Agent
- [ ] 多镜头并行生成

## 📄 License

[MIT](./LICENSE)
