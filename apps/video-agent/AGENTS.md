# AGENTS.md

Instructions for AI coding agents (Codex, Cursor, Claude Code, etc.). The full project guide is in [CLAUDE.md](CLAUDE.md) — read it first; this file only summarizes the essentials.

- **Most tasks are scenario packages.** To adapt the base to a new domain, add `backend/scenarios/<id>/` (scaffold: `python3 scripts/new-scenario.py <id> --from <existing> --name <显示名>`). Follow `docs/scenarios.md`; do not edit shared agents or default prompts for domain-specific behavior.
- **Prompt overrides** mirror `backend/prompts/` paths, may only use the default file's `{placeholders}`, and must keep the script format (`## 第N集`, `**第x集-第y场 日/夜 内/外 场景名**`, `人物：`, `<action>`, `角色名（情绪）：台词`).
- **Verify before finishing:** `cd backend && uv run --extra dev pytest` and, for frontend changes, `cd frontend && npx tsc --noEmit && npm run build`.
- **Conventions:** UI text in Simplified Chinese; black/neutral UI palette; no hard-coded product name; never commit API keys (`backend/config.yaml`, `.env` are git-ignored).
