# 电商视频集成 — 开发交接文档

> 面向接手本仓库（BeatDesign 二开分支）继续开发「电商视频」功能的开发者 / AI 编程工具。
> 最后更新：P0–P6 源码已接入。P3 自动化与隔离数据库集成测试已通过，真实模型生成与浏览器交互尚未验证。

---

> 仓库已统一：主前端在根目录，后端在 `apps/video-agent/backend/`；根目录运行 `pnpm dev:all`。前后端统一提交到 `main`，原仓库历史保留。

## 1. 背景与目标

本项目是在 [BeatDesign](https://github.com/BeatAPI/BeatDesign)（本地优先的 AI 画布 / 视频编辑器）基础上做的电商二开分支。

目标：在 BeatDesign 的「电商视频」画布项目里，接入另一个服务 **shortfilm-agent**（位于 `apps/video-agent`）的 6 阶段短视频流水线：

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
| P3 广告分镜 | ✅ 源码已接入 | 分镜生成/重生成、轮询、文本卡导入、确认；真实模型与浏览器交互待验证 |
| P4 画面 | ✅ 源码已接入 | 每片段首帧、重生成、本地导入、确认和过期保护；真实模型与浏览器待验证 |
| P5 视频 | ✅ 源码已接入 | 片段视频生成/重生成、MP4 本地导入、播放预览和确认 |
| P6 成片 | ✅ 源码已接入 | 按分镜顺序合成、独立版本、本地导入、预览下载和确认；未自动创建编辑器时间线 |

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
- shortfilm 后端通过 `imageio-ffmpeg` 依赖获得 FFmpeg，无需全局安装；运行 `uv sync` 会安装。

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
cd apps/video-agent/backend
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

### shortfilm-agent 侧（`apps/video-agent`）

| 文件 | 职责 |
|---|---|
| `backend/core/agents/script_agent.py` | ① 脚本生成（约 8 次串行 LLM 调用，~2 分钟） |
| `backend/core/agents/character_agent.py` | ② 角色/场景设定图（图模型 + VLM 评估，产物 `characters[]`/`settings[]`） |
| `backend/core/agents/storyboard_agent.py` + `backend/scenarios/ecommerce_ad/agents.py` | ③ 分镜（电商适配读取最新设定，支持显式重生成） |
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
- [x] 画布关联自动同步：商品信息→脚本→设定→分镜→首帧→片段视频→所属版本成片；旧项目打开时补齐，保留位置与手动引用，重复同步不新增版本。画布文本修改仍不会直接写回 shortfilm。
- [x] 每个角色/场景单独修改名称和描述、单独重生成，结果更新原画布卡片
- [x] P3 分镜生成/重生成、进度轮询、完整分镜文本与画布卡片、确认及刷新恢复（自动化验证）
- [x] 上游改动失效分镜确认；过期或不完整的分镜不能确认
- [x] 分镜结构化编辑与删除：版本标题、场景、人物、镜头景别/时长/内容；支持删除镜头和整个片段，保存同步后端与原画布卡片，不调用模型，需重新确认
- [ ] P3 真实模型生成与浏览器交互验证

---

## 8. P3 实现与待办（P4–P6）

### P3 广告分镜（源码已接入，真实模型/浏览器待验证）

- 确认广告脚本与商品/模特后，可生成广告分镜；支持重生成和 2 秒进度轮询。
- `ShortfilmStoryboardArtifact` 保留 `episodes[] → segments[] → shots[]`；面板和画布文本卡都展示场景、人物、时长、景别和内容。
- 分镜面板提供「修改分镜」「保存分镜」；编辑保存以当前分镜摘要作为版本校验，拒绝过期覆盖；保留剩余片段 ID 和镜头元数据，删除后重排显示编号，片段总时长由镜头时长自动汇总（每镜头 2–15 秒、每片段 5–15 秒）。
- 画布稳定卡片 ID 为 `video-ad-storyboard`；重生成更新同一张卡片并保留位置。
- `shortfilm-session.ts` 增加 `storyboardStale`：脚本或设定修改/重生成会清除该阶段及下游确认，并要求分镜重新生成；后端会拒绝直接确认过期或不完整的产物。
- shortfilm 的电商场景将 storyboard Agent 替换为 `scenarios.ecommerce_ad.agents:EcommerceStoryboardAgent`。它在本次输入副本中合并最新设定，接受 execute body `{regenerate:true}` 跳过缓存；共享 Agent 与其它场景不变。
- 角色与场景的名称修改会同步到本次分镜的脚本文本副本，原始脚本保留。
- `continue` 只对 `current_stage` 操作；确认较早阶段时，由 sidecar 校验并记录，避免误确认当前的较后阶段。
- 编辑框提供「删除片段」「删除镜头」，删除最后一个镜头会移除空片段；每个版本至少保留一个完整片段。删除只在保存后生效，取消会丢弃草稿。保存接口保留旧版本冲突校验，允许修复历史空片段。shortfilm 后端同步移除已删片段的参考图/视频任务引用，保留历史媒体文件。
- 确认分镜后可主动生成画面，不自动触发模型。
- 分镜编辑保持左侧原位展开，用分隔线代替嵌套卡片，支持片段折叠、固定保存栏和最近一次删除撤销。

验证：BeatDesign `typecheck`、`i18n:check`、590 项测试（585 通过、5 跳过、0 失败）；shortfilm `pytest` 38 项通过。新增隔离数据库路由测试覆盖前置确认、生成/重生成、文本卡持久化、刷新恢复、失败与过期保护，模型调用使用测试替身。浏览器工具报 `timeoutMs` 连接错误，浏览器交互和真实付费模型生成未验证。

### P4 画面（源码已接入）

- 确认完整且未过期的分镜后，点击「生成画面」为每个片段生成首帧；支持进度轮询、整批重生成和确认。
- 使用既有 `intervene` 的 `regenerate_scenes`；先清理旧画面提示词，按最新分镜重新生成。检查每片段确有新版本，避免把保留的旧图片当作本轮成功。
- 图片经 `importShortfilmImage` 下载到项目本地素材库，使用 Command Kernel 更新稳定 ID `video-reference-{segment_id}` 的画布卡片，保留位置。面板只使用已导入的本地图片地址。
- sidecar `referenceStale` 在脚本、设定、分镜修改或重生成时置为 true；画面生成或导入失败也不清除此标记。全部新图导入成功后才允许确认。旧素材保留，不自动触发下一阶段。
- 隔离数据库路由测试覆盖前置确认、图片持久化、重生成更新同一卡片和选中版本、失败保护、刷新恢复与分镜编辑失效。未调用真实模型；浏览器控制工具连接异常，交互实测待完成。

### P5 视频（源码已接入）

- 确认当前画面后生成所有片段视频，支持整批重生成、状态轮询、播放预览和确认。
- 生成前同步最新分镜内容与时长，调用 `regenerate_clips`，验证每片段确有新版本并显式更新选中版本。
- `importShortfilmVideo` 下载 MP4 并检查容器标识，写入项目本地素材库；稳定卡片 `video-clip-{segment_id}` 更新时保留位置。面板通过本地媒体 URL 播放。
- `videoStale` 在上游修改、画面重生成及视频生成/导入失败后阻止确认；保留旧媒体。
- 自动化覆盖前置确认、本地导入、时长、刷新恢复、重生成、无新版本及无效 MP4 拒绝。未调用真实视频模型。

### P6 成片（源码已接入）

- 确认全部当前视频后合成，每个广告版本输出一个 MP4；支持重新合成、播放、下载和最终确认。
- 电商场景专属 `EcommerceVideoEditorAgent` 严格按当前分镜的片段顺序取选中视频，缺片直接拒绝，不跳过。每轮独立输出目录，保留历史成片。共享后期 Agent 和其它场景不变。
- FFmpeg 来自 `imageio-ffmpeg` Python 依赖；无须系统安装。真实临时红/蓝片段测试验证了顺序、可解码输出、带引号路径、历史版本保留和缺片保护。
- `finalStale` 在任一上游变化或合成/导入失败时阻止确认；稳定卡片 `video-final-episode-{number}` 更新后保持位置。
- 成片进入同一项目素材库，可用于现有编辑器；本次未自动创建时间线。
- 六阶段类型、三语文案、隔离数据库路由与后端测试已覆盖；真实付费图像/视频模型链路和浏览器交互未实测。

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

1. **成片依赖**：shortfilm 后端需要先 `uv sync` 安装 `imageio-ffmpeg`，然后重启以加载电商场景新 Agent。
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
| shortfilm-agent | `apps/video-agent`（backend :8000） |
| Node / pnpm | v24 / 10.32.1（用 `npx pnpm@10.32.1`） |
| 端口 | BeatDesign dev 3020、prod 3021；shortfilm 8000 |
| ffmpeg | ✅ 项目 Python 依赖 `imageio-ffmpeg` 提供；真实合成测试通过 |
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
npx pnpm@10.32.1 test        # P3 检查：590 项，585 通过，5 跳过，0 失败
```


### 成片双格式输出

电商场景的后期合成同时输出 MP4（H.264/AAC，下载）和 WebM（VP9/Opus，浏览器预览），避免部分内置浏览器不支持 AAC 的问题。两份文件均导入项目本地素材库；成片画布节点及左侧播放器使用 WebM，下载按钮使用 MP4。旧的只有 MP4 的产物保留兼容回退；新合成必须两份文件均成功后才可确认。转换不调用模型，也不覆盖原视频片段。


### 采用现有视频继续合成

视频过期但所有片段已有选中视频时，可显式“采用现有视频继续合成”。确认文案说明不会应用尚未重新生成的画面修改。接口校验分镜与选中版本快照、上游确认和视频文件完整性，记录采用时间与路径，然后直接调用本地后期合成；不调用视频模型。缺片段、文件损坏、选择发生变化或任务正在运行时拒绝操作。合成失败后保留已采用的视频，可继续重试成片。
