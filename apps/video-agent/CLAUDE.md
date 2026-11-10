# CLAUDE.md

Guidance for Claude Code (and other AI coding tools) working in this repository.

## Project

ShortFilm Agent is a reusable AIGC base used to teach AI product managers. A user request goes through a multi-stage pipeline (script → character/scene design → storyboard → reference images → video → post-production) with a user confirmation stop after each stage. **Scenario packages** (`backend/scenarios/<id>/`) decide which stages a project uses, their names, default params, home-page copy and domain prompts. Students mostly adapt the base by adding scenario packages.

- `backend/`: Python FastAPI (uv-managed, Python 3.12)
- `frontend/`: Next.js 16 + React 19 + Tailwind 4
- `docs/`: scenarios (reference, tutorial, examples), architecture, configuration, extending, API
- `integrations/agent-skill/`: optional skill for external agents driving the HTTP API

Backend runs at `http://localhost:8000`, frontend at `http://localhost:3000`. Users write in Chinese; UI text is Simplified Chinese.

## Commands

```bash
./scripts/dev.sh                                    # start both
cd backend && uv run python api_server.py           # backend only
cd backend && uv run --extra dev pytest             # backend tests (includes scenario/prompt checks)
cd frontend && npm run dev                          # frontend dev server
cd frontend && npx tsc --noEmit && npm run build    # frontend checks (lint has pre-existing errors)
python3 scripts/new-scenario.py <id> --from <existing> --name <显示名>   # scaffold a scenario
curl -X POST http://localhost:8000/api/scenarios/reload                  # reload scenarios without restart
```

## Adding or changing a scenario (most common task)

Read `docs/scenarios.md` first. Rules:

- Folder name = scenario id (snake_case). `scenario.yaml` declares `name`, `category` (video/image), `defaults`, `ui`, optional `styles`, and `stages`.
- Built-in stages are listed by `type` (id = type, each at most once, upstream stages first: storyboard needs script_generation, reference_generation needs storyboard, video_generation needs reference_generation, post_production needs video_generation). Custom stages need `id` + `agent: scenarios.<id>.agents:Class` (subclass `AgentInterface`).
- Prompt overrides go in `scenarios/<id>/prompts/<category>/<name>_zh.txt`, mirroring `backend/prompts/`. An override may only use the `{placeholders}` of the default file; escape literal braces as `{{ }}`.
- Script prompts must keep the script format the storyboard parser depends on: `## 第N集`, `**第x集-第y场 日/夜 内/外 场景名**`, a `人物：` line, `<action>` lines, `角色名（情绪）：台词` lines.
- Per-stage `options` reach the agent as `self.stage_options` (script stage: `min_episode_lines` / `max_episode_lines`).
- Always run `cd backend && uv run --extra dev pytest tests/test_scenarios.py` after editing a scenario.

## Architecture

- `backend/core/scenarios.py`: loads and validates scenario packages (`ScenarioRegistry`); invalid packages are skipped and reported in `GET /api/scenarios` → `errors`.
- `backend/core/stages.py`: the 6 built-in stage types (`WorkflowStage`, `STAGE_SPECS`) and `workflow.agents` global agent overrides.
- `backend/core/orchestrator.py`: `WorkflowEngine` — per-session stage list from the scenario (fixed at creation, stored in `meta.scenario`), state machine, persistence (`backend/code/data/sessions/`), cross-stage sync between built-in stages (skipped for stages a scenario lacks). Before running a stage it injects `agent.prompt_dirs`, `agent.scenario`, `agent.stage_options`.
- `backend/core/agents/`: built-in stage agents; `process(input_data, intervention)` returns `{"payload", "requires_intervention", "stage_completed"}`. Load prompts with `self._prompt(category, name, lang)` (scenario dir first, then defaults) — never import the loader directly in agents.
- `backend/config.py`: config = defaults → `config.yaml` (`SFA_CONFIG`) → `SFA_*` env vars; env overrides are never written back. `PROVIDERS` declares every model provider; `workflow.default_scenario` picks the default scenario.
- `backend/models/{llm,vlm,image,video}_client.py`: facades routed by the model's `provider` in `backend/registry/models.yaml` (merged with `models.local.yaml` and `custom_models`).
- Frontend: home page picks a scenario from `GET /api/scenarios`; the workflow view renders the session's `stages` — built-in types use `frontend/components/stages/*Stage.tsx`, custom stages use `GenericStage.tsx`. Branding in `frontend/config/brand.ts`; CSS classes use the `sfa-` prefix.
- Artifacts are stored as paths relative to `backend/` (`code/result/...`) and served at `/code/*`; the server pins its cwd to `backend/`.

## Conventions

- Brand-neutral: never hard-code a product name; use `settings.APP_NAME` (backend) or `brand.name` (frontend).
- UI palette is black/neutral only — no blue/purple accent colors.
- Domain-specific behavior belongs in a scenario package, not in shared agents or default prompts.
- New config knobs go into `DEFAULT_CONFIG` / `PROVIDERS` in `config.py` and `config.yaml.example`, with an `SFA_*` env var where useful.
- Never commit API keys: `backend/config.yaml` and `.env` are git-ignored.
