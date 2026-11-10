<h1 align="center">ShortFilm Agent</h1>

<p align="center">
  <b>A reusable AIGC agent base: one workflow engine, adaptable to image and video products in any industry</b>
</p>

<p align="center">
  <a href="./README.md">简体中文</a> | <b>English</b>
</p>

---

## What it is

ShortFilm Agent turns a one-line request into a multi-stage production pipeline (copy/script → character and scene design → storyboard → images → video → final cut). Every stage produces assets you can **view, confirm, edit and regenerate item by item**, so a human stays in the loop.

Its core concept is the **scenario package**: one folder per industry scenario, declaring which stages it uses, default parameters, home-page copy and its own prompts. The same engine becomes a different product with a different scenario:

| Built-in scenario | Input | Output | Stages |
| --- | --- | --- | --- |
| **Short film** (`short_film`) | A story idea | A multi-episode short film | 6 |
| **E-commerce ad** (`ecommerce_ad`) | Product and selling points | A 30-45 s vertical ad | 6 |
| **Comic drama** (`comic_drama`) | World and characters | A vertical, episodic comic-style drama | 6 |
| **Travel promo** (`travel_promo`) | Destination and highlights | A 45-60 s promo video | 6 |
| **Product poster** (`product_poster`) | Product and selling points | A set of 3-4 posters (image only) | 4 |

Adding a scenario usually needs **no code**: copy a scenario package and edit its YAML and prompts. Scenarios can also add custom stage agents when prompts are not enough.

It is designed as a teaching base for AI product-management courses: students adapt it to their target industry, mostly through AI coding tools ([CLAUDE.md](CLAUDE.md) / [AGENTS.md](AGENTS.md) tell those tools where to work).

## Quick start

Requirements: Python 3.10+ (3.12 recommended, managed with [uv](https://docs.astral.sh/uv/)), Node.js 18+, ffmpeg, and an API key for at least one model provider.

```bash
./scripts/install.sh      # Windows: scripts\install.bat
./scripts/dev.sh          # backend :8000 + frontend :3000
```

Open http://localhost:3000, enter API keys on the Settings page, pick a scenario and describe what you want.

Manual:

```bash
cd backend && uv sync --python 3.12 && cp config.yaml.example config.yaml && uv run python api_server.py
cd frontend && npm install && npm run dev
```

Docker:

```bash
cp .env.example .env      # fill in SFA_*_API_KEY
docker compose up --build
```

## Make your own scenario

```bash
python3 scripts/new-scenario.py my_scenario --from ecommerce_ad --name "My scenario"
```

Then edit `backend/scenarios/my_scenario/scenario.yaml` and its `prompts/`, run `cd backend && uv run --extra dev pytest tests/test_scenarios.py`, and reload (`POST /api/scenarios/reload` or restart the backend). Docs (Chinese):

- [Your first scenario in 30 minutes](docs/tutorial-first-scenario.md)
- [How the built-in scenarios are designed](docs/examples.md)
- [Scenario package reference](docs/scenarios.md)
- [Extending](docs/extending.md) · [Architecture](docs/architecture.md) · [Configuration](docs/configuration.md) · [HTTP API](docs/api.md) · [Contributing](CONTRIBUTING.md)

## Configuration

Three layers, later wins: defaults in `backend/config.py` → `backend/config.yaml` (written by the Settings page) → `SFA_*` environment variables (runtime only, never written back). `backend/config.yaml` and `.env` are git-ignored; never commit API keys.

## Tests

```bash
cd backend && uv run --extra dev pytest
cd frontend && npx tsc --noEmit && npm run build
```

## License

[MIT](./LICENSE)
