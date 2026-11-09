import { createHash, randomUUID } from 'node:crypto';

import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { buildTextCard } from '@/core/beatcanvas/text-nodes';
import type { CanvasCard } from '@/core/beatcanvas/canvas-types';
import { persistBeatDesignCommand } from '@/core/commands/persist';
import { loadProjectWithLatestSnapshot } from '@/core/projects/projects';
import {
  continueShortfilm,
  updateShortfilmDesignAsset,
  regenerateShortfilmDesignAsset,
  getShortfilmDesign,
  getShortfilmReferences,
  getShortfilmVideos,
  getShortfilmFinal,
  updateShortfilmVideos,
  regenerateShortfilmVideos,
  updateShortfilmReferences,
  regenerateShortfilmReferences,
  getShortfilmScript,
  getShortfilmStoryboard,
  updateShortfilmStoryboard,
  getShortfilmStatus,
  isShortfilmOnline,
  runShortfilmStage,
  ShortfilmRequestError,
  startShortfilmProject,
} from '@/core/video/shortfilm-client';
import {
  SHORTFILM_FINAL_STAGE,
  finalIsReady,
  hasFinalContent,
  finalCardName,
  type ShortfilmFinalArtifact,
  SHORTFILM_VIDEO_STAGE,
  videoIsReady,
  hasVideoContent,
  videoCardName,
  videoSegmentDescription,
  type ShortfilmVideoArtifact,
  SHORTFILM_REFERENCE_STAGE,
  referenceIsReady,
  hasReferenceContent,
  referenceCardName,
  type ShortfilmReferenceArtifact,
  buildScriptCardText,
  buildStoryboardCardText,
  confirmationsBeforeStage,
  hasStoryboardContent,
  storyboardCardName,
  storyboardIsReady,
  SHORTFILM_STORYBOARD_STAGE,
  SHORTFILM_STORYBOARD_CARD_ID,
  type ShortfilmStoryboardArtifact,
  designCardName,
  designIsReady,
  scriptCardName,
  scriptIsReady,
  SHORTFILM_DESIGN_STAGE,
  SHORTFILM_SCRIPT_CARD_ID,
  SHORTFILM_SCRIPT_STAGE,
  SHORTFILM_STAGES,
  type ShortfilmDesignArtifact,
  type ShortfilmScriptArtifact,
  type ShortfilmStageProgress,
  type ShortfilmStatus,
} from '@/core/video/shortfilm-contract';
import {
  importShortfilmImage,
  importShortfilmVideo,
  shortfilmAssetUrl,
} from '@/core/video/import-shortfilm-assets';
import {
  readShortfilmSession,
  writeShortfilmSession,
} from '@/core/video/shortfilm-session';
import {
  readRequestJsonWithLimit,
  RequestBodyTooLargeError,
} from '@/lib/request-body-limit';
import { validateTrustedWorkspaceJsonMutation } from '@/lib/trusted-local-request';

import { buildShortfilmCanvasLinks } from '@/core/video/shortfilm-canvas-links';
import { mergeStoryboardEdits, storyboardEditSchema } from '@/core/video/shortfilm-storyboard-edit';

const storyboardRevision = (artifact: ShortfilmStoryboardArtifact) =>
  createHash('sha256').update(JSON.stringify(artifact)).digest('hex');

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
    stage: z.enum(['script_generation', 'character_design', 'storyboard', 'reference_generation', 'video_generation', 'post_production']).optional(),
    locale: localeSchema,
  })
  .strict();

const continueSchema = z
  .object({
    projectId: z.string().uuid(),
    action: z.literal('continue'),
    stage: z.enum(['script_generation', 'character_design', 'storyboard', 'reference_generation', 'video_generation', 'post_production']).optional(),
    locale: localeSchema,
  })
  .strict();

const designAssetSchema = z.object({
  projectId: z.string().uuid(),
  action: z.literal('design_asset'),
  operation: z.enum(['save', 'regenerate']),
  group: z.enum(['characters', 'settings']),
  assetId: z.string().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(12_000),
  locale: localeSchema,
}).strict();

