# ShortFilm Agent — Agent Skill（可选集成）

本目录是一个**可选的 Agent Skill**，让外部 Agent（如 OpenClaw、Claude Code）通过 ShortFilm Agent（AI 短片创作 Agent）后端的 HTTP API，按 6 个阶段（剧本 → 角色/场景 → 分镜 → 参考图 → 视频 → 后期）完成短片创作。每个阶段产物都会展示给用户，并在确认停止点等待用户确认后才继续。

此外还包含可选的飞书 / 微信消息发送文档（`references/send_message/`），用于把进度和产物推送给用户。

## 是否需要？

**不需要。** 运行 ShortFilm Agent 本身（后端 + 前端）完全不依赖本目录；仅当你希望由外部 Agent 代替手动操作界面时才使用。

## 安装

将整个 `integrations/agent-skill/` 文件夹复制到 Agent 的 skills 目录，并以 `shortfilm-agent` 命名，例如：

```bash
cp -r integrations/agent-skill ~/.claude/skills/shortfilm-agent
```

其他 Agent（如 OpenClaw）请复制到其对应的 skills 目录。随后让 Agent 阅读 `SKILL.md`，按其中的指引初始化并启动项目（后端 `cd backend && uv run python api_server.py`，前端 `cd frontend && npm run build && npm start`）。

## 目录

- `SKILL.md`：skill 正文与工作流规则
- `references/`：初始化、启动、六阶段工作流 API、临时工作台、Pipeline、消息发送等参考文档
