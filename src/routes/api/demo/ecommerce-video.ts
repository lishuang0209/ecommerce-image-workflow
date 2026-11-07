import { randomUUID } from 'node:crypto';

import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { buildTextCard } from '@/core/beatcanvas/text-nodes';
import { persistBeatDesignCommand } from '@/core/commands/persist';
import { loadProjectWithLatestSnapshot } from '@/core/projects/projects';
import {
  continueShortfilm,
  getShortfilmScript,
  getShortfilmStatus,
  isShortfilmOnline,
  runShortfilmStage,
  ShortfilmRequestError,
  startShortfilmProject,
} from '@/core/video/shortfilm-client';
import {
  buildScriptCardText,
  scriptCardName,
  scriptIsReady,
  SHORTFILM_SCRIPT_CARD_ID,
  SHORTFILM_SCRIPT_STAGE,
  SHORTFILM_STAGES,
  type ShortfilmScriptArtifact,
  type ShortfilmStageProgress,
  type ShortfilmStatus,
} from '@/core/video/shortfilm-contract';
import {
  readShortfilmSession,
  writeShortfilmSession,
} from '@/core/video/shortfilm-session';
import {
  readRequestJsonWithLimit,
  RequestBodyTooLargeError,
} from '@/lib/request-body-limit';
import { validateTrustedWorkspaceJsonMutation } from '@/lib/trusted-local-request';

const MAX_REQUEST_BYTES = 64 * 1024;

const localeSchema = z.enum(['zh', 'en', 'ja']).optional();

const startSchema = z
  .object({
    projectId: z.string().uuid(),
    action: z.literal('start'),
    idea: z.string().trim().min(1).max(12_000),
    style: z.string().trim().max(100).optional(),
    episodes: z.number().int().min(1).max(10).optional(),
    videoRatio: z
      .enum(['9:16', '16:9', '1:1', '4:5', '3:4'])
      .optional(),
    locale: localeSchema,
  })
  .strict();

const runSchema = z
  .object({
    projectId: z.string().uuid(),
    action: z.literal('run'),
    locale: localeSchema,
  })
  .strict();

const continueSchema = z
  .object({
    projectId: z.string().uuid(),
    action: z.literal('continue'),
    locale: localeSchema,
  })
  .strict();

const bodySchema = z.discriminatedUnion('action', [
  startSchema,
  runSchema,
  continueSchema,
]);

const modelDefaults = () => ({
  llmModel: process.env.SHORTFILM_LLM_MODEL?.trim() || 'qwen3.5-plus',
  vlmModel: process.env.SHORTFILM_VLM_MODEL?.trim() || 'qwen3.5-plus',
  imageT2iModel: process.env.SHORTFILM_IMAGE_T2I_MODEL?.trim() || 'wan2.7-image',
  imageIt2iModel:
    process.env.SHORTFILM_IMAGE_IT2I_MODEL?.trim() || 'wan2.7-image',
  videoModel: process.env.SHORTFILM_VIDEO_MODEL?.trim() || 'wan2.7-i2v',
  videoFirstFrameModel:
    process.env.SHORTFILM_VIDEO_FIRST_FRAME_MODEL?.trim() || 'wan2.7-i2v',
  videoStartEndModel:
    process.env.SHORTFILM_VIDEO_START_END_MODEL?.trim() || 'wan2.7-i2v',
  videoReferenceModel:
    process.env.SHORTFILM_VIDEO_REFERENCE_MODEL?.trim() || 'wan2.7-r2v',
});

const defaultStyle = () =>
  process.env.SHORTFILM_STYLE?.trim() || 'realistic';
const defaultVideoRatio = () =>
  process.env.SHORTFILM_VIDEO_RATIO?.trim() || '9:16';
const defaultVideoResolution = () =>
  process.env.SHORTFILM_VIDEO_RESOLUTION?.trim() || '720P';

const stageViews = (
  status?: Record<string, string>,
  progress?: Record<string, ShortfilmStageProgress>
) =>
  SHORTFILM_STAGES.map((stage) => ({
    ...stage,
    status: status?.[stage.id] ?? 'pending',
    progress: progress?.[stage.id]?.percent,
    message:
      progress?.[stage.id]?.message ?? progress?.[stage.id]?.step ?? null,
  }));

