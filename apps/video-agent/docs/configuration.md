# 配置

## 加载顺序

后端配置由 `backend/config.py` 加载，三层合并，后者覆盖前者：

1. **默认值**：`DEFAULT_CONFIG`（服务商部分由 `PROVIDERS` 表生成）
2. **配置文件**：`backend/config.yaml`，或 `SFA_CONFIG` 指定的路径。文件不存在时读取 `config.yaml.example`。前端「设置」页保存时写入此文件。
3. **环境变量**：`SFA_*`。只在运行时生效，不会写回配置文件；在设置页修改一个被环境变量覆盖的字段，会保存到文件，但在去掉该环境变量之前不生效。`GET /api/config` 的 `env_overrides` 字段列出当前被覆盖的配置项。

## 配置文件结构

| 段 | 说明 |
| --- | --- |
| `app` | `name`、`tagline`：后端 API 标题、HTML 模板中的品牌文字 |
| `server` | `host`、`port`、`log_level`、`access_log` |
| `api_providers` | 各服务商的密钥、接口地址、`enable_proxy`；`common.proxy` 是共用代理地址 |
| `models` | 主流程默认模型：`llm`、`vlm`、`image_t2i`、`image_it2i`、`video_first_frame`、`video_start_end`、`video_reference` |
| `generation` | 全局默认 `style`、`video_ratio`、`video_resolution`、`video_generation_mode`（`first_frame` / `start_end` / `reference`）；场景包的 `defaults` 优先 |
| `workflow.default_scenario` | 创建项目时未指定场景所用的场景 id，默认 `short_film` |
| `workflow.agents` | 在所有场景中替换内置阶段的 Agent：`{阶段 id: "模块:类名"}`；只改一个场景请在其 `scenario.yaml` 中写 `agent:` |
| `custom_models` | 额外注册的模型，格式同 `registry/models.yaml` |

完整示例见 [backend/config.yaml.example](../backend/config.yaml.example)。

## 环境变量

| 变量 | 对应配置 |
| --- | --- |
| `SFA_CONFIG` | 配置文件路径 |
| `SFA_APP_NAME` / `SFA_APP_TAGLINE` | `app.name` / `app.tagline` |
| `SFA_HOST` / `SFA_PORT` / `SFA_LOG_LEVEL` | `server.*` |
| `SFA_PROXY` | `api_providers.common.proxy` |
| `SFA_DEFAULT_SCENARIO` | `workflow.default_scenario` |
| `SFA_<服务商>_<字段>` | `api_providers.<服务商>.<字段>`，例如 `SFA_DASHSCOPE_API_KEY`、`SFA_KLING_SECRET_KEY`、`SFA_OPENAI_COMPATIBLE_BASE_URL` |
| `SFA_MODEL_<键>` | `models.<键>`，例如 `SFA_MODEL_LLM`、`SFA_MODEL_VIDEO_FIRST_FRAME` |
| `SFA_CORS_ORIGINS` | 额外允许的浏览器来源，逗号分隔（默认已允许 `localhost:3000` / `127.0.0.1:3000`） |
| `SFA_SKIP_FRONTEND_BUILD` | 安装脚本跳过前端构建 |

服务商 id：`openai`、`gemini`、`deepseek`、`dashscope`、`ark`、`kling`、`openai_compatible`。

## 前端

前端变量写在 `frontend/.env.local`（参考 `frontend/.env.example`）。`NEXT_PUBLIC_*` 和 `BACKEND_API_URL` 都在构建时固化，修改后需重新 `npm run build`。

| 变量 | 说明 |
| --- | --- |
| `BACKEND_API_URL` | Next.js 代理 `/api/*`、`/code/*` 的后端地址 |
| `NEXT_PUBLIC_API_URL` | 浏览器直连后端的地址（SSE 进度流） |
| `NEXT_PUBLIC_APP_NAME` / `NEXT_PUBLIC_APP_TAGLINE` | 品牌名称、标语 |