const saveStoryboardSchema = z.object({
  projectId: z.string().uuid(),
  action: z.literal('save_storyboard'),
  baseRevision: z.string().regex(/^[a-f0-9]{64}$/),
  edits: storyboardEditSchema,
  locale: localeSchema,
}).strict();

const bodySchema = z.discriminatedUnion('action', [
  startSchema,
  z.object({ projectId: z.string().uuid(), action: z.literal('sync_canvas'), locale: localeSchema }).strict(),
  designAssetSchema,
  saveStoryboardSchema,
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
      design: null,
      storyboard: null,
      storyboardStale: false,
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
      design: null,
      storyboard: null,
      storyboardStale: session?.storyboardStale ?? false,
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
        design: null,
        storyboard: null,
        storyboardStale: session.storyboardStale ?? false,
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

  let design: ShortfilmDesignArtifact | null = null;
  if (designIsReady(status.status)) {
    try {
      const raw = await getShortfilmDesign(session.sessionId);
      const resolveAssets = (assets?: Array<{
        id: string;
        name: string;
        description?: string;
        selected?: string;
        versions?: string[];
        status?: string;
      }>) =>
        (assets ?? []).map((asset) => ({
          ...asset,
          selected: asset.selected
            ? shortfilmAssetUrl(asset.selected)
            : undefined,
          versions: (asset.versions ?? []).map((version) =>
            shortfilmAssetUrl(version)
          ),
        }));
      design = {
        ...raw,
        characters: resolveAssets(raw.characters),
        settings: resolveAssets(raw.settings),
      };
    } catch {
      design = null;
    }
  }

  let storyboard: ShortfilmStoryboardArtifact | null = null;
  try {
    const artifact = await getShortfilmStoryboard(session.sessionId);
    if (artifact.episodes?.length) storyboard = artifact;
  } catch {
    // A session may not have reached the storyboard stage yet.
  }

  let reference: ShortfilmReferenceArtifact | null = null;
  try {
    const raw = await getShortfilmReferences(session.sessionId);
    const saved = await loadProjectWithLatestSnapshot({ projectId });
    reference = { scenes: (raw.scenes ?? []).map((scene) => ({ ...scene,
      selected: saved?.snapshot.cards.find((card) => card.id === `video-reference-${scene.id}`)?.url ?? undefined,
      versions: undefined,
    })) };
  } catch { /* Not generated yet. */ }

  let video: ShortfilmVideoArtifact | null = null;
  try {
    const raw = await getShortfilmVideos(session.sessionId);
    const saved = await loadProjectWithLatestSnapshot({ projectId });
    video = { clips: (raw.clips ?? []).map((scene) => ({ ...scene,
      selected: saved?.snapshot.cards.find((card) => card.id === `video-clip-${scene.id}`)?.url ?? undefined,
      versions: undefined,
    })) };
  } catch { /* Not generated yet. */ }

  let final: ShortfilmFinalArtifact | null = null;
  try {
    const raw = await getShortfilmFinal(session.sessionId);
    const saved = await loadProjectWithLatestSnapshot({ projectId });
    final = { final_videos: (raw.final_videos ?? []).map((video) => ({ ...video,
      path: saved?.snapshot.cards.find((card) => card.id === `video-final-episode-${video.episode}`)?.url ?? '',
    })) };
  } catch { /* No final video yet. */ }

  return {
    connected: true,
    sessionId: session.sessionId,
    missing: false,
    stages: stageViews(status.status, status.stage_progress),
    script,
    design,
    storyboard,
    final,
    finalStale: session.finalStale ?? true,
    video,
    videoStale: session.videoStale ?? true,
    reference,
    referenceStale: session.referenceStale ?? true,
    storyboardRevision: storyboard ? storyboardRevision(storyboard) : null,
    storyboardStale: session.storyboardStale ?? false,
    status: status.status ?? {},
    stageProgress: status.stage_progress ?? {},
    currentStage: status.current_stage ?? null,
    confirmedStages: session.confirmedStages ?? [],
    error: status.error ?? null,
  };
}

async function syncCanvasLinks(projectId: string) {
  const session = await readShortfilmSession(projectId);
  let storyboard: ShortfilmStoryboardArtifact | null = null;
  if (session) {
    try { storyboard = await getShortfilmStoryboard(session.sessionId); } catch { /* Earlier links can still be restored offline. */ }
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const saved = await loadProjectWithLatestSnapshot({ projectId });
    if (!saved) throw new Error('Project not found.');
    const operations = buildShortfilmCanvasLinks(saved.snapshot.cards, storyboard);
    if (!operations.length) return { document: saved.snapshot, version: saved.snapshotVersion };
    const commandId = randomUUID();
    const result = await persistBeatDesignCommand({ projectId, origin: 'ui', commandId,
      idempotencyKey: commandId, expectedRevision: saved.snapshotVersion,
      command: { type: 'canvas.apply', operations } });
    if (result.ok) {
      const updated = await loadProjectWithLatestSnapshot({ projectId });
      if (!updated) throw new Error('Project not found.');
      return { document: updated.snapshot, version: updated.snapshotVersion };
    }
    if (result.code !== 'REVISION_CONFLICT') throw new Error(result.message);
  }
  throw new Error('Canvas changed during link synchronization. Please refresh and try again.');
}

async function importTextCard(
  projectId: string,
  card: { id: string; name: string; text: string; x: number }
) {
  const cardId = card.id;
  const text = card.text;
  if (!text.trim()) throw new Error('The generated text is empty.');

  let lastError = 'Unable to add the script to the canvas.';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const state = await loadProjectWithLatestSnapshot({ projectId });
    if (!state) throw new Error('Project not found.');

    const commandId = randomUUID();
    const frame = state.snapshot.frames[cardId] ?? {
      x: card.x,
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
            card: { ...buildTextCard({
              id: cardId,
              name: card.name,
              textContent: text,
              textRole: 'script',
            }), referenceCardIds: state.snapshot.cards.find((item) => item.id === cardId)?.referenceCardIds ?? [] },
            frame,
          },
        ],
      },
    });
    if (result.ok) {
      const saved = await loadProjectWithLatestSnapshot({ projectId });
      if (!saved) throw new Error('Project not found after saving the script.');
      return {
        ...await syncCanvasLinks(projectId),
        importedCardId: cardId,
      };
    }
    lastError = result.message;
  }

  throw new Error(lastError);
}