const errorMessage = (error: unknown) => {
  if (error instanceof ShortfilmRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Video request failed.';
};

const errorResponse = (error: unknown, status = 502) =>
  Response.json({ error: errorMessage(error) }, { status });

async function loadVideoProject(projectId: string) {
  const state = await loadProjectWithLatestSnapshot({ projectId });
  if (!state) return { error: 'Project not found.' as const };
  if (state.snapshot.workflows?.product !== 'video') {
    return { error: 'This project is not a video project.' as const };
  }
  return { state };
}

async function readState(projectId: string) {
  const [connected, session] = await Promise.all([
    isShortfilmOnline(),
    readShortfilmSession(projectId),
  ]);

  if (!session) {
    return {
      connected,
      sessionId: null,
      stages: stageViews(),
      script: null,
      status: {},
      stageProgress: {},
      currentStage: null,
      confirmedStages: [],
      error: null,
    };
  }

  if (!connected) {
    return {
      connected: false,
      sessionId: session.sessionId,
      stages: stageViews(),
      script: null,
      status: {},
      stageProgress: {},
      currentStage: null,
      confirmedStages: session.confirmedStages ?? [],
      error: 'Video service is offline.',
    };
  }

  let status: ShortfilmStatus;
  try {
    status = await getShortfilmStatus(session.sessionId);
  } catch (error) {
    if (
      error instanceof ShortfilmRequestError &&
      (error.status === 404 || error.status === 410)
    ) {
      return {
        connected: true,
        sessionId: session.sessionId,
        missing: true,
        stages: stageViews(),
        script: null,
        status: {},
        stageProgress: {},
        currentStage: null,
        confirmedStages: session.confirmedStages ?? [],
        error: 'Video session not found. Start a new session.',
      };
    }
    throw error;
  }

  let script: ShortfilmScriptArtifact | null = null;
  if (scriptIsReady(status.status)) {
    try {
      script = await getShortfilmScript(session.sessionId);
    } catch {
      script = null;
    }
  }

  return {
    connected: true,
    sessionId: session.sessionId,
    missing: false,
    stages: stageViews(status.status, status.stage_progress),
    script,
    status: status.status ?? {},
    stageProgress: status.stage_progress ?? {},
    currentStage: status.current_stage ?? null,
    confirmedStages: session.confirmedStages ?? [],
    error: status.error ?? null,
  };
}

async function importScriptCard(
  projectId: string,
  script: ShortfilmScriptArtifact,
  locale?: string
) {
  const text = buildScriptCardText(script);
  if (!text.trim()) throw new Error('The generated script is empty.');

  let lastError = 'Unable to add the script to the canvas.';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const state = await loadProjectWithLatestSnapshot({ projectId });
    if (!state) throw new Error('Project not found.');

    const commandId = randomUUID();
    const frame = state.snapshot.frames[SHORTFILM_SCRIPT_CARD_ID] ?? {
      x: 520,
      y: 520,
      w: 520,
      h: 420,
    };
    const result = await persistBeatDesignCommand({
      projectId,
      origin: 'ui',
      commandId,
      idempotencyKey: commandId,
      expectedRevision: state.snapshotVersion,
      command: {
        type: 'canvas.apply',
        operations: [
          {
            type: 'upsert_card',
            card: buildTextCard({
              id: SHORTFILM_SCRIPT_CARD_ID,
              name: scriptCardName(locale),
              textContent: text,
              textRole: 'script',
            }),
            frame,
          },
        ],
      },
    });
    if (result.ok) {
      const saved = await loadProjectWithLatestSnapshot({ projectId });
      if (!saved) throw new Error('Project not found after saving the script.');
      return {
        document: saved.snapshot,
        version: saved.snapshotVersion,
        importedCardId: SHORTFILM_SCRIPT_CARD_ID,
      };
    }
    lastError = result.message;
  }

  throw new Error(lastError);
}

