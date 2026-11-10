# 初始化后端

配置并启动 FastAPI 后端服务。

## 步骤1：进入后端目录

```bash
cd backend
```

## 步骤2：同步依赖（首次）

后端使用 [uv](https://docs.astral.sh/uv/) 管理 `.venv`（Python 3.12），无需手动创建或激活虚拟环境：

```bash
uv sync
```

> **备用方案**：若不使用 uv，可手动创建虚拟环境后用 pip 安装：
> ```bash
> python3.12 -m venv .venv && source .venv/bin/activate
> pip install -r requirements.txt   # 若仓库提供该文件
> ```

## 步骤3：配置后端 YAML

```bash
# 复制配置示例文件
cp config.yaml.example config.yaml
```

然后编辑 `config.yaml` 文件，或启动前端后通过侧边栏底部「设置」页面填写必要配置：

| 字段 | 说明 | 获取方式 |
|------|------|----------|
| `models.llm` | 默认 LLM 模型名 | 按后端模型注册表选择 |
| `api_providers.dashscope.api_key` | 阿里云 DashScope API Key | [阿里云百炼](https://dashscope.console.aliyun.com/) |
| `api_providers.ark.api_key` | 火山方舟 API Key | [火山方舟](https://www.volcengine.com/product/ark) |
| `api_providers.openai.api_key` | OpenAI 兼容 API Key | 根据实际部署情况 |
| `api_providers.deepseek.api_key` | DeepSeek API Key | [DeepSeek](https://platform.deepseek.com/) |
| `api_providers.kling.access_key` / `api_providers.kling.secret_key` | Kling 视频模型鉴权 | [Kling 开放平台](https://klingai.com/cn/dev) |
| `models.*` | 默认 LLM、图片、视频、评估模型 | 按后端模型注册表选择 |
| `server.host` / `server.port` / `server.debug` | 后端服务地址、端口和调试开关 | 本地部署配置 |
| `api_providers.common.proxy` / `api_providers.<provider>.enable_proxy` | 统一代理地址，以及每个模型提供商是否启用代理 | 默认不启用代理 |

> ⚠️ **重要**：至少需要配置一个 LLM 和一个图片/视频生成 API，否则无法正常使用。

## 步骤4：启动后端

```bash
uv run python api_server.py
```

## 步骤5：验证

```bash
curl http://localhost:8000/api/health
```

返回 `{"status":"ok"}` 表示成功。

## 常见问题

| 错误 | 原因 | 解决方法 |
|------|------|----------|
| `python: command not found` | Python 未安装 | 安装 Python 3.12（或使用 uv 自动管理） |
| `uv: command not found` | uv 未安装 | 参考 uv 官方文档安装，或使用上面的 pip 备用方案 |
| `ModuleNotFoundError` | 依赖未安装 | `uv sync` |
| 模型 API Key 缺失 | `config.yaml` 未配置 | 编辑 `config.yaml` 或在前端「设置」页面填入 API Key |
| `Address already in use` | 端口 8000 被占用 | `lsof -ti :8000 | xargs kill` |
