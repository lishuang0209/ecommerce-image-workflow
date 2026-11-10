# 电商素材画布工作流（开发版）

本仓库基于 [BeatAPI/BeatDesign](https://github.com/BeatAPI/BeatDesign) 开发，保留原项目 Apache-2.0 许可证和来源说明。本项目增加了阿里百炼接入和电商素材工作流。

## 启动

需要 Node.js 22 或更高版本、pnpm 10（10.32.1）、Python 3.12 和 uv。

前端保留在根目录；视频后端位于 `apps/video-agent/backend/`。两个服务在同一个 Git 仓库中维护。

```sh
pnpm install
uv sync --directory apps/video-agent/backend --locked --extra dev
pnpm dev:all
```

视频服务监听 `http://127.0.0.1:8000`。首次使用时，将 `apps/video-agent/backend/config.yaml.example` 复制为同目录的 `config.yaml`，填写自己的模型配置。仅启动前端用 `pnpm dev`，仅启动后端用 `pnpm dev:video`。

打开 `http://127.0.0.1:3020/zh/demo`，创建电商项目，在画布中导入素材。也可以生产构建后本地运行：

```sh
pnpm build
PORT=3021 pnpm start
```

打开 `http://127.0.0.1:3021/zh/demo`。Windows 可通过当前终端的环境变量语法设置 PORT。

在界面“本地模型配置”中填写自己的阿里百炼 API Key。新机器需要重新配置密钥并重新导入素材；仓库不包含本地密钥、SQLite 数据库、用户素材、生成图片或运行日志。

## 当前操作流程

1. 素材入库：每个 SKU 填写一次商品颜色与保留元素，每张图片指定用途和拍摄类型。
2. 创建工作流：建立白底主图、办公场景、户外场景节点。
3. 补充商品事实，在文本节点生成并采用提示词，也可以手工编写提示词。
4. 生成白底主图。场景生成面板会显示主图预览，可直接点击“采用此主图”固定版本并连接场景节点；采用动作不调用模型。
5. 检查场景提示词后生成场景图；图片自动保存到项目并生成结果节点。
6. 已入库素材可回看、编辑分类；商品级信息按 SKU 统一编辑。

主图生成和文本模型调用会使用你的百炼额度。图片模型为 `qwen-image-2.1-turbo`，文本模型为 `qwen3.7-flash`。主图采用、素材入库和画布编辑仅在本地执行。

## 已有能力与限制

- 已实现：画布引用连线、素材标签、提示词预览采用、原图与 SKU 校验、串行任务、生成结果自动连接保存、具体主图版本采用、构图母版参考、多 SKU 人工并排预览。
- 尚未完成：独立尺寸适配及风格处理节点、完整可版本化模板复制、自动视觉一致性检测、整套素材矩阵打包。电商视频六阶段已接入，详见 [集成文档](docs/ecommerce-video-integration.md)。
- 母版只提供构图参考，生成式编辑不能保证 Logo、文字、商品结构像素级不变，需要人工检查。
- 旧的开发验证接口仍保留部分原工作目录下的文件导入逻辑；新项目请使用画布文件选择器导入，不依赖旧目录结构。
- 本地运行与保存逻辑已验证；不代表已经部署或通过所有实际模型质量验收。

## 验证

```sh
pnpm typecheck
pnpm i18n:check
pnpm test
pnpm build
pnpm test:backend
```

合仓前最近一次检查：592 项前端测试中 587 项通过，5 项因缺少系统 FFmpeg 跳过；类型、多语言与构建通过。测试不需要调用付费模型。

开发状态详见 [项目状态](docs/PRODUCT_PLAN_AND_STATUS.md)。原项目说明保留在 [README.md](README.md)。

## 仓库结构与数据迁移

```text
src/                         主前端及服务端接口
apps/video-agent/backend/    视频流水线、场景包、合成服务
apps/video-agent/frontend/   原项目独立参考界面（保留，不随 dev:all 启动）
apps/video-agent/LICENSE     原视频项目 MIT 许可证
scripts/dev-fullstack.mjs    双服务启动与退出管理
docs/                       电商项目文档
```

后端以 Git subtree 导入，保留 `5645a55` 及之前完整提交历史；原 `lishuang0209/shortfilm-agent` 仓库保留。之后前后端修改统一提交到本仓库的 `main`。

旧机器迁移：停止旧后端后，将旧 `backend/code/`、`config.yaml`、`.env` 和 `registry/models.local.yaml`（存在时）复制到新 `apps/video-agent/backend/` 对应位置。这些文件不会进入 Git。不要复制虚拟环境，使用 `uv sync` 重建。原视频路径为 `code/...` 的相对路径，保持目录结构即可继续访问。前端 `data/` 目录不移动。

`pnpm dev:all` 会检查 3020/8000 端口占用，不会自动终止其他进程。按 Ctrl+C 停止本次启动的两个服务。可用 `ECOMMERCE_WEB_PORT`、`ECOMMERCE_VIDEO_PORT` 修改端口；启动脚本同步设置前端的 `SHORTFILM_BASE_URL`。现有项目若保存了绝对素材 URL，应继续使用默认后端端口。

合仓不是部署；生成媒体和密钥仍只保存在本机，新电脑需另行迁移本地数据。