async function GET({ request }: { request: Request }) {
  const projectId = new URL(request.url).searchParams.get('projectId') ?? '';
  if (!z.string().uuid().safeParse(projectId).success) {
    return Response.json({ error: 'A valid projectId is required.' }, { status: 400 });
  }

  const project = await loadVideoProject(projectId);
  if ('error' in project) {
    return Response.json({ error: project.error }, { status: 404 });
  }

  try {
    return Response.json(await readState(projectId));
  } catch (error) {
    return errorResponse(error);
  }
}

async function POST({ request }: { request: Request }) {
  const trust = validateTrustedWorkspaceJsonMutation(request);
  if (!trust.ok) {
    return Response.json({ error: trust.message }, { status: trust.status });
  }

  let payload: unknown;
  try {
    payload = await readRequestJsonWithLimit(request, MAX_REQUEST_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return Response.json({ error: 'Request body is too large.' }, { status: 413 });
    }
    return Response.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid video request.' }, { status: 400 });
  }

  const body = parsed.data;
  const project = await loadVideoProject(body.projectId);
  if ('error' in project) {
    return Response.json({ error: project.error }, { status: 404 });
  }

  try {
    if (body.action === 'start') {
      const existing = await readShortfilmSession(body.projectId);
      if (existing) {
        try {
          const status = await getShortfilmStatus(existing.sessionId);
          return Response.json({
            sessionId: existing.sessionId,
            reused: true,
            status: status.status ?? {},
          });
        } catch (error) {
          if (
            !(error instanceof ShortfilmRequestError) ||
            (error.status !== 404 && error.status !== 410)
          ) {
            throw error;
          }
        }
      }

      const models = modelDefaults();
      const started = await startShortfilmProject({
        idea: body.idea,
        style: body.style || defaultStyle(),
        episodes: body.episodes ?? 1,
        videoRatio: body.videoRatio || defaultVideoRatio(),
        videoResolution: defaultVideoResolution(),
        ...models,
      });
      await writeShortfilmSession({
        projectId: body.projectId,
        sessionId: started.session_id,
        scenario: 'ecommerce_ad',
        createdAt: new Date().toISOString(),
      });
      return Response.json({
        sessionId: started.session_id,
        stages: started.stages ?? [],
        status: started.status ?? {},
      });
    }

    const session = await readShortfilmSession(body.projectId);
    if (!session) {
      return Response.json(
        { error: 'Start the video session before running a stage.' },
        { status: 400 }
      );
    }

    if (body.action === 'continue') {
      const result = await continueShortfilm(session.sessionId);
      const confirmed = new Set(session.confirmedStages ?? []);
      confirmed.add(SHORTFILM_SCRIPT_STAGE);
      await writeShortfilmSession({
        ...session,
        confirmedStages: [...confirmed],
      });
      const state = await readState(body.projectId);
      return Response.json({
        sessionId: session.sessionId,
        result,
        state,
      });
    }

    await runShortfilmStage(session.sessionId, SHORTFILM_SCRIPT_STAGE);
    const status = await getShortfilmStatus(session.sessionId);
    const scriptStatus = status.status?.[SHORTFILM_SCRIPT_STAGE];
    if (scriptStatus === 'error') {
      throw new Error(status.error || 'Script generation failed.');
    }
    if (scriptStatus !== 'completed' && scriptStatus !== 'waiting') {
      throw new Error(
        `Script generation did not finish (status: ${scriptStatus ?? 'unknown'}).`
      );
    }

    const script = await getShortfilmScript(session.sessionId);
    const imported = await importScriptCard(
      body.projectId,
      script,
      body.locale
    );
    // A regenerated script needs a fresh confirmation before continuing.
    await writeShortfilmSession({
      ...session,
      confirmedStages: (session.confirmedStages ?? []).filter(
        (stage) => stage !== SHORTFILM_SCRIPT_STAGE
      ),
    });
    const state = await readState(body.projectId);
    return Response.json({
      sessionId: session.sessionId,
      status: status.status ?? {},
      script,
      ...imported,
      state,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export const Route = createFileRoute('/api/demo/ecommerce-video')({
  server: { handlers: { GET, POST } },
});
