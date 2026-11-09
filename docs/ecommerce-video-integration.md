# 电商视频集成 — 开发交接文档

> 面向接手本仓库（BeatDesign 二开分支）继续开发「电商视频」功能的开发者 / AI 编程工具。
> 最后更新：P0 + P1 + P2 完成，P3–P6 待做。

---

## 1. 背景与目标

本项目是在 [BeatDesign](https://github.com/BeatAPI/BeatDesign)（本地优先的 AI 画布 / 视频编辑器）基础上做的电商二开分支。

目标：在 BeatDesign 的「电商视频」画布项目里，接入另一个服务 **shortfilm-agent**（位于 `/Users/xiaoxiao/shortfilm-agent`）的 6 阶段短视频流水线：

```
① 广告脚本 → ② 商品与模特 → ③ 广告分镜 → ④ 画面 → ⑤ 视频 → ⑥ 成片
```

- BeatDesign 负责：项目、素材库、画布、编辑器、界面
- shortfilm-agent 负责：6 阶段的内容生成（LLM / 图像 / 视频模型）
- 二者通过 **sidecar（服务端 HTTP 调用）** 通信，产物图片下载进 BeatDesign 本地素材库

---

## 2. 当前进度

| 阶段 | 状态 | 说明 |
|---|---|---|
| P0 骨架 | ✅ 完成 | sidecar 通信、会话映射、面板挂载 |
| P1 广告脚本 | ✅ 完成 | 脚本生成 + 实时进度 + 画布文本卡 |
| P2 商品与模特 | ✅ 完成 | 设定图生成 + 图片导入画布 + 缩略图 |
| P3 广告分镜 | ⬜ 待做 | storyboard，纯文本产物（类似 P1） |
| P4 画面 | ⬜ 待做 | reference_generation，图片产物（复用 P2 导入） |
| P5 视频 | ⬜ 待做 | video_generation，视频文件产物（新：视频导入） |
| P6 成片 | ⬜ 待做 | post_production，MP4 导入 + 编辑器 |

已提交并推送到 `origin/feature/ecommerce-video`：

```
9827d2d refactor(video): group design images with counts and lighten regenerate
dc53a1c fix(video): move per-stage actions into their own sections
6d9bff6 feat(video): P2 character design stage with image import
fec0605 fix(video): live progress feedback during script generation
83bbef6 feat(video): P0+P1 shortfilm-agent bridge — ad script stage
```

---

## 3. 架构（sidecar 模式）

```
BeatDesign (3020 dev / 3021 prod)
├── EcommerceVideoPanel（面板，客户端）
│      └── /api/demo/ecommerce-video（BeatDesign 服务端路由）
│             │  服务端 HTTP（无 CORS）
│             ▼
│        shortfilm-agent FastAPI (127.0.0.1:8000)
│             ├── /api/project/start
│             ├── /api/project/{sid}/execute/{stage}   (SSE)
│             ├── /api/project/{sid}/status
│             ├── /api/project/{sid}/artifact/{stage}
│             ├── /api/project/{sid}/continue
│             └── /code/*   产物静态文件
│
└── 导入结果：
      下载 shortfilm 图片 → persistLocalProjectAsset → recordUserAsset
      → linkProjectAsset → persistBeatDesignCommand(canvas.apply)
```

关键设计决策：

1. **服务端调用，不做浏览器直连**：避免 CORS，API key 留在服务端。
2. **进度用 2 秒轮询**（`GET /status`），不用 SSE（脚本阶段已验证够用）。
3. **产物不热链**：shortfilm 的 `/code` 图片必须下载进 BeatDesign 素材库，否则 shortfilm 一停图就失效。
4. **会话映射走 sidecar 文件**（`data/shortfilm-sessions/{projectId}.json`），不改 snapshot schema。

---

## 4. 运行方式

### 依赖

- Node 22+、pnpm 10（本机用 `npx pnpm@10.32.1`）
- shortfilm-agent 后端（Python 3.12 + uv）
- **ffmpeg 未安装**（P6 成片阶段需要，`brew install ffmpeg`）

### 启动 BeatDesign

```bash
cd "/Users/xiaoxiao/Documents/生图生视频测试题/work/repos/BeatDesign"

# 开发版（热更新）→ http://127.0.0.1:3020
npx pnpm@10.32.1 dev

# 生产版（需先 build）→ http://127.0.0.1:3021
npx pnpm@10.32.1 build
PORT=3021 node scripts/start-local.mjs
```

> ⚠️ 生产版 3021 每次改代码后必须 `build` + 重启才会更新；开发版 3020 自动热更新。

### 启动 shortfilm-agent

```bash
cd /Users/xiaoxiao/shortfilm-agent/backend
uv run python api_server.py   # http://127.0.0.1:8000
```

shortfilm-agent 后端默认模型（`backend/config.yaml`，gitignored）：

- `models.llm` / `models.vlm` = `qwen3.5-plus`
- `models.image_t2i` / `image_it2i` = `wan2.7-image`
- `models.video_*` = `wan2.7-i2v` / `wan2.7-r2v`
- DashScope API key 存在 `backend/config.yaml`

BeatDesign 可通过环境变量覆盖传给 shortfilm 的模型（见 `ecommerce-video.ts` 的 `modelDefaults()`）：

```
SHORTFILM_BASE_URL=http://127.0.0.1:8000   # 默认已如此
SHORTFILM_LLM_MODEL / SHORTFILM_VLM_MODEL / SHORTFILM_IMAGE_T2I_MODEL / ...
```

---

## 5. 关键文件与职责

### BeatDesign 侧（feature/ecommerce-video 分支）

| 文件 | 职责 |
|---|---|
| `src/core/video/shortfilm-contract.ts` | 类型、常量、6 阶段定义、`buildScriptCardText`、`scriptCardName`、`designCardName`、`scriptIsReady`、`designIsReady`、`stageStatusKey` |
| `src/core/video/shortfilm-client.ts` | shortfilm HTTP 客户端（服务端）：`startShortfilmProject` / `getShortfilmStatus` / `getShortfilmArtifact` / `getShortfilmScript` / `getShortfilmDesign` / `runShortfilmStage` / `continueShortfilm` / `isShortfilmOnline` / `getShortfilmBaseUrl` |
| `src/core/video/shortfilm-session.ts` | `projectId ↔ shortfilm sessionId` 映射，存 `data/shortfilm-sessions/`，含 `confirmedStages` 数组 |
| `src/core/video/import-shortfilm-assets.ts` | **图片导入核心**：`shortfilmAssetUrl`（相对路径→完整 URL）、`importShortfilmImage`（下载→persist→record→link） |
| `src/core/video/shortfilm-contract.test.ts` | 契约测试 |
| `src/routes/api/demo/ecommerce-video.ts` | API 路由：`GET` 状态 / `POST {start, run, continue}`；`importScriptCard`、`importDesignCards`；`readState` |
| `src/components/beatcanvas/ecommerce-video-panel.tsx` | 视频面板 UI（阶段列表、进度块、脚本卡、设计卡、按钮） |
| `src/components/beatcanvas/beatcanvas-shell.tsx` | 画布主壳，约 1791 行处挂载 `EcommerceVideoPanel`（`videoProject` 分支） |
| `src/core/demo/create-canvas.ts` | 视频模板初始化：只放一张空的「商品信息」卡（`video-product-facts`） |

### shortfilm-agent 侧（`/Users/xiaoxiao/shortfilm-agent`）

| 文件 | 职责 |
|---|---|
| `backend/core/agents/script_agent.py` | ① 脚本生成（约 8 次串行 LLM 调用，~2 分钟） |
| `backend/core/agents/character_agent.py` | ② 角色/场景设定图（图模型 + VLM 评估，产物 `characters[]`/`settings[]`） |
| `backend/core/agents/storyboard_agent.py` | ③ 分镜（待接入） |
| `backend/core/agents/reference_agent.py` | ④ 参考图/画面（待接入） |
| `backend/core/agents/video_agent.py` | ⑤ 视频（待接入） |
| `backend/core/agents/editor_agent.py` | ⑥ 成片（ffmpeg，待接入） |
| `backend/scenarios/ecommerce_ad/` | 电商广告场景包（6 阶段、提示词、默认参数） |

---

## 6. 数据流与产物结构

### API 路由 `/api/demo/ecommerce-video`

```
GET  ?projectId=...                       → 会话状态 + 脚本/设计产物（图片路径已转完整 URL）
POST {action:'start', idea, locale}       → 创建 shortfilm 会话 + 写 sidecar
POST {action:'run', stage, locale}        → 执行阶段 + 导入产物到画布
POST {action:'continue', stage, locale}   → 确认阶段，写 confirmedStages
```

所有 POST 都要过 `validateTrustedWorkspaceJsonMutation`（本地请求头校验）。

### 阶段产物结构

**script_generation**（artifact）：
```json
{ "title": "...", "logline": "...", "characters": [...], "settings": [...],
  "episodes": [{"episode_number":1, "act_title":"第1集", "content":"..."}],
  "meta": {"original_text": "..."} }
```

**character_design**（artifact）：
```json
{ "characters": [{"id":"char_xxx","name":"保温杯","description":"...",
    "selected":"code/result/image/{sid}/Assets/characters/char_xxx.png",
    "versions":["...","..._v2.png"],"status":"done"}],
  "settings": [{"id":"set_xxx", "...同上..."}] }
```

- 图片路径相对 shortfilm backend 目录（`code/result/image/...`）
- 完整 URL = `{SHORTFILM_BASE_URL}/{path}`（`shortfilmAssetUrl` 处理）
- 图片通过 `/code/*` 静态服务（`/code/result/image/...`）

### 确认（confirmedStages）机制

⚠️ **shortfilm 的 `continue` 只返回 `next_stage`，不推进 `current_stage`**（见 `backend/core/orchestrator.py` 的 `continue_workflow`）。所以 BeatDesign 用 sidecar 的 `confirmedStages` 数组自己记录"用户已确认哪些阶段"，控制「确认并继续」按钮的显隐。

- `continue` 时把对应 stage 加入 `confirmedStages`
- `run`（重新生成）时把对应 stage 从 `confirmedStages` 移除（脚本变了需重新确认）

---

## 7. 已完成功能清单

- [x] 电商视频项目创建（画布只有「商品信息」卡）
- [x] 输入卖点 → 创建会话 → 生成广告脚本（实时进度：百分比 + 当前步骤）
- [x] 脚本自动导入画布「广告脚本」文本卡
- [x] 确认脚本 → 生成商品与模特设定图（实时进度）
- [x] 设定图分组展示（角色 · N / 场景 · N，含版本 ×N 标记）
- [x] 设定图导入画布（`角色 · 名称` / `场景 · 名称` 图片卡）
- [x] 刷新/重启后状态恢复（sidecar + shortfilm 状态查询）
- [x] 重新生成需确认弹窗（防误触发扣费）
- [x] 三语文案（zh/en/ja）+ i18n 校验

---

## 8. 待办（P3–P6）

### P3 广告分镜（storyboard，纯文本，最接近 P1）

1. `shortfilm-contract.ts`：加 `SHORTFILM_STORYBOARD_STAGE`、storyboard artifact 类型、`storyboardIsReady`、`storyboardCardName`
2. `shortfilm-client.ts`：加 `getShortfilmStoryboard`
3. `ecommerce-video.ts`：run/continue 支持 `storyboard` 阶段；导入 storyboard 文本卡
4. 面板：脚本+设计确认后显示「生成广告分镜」，产物展示（分镜文本）

### P4 画面（reference_generation，图片，复用 P2 导入）

1. 加 `reference_generation` 阶段支持（结构同 P2）
2. 产物是每片段一张首帧图（`scenes[]`，id = segment_id），用 `importShortfilmImage` 导入
3. 面板展示画面缩略图

### P5 视频（video_generation，视频文件，新工作）

1. 加 `video_generation` 阶段支持
2. 产物是 `clips[]`（mp4 文件），需要**视频导入**（扩展 `import-shortfilm-assets.ts` 支持 `type:'video'`，mime `video/mp4`）
3. 面板展示视频（`<video>` 标签）

### P6 成片（post_production，ffmpeg，MP4）

1. 加 `post_production` 阶段支持
2. **需要先装 ffmpeg**（`brew install ffmpeg`），否则成片必失败
3. 产物是 `final_videos[]`（拼接后的 MP4），导入后进 Assets，可选进 Editor 时间线

---

## 9. 关键约定与坑

### 约定

1. **i18n 三语强制**：`messages/{zh,en,ja}.json` 三语 key 必须齐全；`src/components` 和 `src/routes` 里**不能出现中文**（`pnpm i18n:check` 会失败），中文文案放 messages，或放 `src/core`（不检查）。
2. **校验命令**（改完必跑）：
   ```bash
   npx pnpm@10.32.1 typecheck
   npx pnpm@10.32.1 i18n:check
   npx pnpm@10.32.1 test
   ```
3. **请求校验**：新增写接口必须走 `validateTrustedWorkspaceJsonMutation`。
4. **图片不热链**：shortfilm 图片必须下载进 BeatDesign 素材库。
5. **不要改 snapshot schema 存视频状态**：用 sidecar 文件（`shortfilm-session.ts`）或新表。

### 坑

1. **ffmpeg 未装**：P6 成片会失败，先 `brew install ffmpeg`。
2. **shortfilm `continue` 不推进 current_stage**：用 `confirmedStages` 自己管（见 §6）。
3. **生产版 3021 是旧 build**：改完必须 `build` + 重启 3021，否则页面不更新。
4. **脚本生成慢**：约 8 次串行 LLM 调用，~2 分钟（见 shortfilm `script_agent.py`，质量优先设计，暂不优化）。
5. **`qwen3.5-plus` 在 shortfilm registry 里只标了 `vlm`**：LLM 调用走 DashScope Generation API 兜底可用，但语义不一致。
6. **shortfilm `backend/config.yaml` 有明文 API key**（gitignored），不要提交/外传。
7. **测试项目数据**：`data/local.db` 里有多个测试项目（含生成的脚本和设定图），是本地数据，不入库。

---

## 10. 环境信息

| 项 | 值 |
|---|---|
| BeatDesign 仓库 | `/Users/xiaoxiao/Documents/生图生视频测试题/work/repos/BeatDesign` |
| 分支 / remote | `feature/ecommerce-video` → `origin`（github.com/lishuang0209/ecommerce-image-workflow） |
| shortfilm-agent | `/Users/xiaoxiao/shortfilm-agent`（backend :8000） |
| Node / pnpm | v24 / 10.32.1（用 `npx pnpm@10.32.1`） |
| 端口 | BeatDesign dev 3020、prod 3021；shortfilm 8000 |
| ffmpeg | ❌ 未安装 |
| 模型 | llm/vlm=qwen3.5-plus, image=wan2.7-image, video=wan2.7-i2v |

---

## 11. 快速自检（接手后先做）

```bash
# 1. 确认两个服务都在跑
curl http://127.0.0.1:8000/api/health          # shortfilm ok
curl -o /dev/null -w "%{http_code}" http://127.0.0.1:3020/   # BeatDesign 200

# 2. 确认视频面板能加载（用现有测试项目）
# http://127.0.0.1:3020/zh/canvas/c08b235f-bc33-42ae-b639-8b21228a3072
# 左侧「电商视频」面板应显示：广告脚本=已完成，商品与模特=已完成（角色·2 场景·1）

# 3. 跑测试
cd "/Users/xiaoxiao/Documents/生图生视频测试题/work/repos/BeatDesign"
npx pnpm@10.32.1 test        # 575 测试，570 通过，0 失败
```
