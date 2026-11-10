# ShortFilm Agent — Frontend

Web UI for **ShortFilm Agent**（AI 短片创作 Agent）: chat-driven short-film creation, one-click pipelines and a sandbox workbench. Built with Next.js 16, React 19 and Tailwind CSS 4. It talks to the Python backend in `../backend`.

## Commands

```bash
npm install        # install dependencies
npm run dev        # dev server on http://localhost:3000
npm run lint       # ESLint
npm run build      # production build
npm start          # serve the production build (next start)
```

## Environment variables

Copy `.env.example` to `.env.local` and adjust. All of these are read at **build time** — rebuild after changing them.

| Variable | Default | Purpose |
| --- | --- | --- |
| `BACKEND_API_URL` | `http://127.0.0.1:8000` | Target of the `/api/*` and `/code/*` rewrites in `next.config.ts` |
| `NEXT_PUBLIC_API_URL` | `http://127.0.0.1:8000` | Base URL the browser uses for direct SSE streaming connections |
| `NEXT_PUBLIC_APP_NAME` | `ShortFilm Agent` | Product name (page title, sidebar, top bar) |
| `NEXT_PUBLIC_APP_TAGLINE` | `AI 短片创作 Agent` | Tagline / meta description |

## Branding

Branding lives in `config/brand.ts` (`brand.name`, `brand.tagline`, `brand.storagePrefix`). To re-skin:

- set the `NEXT_PUBLIC_APP_*` variables, or edit the defaults in `config/brand.ts`;
- theme styles use the `sfa-` class prefix in `app/globals.css`;
- localStorage keys are namespaced with `brand.storagePrefix` (default `sfa`).

## Docker

```bash
docker build -t shortfilm-agent-frontend \
  --build-arg BACKEND_API_URL=http://backend:8000 \
  --build-arg NEXT_PUBLIC_API_URL=http://localhost:8000 \
  .
docker run -p 3000:3000 shortfilm-agent-frontend
```