async function importDesignCards(
  projectId: string,
  design: ShortfilmDesignArtifact,
  locale?: string,
  mode: 'design' | 'reference' | 'clip' | 'final' = 'design'
) {
  const assets = [
    ...(design.characters ?? []).map((asset) => ({
      ...asset,
      kind: 'character' as const,
    })),
    ...(design.settings ?? []).map((asset) => ({
      ...asset,
      kind: 'setting' as const,
    })),
  ];
  const withImage = assets.filter(
    (asset) => asset.selected || (asset.versions?.length ?? 0) > 0
  );

  const empty = async () => {
    const saved = await loadProjectWithLatestSnapshot({ projectId });
    return {
      document: saved?.snapshot ?? null,
      version: saved?.snapshotVersion ?? null,
      importedCardIds: [] as string[],
      importedCount: 0,
    };
  };
  if (withImage.length === 0) return empty();

  const imported: Array<{
    shortfilmId: string;
    kind: 'character' | 'setting';
    name: string;
    assetId: string;
    publicUrl: string;
    durationSec?: number;
  }> = [];
  for (const asset of withImage) {
    const path = asset.selected || asset.versions!.at(-1)!;
    const image = await ((mode === 'clip' || mode === 'final') ? importShortfilmVideo : importShortfilmImage)({
      projectId,
      url: shortfilmAssetUrl(path),
      filename: `${asset.id}.${(mode === 'clip' || mode === 'final') ? 'mp4' : 'png'}`,
      metadata: {
        shortfilmAssetId: asset.id,
        kind: mode === 'design' ? asset.kind : mode,
        name: asset.name,
      },
    });
    imported.push({
      shortfilmId: asset.id,
      kind: asset.kind,
      name: asset.name,
      assetId: image.assetId,
      publicUrl: image.publicUrl,
      durationSec: 'duration' in asset && typeof asset.duration === 'number' ? asset.duration : undefined,
    });
  }

  let lastError = 'Unable to add design images to the canvas.';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const state = await loadProjectWithLatestSnapshot({ projectId });
    if (!state) throw new Error('Project not found.');

    const operations: Array<{
      type: 'upsert_card';
      card: CanvasCard;
      frame: { x: number; y: number; w: number; h: number };
    }> = [];
    imported.forEach((item, index) => {
      const cardId = `video-${mode}-${item.shortfilmId}`;
      const frame = state.snapshot.frames[cardId] ?? {
        x: 120 + (index % 3) * 380,
        y: (mode === 'final' ? 3820 : mode === 'clip' ? 2860 : mode === 'reference' ? 1900 : 940) + Math.floor(index / 3) * 360,
        w: 340,
        h: 320,
      };
      operations.push({
        type: 'upsert_card',
        card: {
          ...buildTextCard({
            id: cardId,
            name: mode === 'final' ? finalCardName(item.name, locale) : mode === 'clip' ? videoCardName(item.name, locale) : mode === 'reference' ? referenceCardName(item.name, locale) : designCardName(item.kind, item.name, locale),
          }),
          referenceCardIds: state.snapshot.cards.find((card) => card.id === cardId)?.referenceCardIds ?? [],
          kind: 'asset',
          type: (mode === 'clip' || mode === 'final') ? 'video' : 'image',
          assetId: item.assetId,
          durationSec: item.durationSec,
          url: item.publicUrl,
          status: 'succeeded',
        } as CanvasCard,
        frame,
      });
    });

    const commandId = randomUUID();
    const result = await persistBeatDesignCommand({
      projectId,
      origin: 'ui',
      commandId,
      idempotencyKey: commandId,
      expectedRevision: state.snapshotVersion,
      command: { type: 'canvas.apply', operations },
    });
    if (result.ok) {
      const saved = await loadProjectWithLatestSnapshot({ projectId });
      if (!saved) {
        throw new Error('Project not found after saving design images.');
      }
      return {
        ...await syncCanvasLinks(projectId),
        importedCardIds: imported.map((item) => `video-${mode}-${item.shortfilmId}`),
        importedCount: imported.length,
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
    if (body.action === 'sync_canvas') {
      return Response.json(await syncCanvasLinks(body.projectId));
    }
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

    const workflowStatus = await getShortfilmStatus(session.sessionId);
    if (Object.values(workflowStatus.status ?? {}).includes('running')) {
      return Response.json({ error: 'Wait for the current generation to finish.' }, { status: 409 });
    }

    if (body.action === 'save_storyboard') {
      if (session.storyboardStale || ![SHORTFILM_SCRIPT_STAGE, SHORTFILM_DESIGN_STAGE].every(
        (stage) => session.confirmedStages?.includes(stage)
      )) {
        return Response.json({ error: 'Regenerate the storyboard with the latest confirmed designs before editing.' }, { status: 409 });
      }
      const current = await getShortfilmStoryboard(session.sessionId);
      if (!storyboardIsReady(workflowStatus.status) || !current.episodes?.length ||
          storyboardRevision(current) !== body.baseRevision) {
        return Response.json({ error: 'The storyboard changed. Reload it before saving your edits.' }, { status: 409 });
      }
      let updated: ShortfilmStoryboardArtifact;
      try {
        updated = mergeStoryboardEdits(current, body.edits);
      } catch {
        return Response.json({ error: 'Storyboard structure changed. Reload before editing.' }, { status: 409 });
      }
      // Invalidate confirmation before either persistence step, including failure cases.
      await writeShortfilmSession({
        ...session,
        confirmedStages: confirmationsBeforeStage(session.confirmedStages, SHORTFILM_STORYBOARD_STAGE),
        referenceStale: true, videoStale: true, finalStale: true,
      });
      await updateShortfilmStoryboard(session.sessionId, updated);
      const imported = await importTextCard(body.projectId, {
        id: SHORTFILM_STORYBOARD_CARD_ID,
        name: storyboardCardName(body.locale),
        text: buildStoryboardCardText(updated, body.locale),
        x: 1080,
      });
      return Response.json({ ...imported, state: await readState(body.projectId) });
    }

    if (body.action === 'design_asset') {
      const design = await getShortfilmDesign(session.sessionId);
      if (!(design[body.group] ?? []).some((asset) => asset.id === body.assetId)) {
        return Response.json({ error: 'Design asset not found.' }, { status: 404 });
      }
      const asset = { id: body.assetId, name: body.name, description: body.description };
      // Invalidate confirmation before a potentially long or failed generation.
      await writeShortfilmSession({
        ...session,
        confirmedStages: confirmationsBeforeStage(session.confirmedStages, SHORTFILM_DESIGN_STAGE),
        storyboardStale: true,
        referenceStale: true, videoStale: true, finalStale: true,
      });
      if (body.operation === 'save') {
        await updateShortfilmDesignAsset(session.sessionId, body.group, asset);
      } else {
        await regenerateShortfilmDesignAsset(session.sessionId, body.group, asset);
      }
      const updated = await getShortfilmDesign(session.sessionId);
      let updatedAsset = updated[body.group]?.find((item) => item.id === body.assetId);
      const status = await getShortfilmStatus(session.sessionId);
      if (status.status?.[SHORTFILM_DESIGN_STAGE] === 'error' ||
          (body.operation === 'regenerate' && updatedAsset?.status === 'failed')) {
        throw new Error(status.error || 'Design generation failed.');
      }
      if (body.operation === 'regenerate') {
        const previous = design[body.group]?.find((item) => item.id === body.assetId);
        const previousPaths = new Set([...(previous?.versions ?? []), previous?.selected].filter(Boolean));
        const generatedPath = updatedAsset?.versions?.filter((path) => !previousPaths.has(path)).at(-1);
        if (!generatedPath) throw new Error('No new image was generated. The previous image has been preserved.');
        // The engine intentionally preserves the previous selection during item regeneration.
        // Explicitly select the new version for the panel and the corresponding canvas card.
        await updateShortfilmDesignAsset(session.sessionId, body.group, { ...asset, selected: generatedPath });
        updatedAsset = { ...updatedAsset!, selected: generatedPath };
      }
      // Update the existing card for this asset; leave unrelated cards untouched.
      const imported = await importDesignCards(body.projectId, {
        [body.group]: updatedAsset ? [updatedAsset] : [],
      }, body.locale);
      return Response.json({ ...imported, state: await readState(body.projectId) });
    }

    const stage = body.stage ?? SHORTFILM_SCRIPT_STAGE;
    const confirmed = session.confirmedStages ?? [];
    const prerequisites = stage === SHORTFILM_FINAL_STAGE
      ? [SHORTFILM_SCRIPT_STAGE, SHORTFILM_DESIGN_STAGE, SHORTFILM_STORYBOARD_STAGE, SHORTFILM_REFERENCE_STAGE, SHORTFILM_VIDEO_STAGE]
      : stage === SHORTFILM_VIDEO_STAGE
      ? [SHORTFILM_SCRIPT_STAGE, SHORTFILM_DESIGN_STAGE, SHORTFILM_STORYBOARD_STAGE, SHORTFILM_REFERENCE_STAGE]
      : stage === SHORTFILM_REFERENCE_STAGE
      ? [SHORTFILM_SCRIPT_STAGE, SHORTFILM_DESIGN_STAGE, SHORTFILM_STORYBOARD_STAGE]
      : stage === SHORTFILM_STORYBOARD_STAGE
      ? [SHORTFILM_SCRIPT_STAGE, SHORTFILM_DESIGN_STAGE]
      : stage === SHORTFILM_DESIGN_STAGE ? [SHORTFILM_SCRIPT_STAGE] : [];
    if (!prerequisites.every((id) => confirmed.includes(id))) {
      return Response.json({ error: 'Confirm the preceding stages first.' }, { status: 409 });
    }

    if (stage === SHORTFILM_STORYBOARD_STAGE ||
        (body.action === 'continue' && stage === SHORTFILM_DESIGN_STAGE)) {
      const design = await getShortfilmDesign(session.sessionId);
      const assets = [...(design.characters ?? []), ...(design.settings ?? [])];
      if (!designIsReady(workflowStatus.status) || !assets.length || assets.some((asset) => !asset.selected)) {
        return Response.json({ error: 'Generate and select all product, model and setting images first.' }, { status: 409 });
      }
    }

    if ((stage === SHORTFILM_REFERENCE_STAGE || stage === SHORTFILM_VIDEO_STAGE || stage === SHORTFILM_FINAL_STAGE) && (session.storyboardStale ||
        !storyboardIsReady(workflowStatus.status) || !hasStoryboardContent(await getShortfilmStoryboard(session.sessionId)))) {
      return Response.json({ error: 'Confirm a complete, up-to-date storyboard first.' }, { status: 409 });
    }

    if ((stage === SHORTFILM_VIDEO_STAGE || stage === SHORTFILM_FINAL_STAGE) && (session.referenceStale !== false ||
        !referenceIsReady(workflowStatus.status) || !hasReferenceContent(await getShortfilmReferences(session.sessionId), await getShortfilmStoryboard(session.sessionId)))) {
      return Response.json({ error: 'Generate and confirm all current frames first.' }, { status: 409 });
    }

    if (stage === SHORTFILM_FINAL_STAGE && (session.videoStale !== false || !videoIsReady(workflowStatus.status) ||
        !hasVideoContent(await getShortfilmVideos(session.sessionId), await getShortfilmStoryboard(session.sessionId)))) {
      return Response.json({ error: 'Generate and confirm all current videos before assembly.' }, { status: 409 });
    }

    if (body.action === 'continue') {
      const stageStatus = workflowStatus.status?.[stage];
      if (stageStatus !== 'completed' && stageStatus !== 'waiting') {
        return Response.json({ error: 'Complete this stage before confirming it.' }, { status: 409 });
      }
      if (stage === SHORTFILM_STORYBOARD_STAGE &&
          (session.storyboardStale || !hasStoryboardContent(await getShortfilmStoryboard(session.sessionId)))) {
        return Response.json({ error: 'Generate a complete storyboard with the latest designs before confirming it.' }, { status: 409 });
      }
      if (stage === SHORTFILM_REFERENCE_STAGE && (session.referenceStale !== false ||
          !hasReferenceContent(await getShortfilmReferences(session.sessionId), await getShortfilmStoryboard(session.sessionId)))) {
        return Response.json({ error: 'Generate all frames with the latest storyboard before confirming.' }, { status: 409 });
      }
      if (stage === SHORTFILM_VIDEO_STAGE && (session.videoStale !== false ||
          !hasVideoContent(await getShortfilmVideos(session.sessionId), await getShortfilmStoryboard(session.sessionId)))) {
        return Response.json({ error: 'Generate all videos with the latest frames before confirming.' }, { status: 409 });
      }
      if (stage === SHORTFILM_FINAL_STAGE && (session.finalStale !== false ||
          !hasFinalContent(await getShortfilmFinal(session.sessionId), await getShortfilmStoryboard(session.sessionId)))) {
        return Response.json({ error: 'Assemble a complete final video first.' }, { status: 409 });
      }
      // continue operates on current_stage only; sidecar confirmation remains authoritative
      // when an earlier stage was edited after a later one had already run.
      const result = workflowStatus.current_stage === stage
        ? await continueShortfilm(session.sessionId)
        : { status: 'ready', next_stage: SHORTFILM_STAGES[SHORTFILM_STAGES.findIndex((item) => item.id === stage) + 1]?.id };
      if (result.status !== 'ready' && result.status !== 'completed') {
        throw new Error(String(result.message || 'Unable to confirm the current stage.'));
      }
      await writeShortfilmSession({ ...session, confirmedStages: [...new Set([...confirmed, stage])] });
      return Response.json({ sessionId: session.sessionId, result, state: await readState(body.projectId) });
    }

    if (stage === SHORTFILM_FINAL_STAGE) {
      const storyboard = await getShortfilmStoryboard(session.sessionId);
      const previous = await getShortfilmFinal(session.sessionId);
      await writeShortfilmSession({ ...session, finalStale: true,
        confirmedStages: confirmationsBeforeStage(confirmed, stage) });
      await runShortfilmStage(session.sessionId, stage, 900_000);
      const status = await getShortfilmStatus(session.sessionId);
      const final = await getShortfilmFinal(session.sessionId);
      if (!finalIsReady(status.status) || !hasFinalContent(final, storyboard) ||
          final.final_videos?.some((video) => previous.final_videos?.some((old) => old.path === video.path))) {
        throw new Error(status.error || 'Final assembly did not produce all new outputs.');
      }
      const videos = (final.final_videos ?? []).map((video) => ({ id: `episode-${video.episode}`, name: video.name, selected: video.path }));
      const imported = await importDesignCards(body.projectId, { settings: videos }, body.locale, 'final');
      await writeShortfilmSession({ ...session, finalStale: false,
        confirmedStages: confirmationsBeforeStage(confirmed, stage) });
      return Response.json({ ...imported, state: await readState(body.projectId) });
    }

    if (stage === SHORTFILM_VIDEO_STAGE) {
      const storyboard = await getShortfilmStoryboard(session.sessionId);
      const segments = (storyboard.episodes ?? []).flatMap((episode) => episode.segments ?? []);
      const ids = segments.map((segment) => segment.segment_id);
      const previous = await getShortfilmVideos(session.sessionId);
      await writeShortfilmSession({ ...session, videoStale: true, finalStale: true,
        confirmedStages: confirmationsBeforeStage(confirmed, stage) });
      await updateShortfilmVideos(session.sessionId, segments.map((segment) => ({
        id: segment.segment_id, description: videoSegmentDescription(segment),
        duration: (segment.shots ?? []).reduce((sum, shot) => sum + (shot.duration ?? 2), 0),
      })));
      await regenerateShortfilmVideos(session.sessionId, ids);
      const status = await getShortfilmStatus(session.sessionId);
      const video = await getShortfilmVideos(session.sessionId);
      if (!videoIsReady(status.status)) throw new Error(status.error || 'Video generation failed.');
      const clips = ids.map((id) => {
        const clip = video.clips?.find((item) => item.id === id);
        const old = previous.clips?.find((item) => item.id === id);
        const paths = new Set([old?.selected, ...(old?.versions ?? [])]);
        const fresh = (clip?.versions ?? []).filter((path) => !paths.has(path));
        const selected = clip?.selected && fresh.includes(clip.selected) ? clip.selected : fresh.at(-1);
        if (!clip || !selected || clip.status === 'failed') throw new Error('Some videos failed to generate. Previous videos are preserved; retry generation.');
        return { ...clip, selected };
      });
      await updateShortfilmVideos(session.sessionId, clips.map(({ id, selected }) => ({ id, selected })));
      const imported = await importDesignCards(body.projectId, { settings: clips }, body.locale, 'clip');
      await writeShortfilmSession({ ...session, videoStale: false, finalStale: true,
        confirmedStages: confirmationsBeforeStage(confirmed, stage) });
      return Response.json({ ...imported, state: await readState(body.projectId) });
    }

    if (stage === SHORTFILM_REFERENCE_STAGE) {
      const storyboard = await getShortfilmStoryboard(session.sessionId);
      const ids = (storyboard.episodes ?? []).flatMap((episode) => (episode.segments ?? []).map((segment) => segment.segment_id));
      const previous = await getShortfilmReferences(session.sessionId);
      await writeShortfilmSession({ ...session, referenceStale: true, videoStale: true, finalStale: true,
        confirmedStages: confirmationsBeforeStage(confirmed, stage) });
      // Old visual prompts must not survive edits to the storyboard or designs.
      await updateShortfilmReferences(session.sessionId, ids.map((id) => ({ id, visual_prompt: '' })));
      await regenerateShortfilmReferences(session.sessionId, ids);
      const status = await getShortfilmStatus(session.sessionId);
      const reference = await getShortfilmReferences(session.sessionId);
      if (!referenceIsReady(status.status)) throw new Error(status.error || 'Frame generation failed.');
      const scenes = ids.map((id) => {
        const scene = reference.scenes?.find((item) => item.id === id);
        const old = previous.scenes?.find((item) => item.id === id);
        const paths = new Set([old?.selected, ...(old?.versions ?? [])]);
        const fresh = (scene?.versions ?? []).filter((path) => !paths.has(path));
        const selected = scene?.selected && fresh.includes(scene.selected) ? scene.selected : fresh.at(-1);
        if (!scene || !selected || scene.status === 'failed') throw new Error('Some frames failed to generate. Previous images are preserved; retry generation.');
        return { ...scene, selected };
      });
      await updateShortfilmReferences(session.sessionId, scenes.map(({ id, selected }) => ({ id, selected })));
      const imported = await importDesignCards(body.projectId, { settings: scenes }, body.locale, 'reference');
      await writeShortfilmSession({ ...session, referenceStale: false, videoStale: true, finalStale: true,
        confirmedStages: confirmationsBeforeStage(confirmed, stage) });
      return Response.json({ ...imported, state: await readState(body.projectId) });
    }

    if (stage === SHORTFILM_STORYBOARD_STAGE) {
      if (!designIsReady(workflowStatus.status)) {
        return Response.json({ error: 'Complete the design stage first.' }, { status: 409 });
      }
      await writeShortfilmSession({
        ...session,
        confirmedStages: confirmationsBeforeStage(confirmed, stage),
        storyboardStale: true,
        referenceStale: true, videoStale: true, finalStale: true,
      });
      // The ecommerce scenario agent ignores cached episodes only for an explicit rerun.
      await runShortfilmStage(session.sessionId, stage, 300_000, { regenerate: true });
      const status = await getShortfilmStatus(session.sessionId);
      const storyboard = await getShortfilmStoryboard(session.sessionId);
      if (!storyboardIsReady(status.status) || !hasStoryboardContent(storyboard)) {
        throw new Error(status.error || 'Storyboard generation did not produce a complete storyboard.');
      }
      const imported = await importTextCard(body.projectId, {
        id: SHORTFILM_STORYBOARD_CARD_ID,
        name: storyboardCardName(body.locale),
        text: buildStoryboardCardText(storyboard, body.locale),
        x: 1080,
      });
      await writeShortfilmSession({
        ...session,
        confirmedStages: confirmationsBeforeStage(confirmed, stage),
        storyboardStale: false,
        referenceStale: true, videoStale: true, finalStale: true,
      });
      return Response.json({ sessionId: session.sessionId, stage, storyboard, ...imported, state: await readState(body.projectId) });
    }

    // Upstream reruns invalidate storyboard confirmation even when generation fails.
    await writeShortfilmSession({
      ...session,
      confirmedStages: confirmationsBeforeStage(confirmed, stage),
      storyboardStale: true,
        referenceStale: true, videoStale: true, finalStale: true,
    });

    if (stage === SHORTFILM_DESIGN_STAGE) {
      await runShortfilmStage(session.sessionId, SHORTFILM_DESIGN_STAGE);
      const status = await getShortfilmStatus(session.sessionId);
      const designStatus = status.status?.[SHORTFILM_DESIGN_STAGE];
      if (designStatus === 'error') {
        throw new Error(status.error || 'Design generation failed.');
      }
      if (designStatus !== 'completed' && designStatus !== 'waiting') {
        throw new Error(
          `Design generation did not finish (status: ${designStatus ?? 'unknown'}).`
        );
      }

      const design = await getShortfilmDesign(session.sessionId);
      const imported = await importDesignCards(
        body.projectId,
        design,
        body.locale
      );
      await writeShortfilmSession({
        ...session,
        confirmedStages: confirmationsBeforeStage(confirmed, stage),
        storyboardStale: true,
        referenceStale: true, videoStale: true, finalStale: true,
      });
      const state = await readState(body.projectId);
      return Response.json({
        sessionId: session.sessionId,
        stage: SHORTFILM_DESIGN_STAGE,
        status: status.status ?? {},
        design,
        ...imported,
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
    const imported = await importTextCard(body.projectId, {
      id: SHORTFILM_SCRIPT_CARD_ID,
      name: scriptCardName(body.locale),
      text: buildScriptCardText(script),
      x: 520,
    });
    // A regenerated script needs a fresh confirmation before continuing.
    await writeShortfilmSession({
      ...session,
      confirmedStages: confirmationsBeforeStage(confirmed, stage),
      storyboardStale: true,
        referenceStale: true, videoStale: true, finalStale: true,
    });
    const state = await readState(body.projectId);
    return Response.json({
      sessionId: session.sessionId,
      stage: SHORTFILM_SCRIPT_STAGE,
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
