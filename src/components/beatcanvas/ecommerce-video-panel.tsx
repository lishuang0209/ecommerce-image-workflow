'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Circle, Pencil, AlertCircle, Loader2, RefreshCw, Video } from 'lucide-react';

import type { CanvasCard } from '@/core/beatcanvas/canvas-types';
import type { ProjectSnapshotDocument } from '@/core/projects/project-snapshot';
import {
  SHORTFILM_FINAL_STAGE,
  finalIsReady,
  hasFinalContent,
  type ShortfilmFinalArtifact,
  SHORTFILM_VIDEO_STAGE,
  videoIsReady,
  hasVideoContent,
  type ShortfilmVideoArtifact,
  SHORTFILM_REFERENCE_STAGE,
  referenceIsReady,
  hasReferenceContent,
  type ShortfilmReferenceArtifact,
  designIsReady,
  hasStoryboardContent,
  storyboardIsReady,
  SHORTFILM_STORYBOARD_STAGE,
  type ShortfilmStoryboardArtifact,
  scriptIsReady,
  SHORTFILM_DESIGN_STAGE,
  SHORTFILM_SCRIPT_STAGE,
  SHORTFILM_STAGES,
  stageStatusKey,
  type ShortfilmDesignArtifact,
  type ShortfilmDesignAsset,
  type ShortfilmScriptArtifact,
  type ShortfilmStageProgress,
} from '@/core/video/shortfilm-contract';
import { normalizeLocale } from '@/config/locale';
import { useLocale, useTranslations } from '@/core/workspace-lib/shims/next-intl';
import { apiJsonGet, apiJsonPost } from '@/lib/api-client';
import { VIDEO_BUTTON_CLASS } from './ecommerce-video-button-styles';
import { EcommerceStoryboardEditor } from './ecommerce-storyboard-editor';
import type { StoryboardEdits } from '@/core/video/shortfilm-storyboard-edit';

type VideoStageView = {
  id: string;
  labelKey: string;
  connected: boolean;
  status: string;
  progress?: number;
  message?: string | null;
};

type VideoState = {
  connected: boolean;
  sessionId: string | null;
  missing?: boolean;
  stages: VideoStageView[];
  script: ShortfilmScriptArtifact | null;
  design: ShortfilmDesignArtifact | null;
  storyboard?: ShortfilmStoryboardArtifact | null;
  storyboardStale?: boolean;
  reference?: ShortfilmReferenceArtifact | null;
  referenceStale?: boolean;
  video?: ShortfilmVideoArtifact | null;
  videoStale?: boolean;
  final?: ShortfilmFinalArtifact | null;
  finalStale?: boolean;
  storyboardRevision?: string | null;
  status: Record<string, string>;
  stageProgress: Record<string, ShortfilmStageProgress>;
  currentStage: string | null;
  confirmedStages?: string[];
  error: string | null;
};

type RunResult = {
  document?: ProjectSnapshotDocument;
  version?: number;
  stage?: string;
  script?: ShortfilmScriptArtifact;
  design?: ShortfilmDesignArtifact;
};

const POLL_INTERVAL_MS = 2_000;

const statusTone = (status: string) => {
  if (status === 'completed') return 'text-green-300';
  if (status === 'waiting') return 'text-amber-300';
  if (status === 'error') return 'text-red-300';
  if (status === 'running') return 'text-white/75';
  if (status === 'stopped') return 'text-white/45';
  return 'text-white/45';
};

export function EcommerceVideoPanel({
  projectId,
  cards,
  flush,
  onSavedSnapshot,
  onUpdateFacts,
}: {
  projectId: string;
  cards: Record<string, CanvasCard>;
  flush: () => Promise<void>;
  onSavedSnapshot: (document: ProjectSnapshotDocument, version: number) => void;
  onUpdateFacts?: (text: string) => void;
}) {
  const t = useTranslations('AppShell.studio.ecommerce');
  const locale = normalizeLocale(useLocale());
  const factsCard = cards['video-product-facts'];
  const savedIdea =
    factsCard?.kind === 'text' ? factsCard.textContent.trim() : '';

  const [state, setState] = useState<VideoState | null>(null);
  const [idea, setIdea] = useState('');
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [savingStoryboard, setSavingStoryboard] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [storyboardEdit, setStoryboardEdit] = useState<{ artifact: ShortfilmStoryboardArtifact; revision: string; segmentId?: string } | null>(null);
  const [editingAsset, setEditingAsset] = useState<{
    group: 'characters' | 'settings'; asset: ShortfilmDesignAsset;
  } | null>(null);
  const [assetName, setAssetName] = useState('');
  const [assetDescription, setAssetDescription] = useState('');
  const ideaTouched = useRef(false);

  useEffect(() => {
    if (!ideaTouched.current && savedIdea) setIdea(savedIdea);
  }, [savedIdea]);

  const refresh = useCallback(async () => {
    const data = await apiJsonGet<VideoState>(
      `/api/demo/ecommerce-video?projectId=${encodeURIComponent(projectId)}`
    );
    setState(data);
    return data;
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    refresh()
      .then(async (data) => {
        if (cancelled || !data.sessionId) return;
        await flush();
        if (cancelled) return;
        const linked = await apiJsonPost<RunResult>('/api/demo/ecommerce-video', { projectId, action: 'sync_canvas', locale });
        if (!cancelled && linked.document && typeof linked.version === 'number') onSavedSnapshot(linked.document, linked.version);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(
            cause instanceof Error ? cause.message : t('videoError')
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // t is a per-render closure; the initial load only needs the project id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  const scriptStatus = state?.status?.[SHORTFILM_SCRIPT_STAGE];
  const designStatus = state?.status?.[SHORTFILM_DESIGN_STAGE];
  const finalStatus = state?.status?.[SHORTFILM_FINAL_STAGE];
  const videoStatus = state?.status?.[SHORTFILM_VIDEO_STAGE];
  const referenceStatus = state?.status?.[SHORTFILM_REFERENCE_STAGE];
  const storyboardStatus = state?.status?.[SHORTFILM_STORYBOARD_STAGE];
  useEffect(() => {
    if (!state?.sessionId) return;
    const running =
      scriptStatus === 'running' || designStatus === 'running' || storyboardStatus === 'running' || referenceStatus === 'running' || videoStatus === 'running' || finalStatus === 'running';
    if (!busy && !running) return;
    const timer = window.setInterval(() => {
      void refresh().catch(() => undefined);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [busy, finalStatus, videoStatus, referenceStatus, designStatus, storyboardStatus, refresh, scriptStatus, state?.sessionId]);

  const startAndRun = async () => {
    const text = idea.trim();
    if (!text) {
      setError(t('videoIdeaRequired'));
      return;
    }
    if (busy) return;

    setBusy(true);
    setError('');
    setNotice('');
    try {
      await flush();
      onUpdateFacts?.(text);
      if (!state?.sessionId) {
        await apiJsonPost('/api/demo/ecommerce-video', {
          projectId,
          action: 'start',
          idea: text,
          locale,
        });
        // Refresh now so the session id is known and the polling loop starts
        // while the (long) script run is in flight.
        await refresh();
      }
      const result = await apiJsonPost<RunResult>('/api/demo/ecommerce-video', {
        projectId,
        action: 'run',
        locale,
      });
      if (result.document && typeof result.version === 'number') {
        onSavedSnapshot(result.document, result.version);
      }
      await refresh();
      setNotice(t('videoScriptReady'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('videoError'));
    } finally {
      setBusy(false);
    }
  };

  const runScript = async () => {
    if (busy) return;
    if (state?.script && !window.confirm(t('videoRerunConfirm'))) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await flush();
      const result = await apiJsonPost<RunResult>('/api/demo/ecommerce-video', {
        projectId,
        action: 'run',
        locale,
      });
      if (result.document && typeof result.version === 'number') {
        onSavedSnapshot(result.document, result.version);
      }
      await refresh();
      setNotice(t('videoScriptReady'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('videoError'));
    } finally {
      setBusy(false);
    }
  };

  const runDesign = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await flush();
      const result = await apiJsonPost<RunResult>('/api/demo/ecommerce-video', {
        projectId,
        action: 'run',
        stage: SHORTFILM_DESIGN_STAGE,
        locale,
      });
      if (result.document && typeof result.version === 'number') {
        onSavedSnapshot(result.document, result.version);
      }
      await refresh();
      setNotice(t('videoDesignReady'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('videoError'));
    } finally {
      setBusy(false);
    }
  };

  const changeDesignAsset = async (
    group: 'characters' | 'settings',
    asset: ShortfilmDesignAsset,
    operation: 'save' | 'regenerate'
  ) => {
    if (busy || workflowRunning) return;
    if (operation === 'regenerate' && !window.confirm(t('videoDesignAssetConfirm'))) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await flush();
      const result = await apiJsonPost<RunResult>('/api/demo/ecommerce-video', {
        projectId, action: 'design_asset', operation, group,
        assetId: asset.id, name: asset.name, description: asset.description, locale,
      });
      if (result.document && typeof result.version === 'number') {
        onSavedSnapshot(result.document, result.version);
      }
      setEditingAsset(null);
      await refresh();
      setNotice(t(operation === 'save' ? 'videoDesignAssetSaved' : 'videoDesignReady'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('videoError'));
      await refresh().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  const renderDesignAsset = (group: 'characters' | 'settings', asset: ShortfilmDesignAsset) => (
    <figure key={asset.id} className="min-w-0">
      {asset.selected ? (
        <img src={asset.selected} alt={asset.name}
          className="aspect-square w-full rounded bg-white/5 object-contain" />
      ) : null}
      <figcaption className="mt-1 truncate text-center text-[10px] text-white/55" title={asset.name}>
        {asset.name}{(asset.versions?.length ?? 0) > 1 ? ` ×${asset.versions?.length}` : ''}
      </figcaption>
      <div className="mt-1 flex flex-wrap justify-center gap-1">
        <button type="button" disabled={busy || offline || workflowRunning}
          aria-label={t('videoDesignAssetEditLabel', { name: asset.name })}
          className={`${VIDEO_BUTTON_CLASS} min-h-8 rounded px-2 text-[10px]`}
          onClick={() => {
            setEditingAsset({ group, asset });
            setAssetName(asset.name);
            setAssetDescription(asset.description ?? '');
          }}>{t('videoDesignAssetEdit')}</button>
        <button type="button" disabled={busy || offline || workflowRunning || !asset.description?.trim()}
          aria-label={t('videoDesignAssetRegenerateLabel', { name: asset.name })}
          className={`${VIDEO_BUTTON_CLASS} min-h-8 rounded px-2 text-[10px]`}
          onClick={() => void changeDesignAsset(group, asset, 'regenerate')}>
          {t('videoDesignAssetRegenerate')}
        </button>
      </div>
    </figure>
  );

  const runStoryboard = async () => {
    if (busy || workflowRunning || !designConfirmed) return;
    if (state?.storyboard?.episodes?.length && !window.confirm(t('videoRerunStoryboardConfirm'))) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await flush();
      const result = await apiJsonPost<RunResult>('/api/demo/ecommerce-video', {
        projectId, action: 'run', stage: SHORTFILM_STORYBOARD_STAGE, locale,
      });
      if (result.document && typeof result.version === 'number') {
        onSavedSnapshot(result.document, result.version);
      }
      await refresh();
      setNotice(t('videoStoryboardReady'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('videoError'));
      await refresh().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  const runReferences = async () => {
    if (busy || workflowRunning || !storyboardConfirmed || storyboardStale) return;
    if (state?.reference?.scenes?.some((scene) => scene.selected) && !window.confirm(t('videoRerunReferenceConfirm'))) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await flush();
      const result = await apiJsonPost<RunResult>('/api/demo/ecommerce-video', {
        projectId, action: 'run', stage: SHORTFILM_REFERENCE_STAGE, locale,
      });
      if (result.document && typeof result.version === 'number') {
        onSavedSnapshot(result.document, result.version);
      }
      await refresh();
      setNotice(t('videoReferenceReady'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('videoError'));
      await refresh().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  const runVideos = async () => {
    if (busy || workflowRunning || !referenceConfirmed || !referenceReady) return;
    if (state?.video?.clips?.some((scene) => scene.selected) && !window.confirm(t('videoRerunVideoConfirm'))) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await flush();
      const result = await apiJsonPost<RunResult>('/api/demo/ecommerce-video', {
        projectId, action: 'run', stage: SHORTFILM_VIDEO_STAGE, locale,
      });
      if (result.document && typeof result.version === 'number') {
        onSavedSnapshot(result.document, result.version);
      }
      await refresh();
      setNotice(t('videoClipsReady'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('videoError'));
      await refresh().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  const runFinal = async () => {
    if (busy || workflowRunning || !clipsConfirmed || !clipsReady) return;
    if (state?.final?.final_videos?.some((video) => video.path) && !window.confirm(t('videoReassembleConfirm'))) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await flush();
      const result = await apiJsonPost<RunResult>('/api/demo/ecommerce-video', {
        projectId, action: 'run', stage: SHORTFILM_FINAL_STAGE, locale,
      });
      if (result.document && typeof result.version === 'number') {
        onSavedSnapshot(result.document, result.version);
      }
      await refresh();
      setNotice(t('videoFinalReady'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('videoError'));
      await refresh().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  const saveStoryboard = async (edits: StoryboardEdits) => {
    if (!storyboardEdit || busy || workflowRunning) return;
    setBusy(true);
    setSavingStoryboard(true);
    setError('');
    setNotice('');
    try {
      await flush();
      const result = await apiJsonPost<RunResult>('/api/demo/ecommerce-video', {
        projectId, action: 'save_storyboard', locale,
        baseRevision: storyboardEdit.revision, edits,
      });
      if (result.document && typeof result.version === 'number') {
        onSavedSnapshot(result.document, result.version);
      }
      await refresh();
      setStoryboardEdit(null);
      setNotice(t('videoStoryboardSaved'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('videoError'));
      await refresh().catch(() => undefined);
    } finally {
      setBusy(false);
      setSavingStoryboard(false);
    }
  };

  const continueWorkflow = async (stage: string) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await flush();
      await apiJsonPost('/api/demo/ecommerce-video', {
        projectId,
        action: 'continue',
        stage,
        locale,
      });
      await refresh();
      setNotice(t(stage === SHORTFILM_FINAL_STAGE ? 'videoFinalConfirmed' : stage === SHORTFILM_VIDEO_STAGE ? 'videoClipsConfirmed' : stage === SHORTFILM_REFERENCE_STAGE ? 'videoReferenceConfirmed' : stage === SHORTFILM_STORYBOARD_STAGE
        ? 'videoStoryboardConfirmed'
        : stage === SHORTFILM_DESIGN_STAGE ? 'videoDesignConfirmed' : 'videoScriptConfirmed'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('videoError'));
    } finally {
      setBusy(false);
    }
  };

  const script = state?.script ?? null;
  const design = state?.design ?? null;
  const storyboard = state?.storyboard ?? null;
  const storyboardReady = storyboardIsReady(state?.status) && hasStoryboardContent(storyboard);
  const storyboardStale = state?.storyboardStale ?? false;
  const ready = scriptIsReady(state?.status);
  const designReady = designIsReady(state?.status);
  const confirmedStages = state?.confirmedStages ?? [];
  // Only offer confirm/continue while the script has not been confirmed yet.
  const canContinue =
    ready && !confirmedStages.includes(SHORTFILM_SCRIPT_STAGE);
  const canContinueDesign =
    designReady && !confirmedStages.includes(SHORTFILM_DESIGN_STAGE);
  const scriptConfirmed = confirmedStages.includes(SHORTFILM_SCRIPT_STAGE);
  const designConfirmed = scriptConfirmed && confirmedStages.includes(SHORTFILM_DESIGN_STAGE);
  const storyboardConfirmed = confirmedStages.includes(SHORTFILM_STORYBOARD_STAGE);
  const canContinueStoryboard = storyboardReady && !storyboardStale && designConfirmed && !storyboardConfirmed;
  const hasSession = Boolean(state?.sessionId);
  const offline = state ? !state.connected : false;
  const stages: VideoStageView[] = state?.stages?.length
    ? state.stages
    : SHORTFILM_STAGES.map((stage) => ({ ...stage, status: 'pending' }));
  const scriptStage = stages.find((stage) => stage.id === SHORTFILM_SCRIPT_STAGE);
  const designStage = stages.find((stage) => stage.id === SHORTFILM_DESIGN_STAGE);
  const scriptRunning = scriptStage?.status === 'running';
  const designRunning = designStage?.status === 'running';
  const storyboardRunning = storyboardStatus === 'running';
  const referenceRunning = referenceStatus === 'running';
  const referenceReady = referenceIsReady(state?.status) && hasReferenceContent(state?.reference, storyboard) && state?.referenceStale === false;
  const referenceConfirmed = confirmedStages.includes(SHORTFILM_REFERENCE_STAGE);
  const videoRunning = videoStatus === 'running';
  const clipsReady = videoIsReady(state?.status) && hasVideoContent(state?.video, storyboard) && state?.videoStale === false;
  const clipsConfirmed = confirmedStages.includes(SHORTFILM_VIDEO_STAGE);
  const finalRunning = finalStatus === 'running';
  const finalReady = finalIsReady(state?.status) && hasFinalContent(state?.final, storyboard) && state?.finalStale === false;
  const finalConfirmed = confirmedStages.includes(SHORTFILM_FINAL_STAGE);
  const workflowRunning = scriptRunning || designRunning || storyboardRunning || referenceRunning || videoRunning || finalRunning;
  const activeStage = stages.find((stage) => stage.status === 'running') ?? null;
  const runningPercent =
    typeof activeStage?.progress === 'number' ? activeStage.progress : null;
  const runningMessage = activeStage?.message ?? null;
  const fallbackText =
    script && !script.episodes?.length
      ? script.original_text || script.meta?.original_text || ''
      : '';
  const designHasImages = [
    ...(design?.characters ?? []),
    ...(design?.settings ?? []),
  ].some((asset) => asset.selected);

  const visibleStage = selectedStage ?? activeStage?.id ?? stages.find((stage) => !confirmedStages.includes(stage.id))?.id ?? SHORTFILM_FINAL_STAGE;
  const stageAvailable: Record<string, boolean> = {
    [SHORTFILM_SCRIPT_STAGE]: true,
    [SHORTFILM_DESIGN_STAGE]: scriptConfirmed,
    [SHORTFILM_STORYBOARD_STAGE]: designConfirmed || Boolean(storyboard),
    [SHORTFILM_REFERENCE_STAGE]: storyboardConfirmed || Boolean(state?.reference?.scenes?.length),
    [SHORTFILM_VIDEO_STAGE]: referenceConfirmed || Boolean(state?.video?.clips?.length),
    [SHORTFILM_FINAL_STAGE]: clipsConfirmed || Boolean(state?.final?.final_videos?.length),
  };
  const stageReady: Record<string, boolean> = {
    [SHORTFILM_SCRIPT_STAGE]: ready && Boolean(script),
    [SHORTFILM_DESIGN_STAGE]: designReady && designHasImages,
    [SHORTFILM_STORYBOARD_STAGE]: storyboardReady && !storyboardStale,
    [SHORTFILM_REFERENCE_STAGE]: referenceReady,
    [SHORTFILM_VIDEO_STAGE]: clipsReady,
    [SHORTFILM_FINAL_STAGE]: finalReady,
  };
  const shortStageKeys = ['videoNavScript', 'videoNavDesign', 'videoNavStoryboard', 'videoStageReference', 'videoStageVideo', 'videoStagePost'];

  return (
    <div className="pointer-events-auto absolute left-4 top-4 z-40 w-[460px] max-w-[calc(100%_-_32px)] text-[var(--beat-text-1)]">
      <section
        aria-label={t('videoTitle')}
        className="max-h-[72vh] space-y-3 overflow-auto rounded-xl border border-white/15 bg-[var(--beat-surface)] p-4 shadow-xl"
      >
        <header className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <h2 className="flex shrink-0 items-center gap-2 text-sm font-medium">
              <Video className="size-4 text-[var(--beat-accent)]" aria-hidden="true" />
              {t('videoTitle')}
            </h2>
            <span
              role="status"
              className={`inline-flex shrink-0 items-center gap-1.5 text-[10px] ${
                state?.connected ? 'text-green-300' : offline ? 'text-red-300' : 'text-white/45'
              }`}
            >
              <span aria-hidden="true" className={`size-1.5 rounded-full ${state?.connected ? 'bg-green-400' : offline ? 'bg-red-400' : 'bg-white/40'}`} />
              {state?.connected ? t('videoServiceOnline') : offline ? t('videoServiceOfflineLabel') : t('videoServiceUnknown')}
            </span>
          </div>
            <button
              type="button"
              disabled={busy}
              aria-label={t('videoRefresh')}
              title={t('videoRefresh')}
              className={`${VIDEO_BUTTON_CLASS} flex min-h-8 w-8 shrink-0 items-center justify-center rounded-lg`}
              onClick={() => void refresh().catch(() => undefined)}
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
            </button>
        </header>
        <p title={t('videoIntro')} className="truncate text-[11px] leading-5 text-[var(--beat-text-3)]">
          {t('videoIntro')}
        </p>

        {loading ? (
          <p role="status" className="flex items-center gap-2 text-xs text-white/55">
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            {t('videoServiceUnknown')}
          </p>
        ) : null}

        {offline ? (
          <p
            role="alert"
            className="rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-xs leading-5 text-red-200"
          >
            {t('videoServiceOffline')}
          </p>
        ) : null}

        {!hasSession && !loading ? (
          <div className="space-y-2">
            <label className="block text-xs text-white/70">
              {t('videoIdeaLabel')}
              <textarea
                className="mt-1 min-h-28 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-xs leading-5 outline-none focus:border-orange-400/60"
                maxLength={12_000}
                value={idea}
                placeholder={t('videoIdeaPlaceholder')}
                onChange={(event) => {
                  ideaTouched.current = true;
                  setIdea(event.target.value);
                  setError('');
                }}
              />
            </label>
            <button
              type="button"
              disabled={busy || offline || !idea.trim()}
              className={`${VIDEO_BUTTON_CLASS} min-h-11 w-full rounded-lg px-3 text-sm font-medium`}
              onClick={() => void startAndRun()}
            >
              {busy ? t('videoStatusRunning') : t('videoCreateAndGenerate')}
            </button>
          </div>
        ) : null}

        {hasSession ? (
          <div className="space-y-3">
            <nav aria-label={t('videoStageNavigation')} className="sticky top-0 z-20 -mx-1 bg-[var(--beat-surface)] py-2">
              <ol className="flex items-center overflow-x-auto">
                {stages.map((stage, index) => {
                  const selected = visibleStage === stage.id;
                  const running = stage.status === 'running';
                  const completed = confirmedStages.includes(stage.id) && stageReady[stage.id];
                  const review = !completed && stageReady[stage.id];
                  const failed = stage.status === 'error';
                  const statusLabel = t(running ? 'videoStatusRunning' : failed ? 'videoStatusError' : completed ? 'videoStatusCompleted' : review ? 'videoStatusWaiting' : 'videoStatusPending');
                  const Icon = running ? Loader2 : failed ? AlertCircle : completed ? CheckCircle2 : review ? Pencil : Circle;
                  return <li key={stage.id} className="flex min-w-0 flex-1 items-center">
                    <button type="button" aria-current={selected ? 'step' : undefined}
                      aria-label={`${t(stage.labelKey)} · ${statusLabel}`} title={`${t(stage.labelKey)} · ${statusLabel}`}
                      onClick={() => setSelectedStage(stage.id)}
                      className={`flex min-h-10 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-md border px-1 text-xs transition-colors hover:border-orange-400/40 hover:bg-orange-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 motion-reduce:transition-none ${selected ? 'border-white/20 bg-white/10 text-white' : 'border-transparent text-white/55'}`}>
                      <Icon aria-hidden="true" className={`size-3.5 shrink-0 ${running ? 'animate-spin motion-reduce:animate-none' : completed ? 'text-green-300' : review ? 'text-orange-400' : failed ? 'text-red-300' : 'text-white/35'}`} />
                      {t(shortStageKeys[index])}
                    </button>
                    {index < stages.length - 1 ? <span aria-hidden="true" className={`mx-0.5 h-px w-1 shrink-0 ${completed ? 'bg-green-300/50' : 'bg-white/15'}`} /> : null}
                  </li>;
                })}
              </ol>
            </nav>
            {!stageAvailable[visibleStage] ? <p role="status" className="py-4 text-xs leading-5 text-white/55">{t('videoStagePrerequisiteHint')}</p> : null}

            <div hidden={visibleStage !== SHORTFILM_SCRIPT_STAGE}>

            {script ? (
              <section className="rounded-lg border border-white/10">
                <details open>
                <summary className="flex min-h-9 cursor-pointer items-center gap-2 px-3 py-2 text-xs font-medium">
                  <CheckCircle2 className="size-3.5 text-green-300" aria-hidden="true" />
                  {t('videoScriptTitle')}
                </summary>
                <div className="max-h-64 overflow-auto border-t border-white/10 px-3 py-3">
                  {script.title ? (
                    <h3 className="text-xs font-medium text-white/90">{script.title}</h3>
                  ) : null}
                  {script.logline ? (
                    <p className="mt-1 text-[11px] leading-5 text-white/55">
                      {script.logline}
                    </p>
                  ) : null}
                  {(script.episodes ?? []).map((episode, index) => (
                    <section key={index} className="mt-3">
                      {episode.act_title || episode.episode_number ? (
                        <h4 className="text-[11px] font-medium text-white/75">
                          {episode.act_title || episode.episode_number}
                        </h4>
                      ) : null}
                      <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-[11px] leading-5 text-white/65">
                        {episode.content ?? ''}
                      </pre>
                    </section>
                  ))}
                  {fallbackText ? (
                    <pre className="whitespace-pre-wrap break-words font-sans text-[11px] leading-5 text-white/65">
                      {fallbackText}
                    </pre>
                  ) : null}
                </div>
                </details>
                <div className="flex gap-2 border-t border-white/10 p-2">
                  <button
                    type="button"
                    disabled={busy || offline || workflowRunning}
                    className={`${VIDEO_BUTTON_CLASS} min-h-10 flex-1 rounded-lg px-3 text-xs`}
                    onClick={() => void runScript()}
                  >
                    {busy ? t('videoStatusRunning') : t('videoRerunScript')}
                  </button>
                  {canContinue ? (
                    <button
                      type="button"
                      disabled={busy || offline || workflowRunning}
                      className={`${VIDEO_BUTTON_CLASS} min-h-10 flex-1 rounded-lg px-3 text-xs`}
                      onClick={() => void continueWorkflow(SHORTFILM_SCRIPT_STAGE)}
                    >
                      {t('videoConfirmContinue')}
                    </button>
                  ) : null}
                </div>
              </section>
            ) : (
              <div className="space-y-2 rounded-lg border border-dashed border-white/15 p-3">
                <p className="text-[11px] leading-5 text-white/45">
                  {t('videoScriptEmpty')}
                </p>
                <button
                  type="button"
                  disabled={busy || offline || workflowRunning}
                  className={`${VIDEO_BUTTON_CLASS} min-h-10 w-full rounded-lg px-3 text-xs font-medium`}
                  onClick={() => void runScript()}
                >
                  {busy ? t('videoStatusRunning') : t('videoRunScript')}
                </button>
              </div>
            )}

            </div>
            <div hidden={visibleStage !== SHORTFILM_DESIGN_STAGE}>
            {scriptConfirmed ? (
              <section className="space-y-3 border-t border-white/10 py-4">
                <div className="flex items-center justify-between text-xs">
                  <h3 className="font-medium">{t('videoStageDesign')}</h3>
                  <span className={statusTone(designStage?.status ?? 'pending')}>
                    {designReady ? t('videoStatusCompleted') : t('videoStatusPending')}
                  </span>
                </div>

                {designHasImages ? (
                  <div className="space-y-2">
                    {(design?.characters ?? []).length > 0 ? (
                      <div>
                        <p className="mb-1 text-[10px] text-white/45">
                          {t('videoDesignCharacters')} ·{' '}
                          {design?.characters?.length}
                        </p>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(design?.characters ?? []).map((asset) => renderDesignAsset('characters', asset))}
                        </div>
                      </div>
                    ) : null}
                    {(design?.settings ?? []).length > 0 ? (
                      <div>
                        <p className="mb-1 text-[10px] text-white/45">
                          {t('videoDesignSettings')} ·{' '}
                          {design?.settings?.length}
                        </p>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(design?.settings ?? []).map((asset) => renderDesignAsset('settings', asset))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-[11px] leading-5 text-white/45">
                    {t('videoDesignEmpty')}
                  </p>
                )}

                {editingAsset ? (
                  <form className="space-y-2 rounded-lg border border-white/15 p-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void changeDesignAsset(editingAsset.group, {
                        ...editingAsset.asset, name: assetName.trim(), description: assetDescription.trim(),
                      }, 'save');
                    }}>
                    <p className="text-xs font-medium">{t('videoDesignAssetEditLabel', { name: editingAsset.asset.name })}</p>
                    <label className="block text-[11px] text-white/70">
                      {t('videoDesignAssetName')}
                      <input required maxLength={200} value={assetName} disabled={busy}
                        onChange={(event) => setAssetName(event.target.value)}
                        className="mt-1 min-h-9 w-full rounded border border-white/15 bg-black/25 px-2 outline-none focus:border-white/50" />
                    </label>
                    <label className="block text-[11px] text-white/70">
                      {t('videoDesignAssetDescription')}
                      <textarea required maxLength={12000} value={assetDescription} disabled={busy}
                        onChange={(event) => setAssetDescription(event.target.value)}
                        className="mt-1 min-h-28 w-full rounded border border-white/15 bg-black/25 px-2 py-2 leading-5 outline-none focus:border-white/50" />
                    </label>
                    <p className="text-[10px] leading-4 text-white/45">{t('videoDesignAssetHint')}</p>
                    <div className="flex flex-wrap gap-2">
                      <button type="submit" disabled={busy || offline || workflowRunning || !assetName.trim() || !assetDescription.trim()}
                        className={`${VIDEO_BUTTON_CLASS} min-h-9 rounded px-2 text-[11px]`}>{t('videoDesignAssetSave')}</button>
                      <button type="button" disabled={busy || offline || workflowRunning || !assetName.trim() || !assetDescription.trim()}
                        className={`${VIDEO_BUTTON_CLASS} min-h-9 rounded px-2 text-[11px]`}
                        onClick={() => void changeDesignAsset(editingAsset.group, {
                          ...editingAsset.asset, name: assetName.trim(), description: assetDescription.trim(),
                        }, 'regenerate')}>{t('videoDesignAssetSaveRegenerate')}</button>
                      <button type="button" disabled={busy} onClick={() => setEditingAsset(null)}
                        className={`${VIDEO_BUTTON_CLASS} min-h-9 rounded px-2 text-[11px]`}>{t('videoDesignAssetCancel')}</button>
                    </div>
                  </form>
                ) : null}

                {canContinueDesign ? (
                  <button
                    type="button"
                    disabled={busy || offline || workflowRunning}
                    className={`${VIDEO_BUTTON_CLASS} min-h-10 w-full rounded-lg text-xs`}
                    onClick={() => void continueWorkflow(SHORTFILM_DESIGN_STAGE)}
                  >
                    {t('videoConfirmDesign')}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy || offline || workflowRunning}
                    className={`${VIDEO_BUTTON_CLASS} min-h-10 w-full rounded-lg text-xs font-medium`}
                    onClick={() => void runDesign()}
                  >
                    {busy
                      ? t('videoStatusRunning')
                      : designReady
                        ? t('videoRerunDesign')
                        : t('videoGenerateDesign')}
                  </button>
                )}
              </section>
            ) : null}

            </div>
            <div hidden={visibleStage !== SHORTFILM_STORYBOARD_STAGE}>
            {designConfirmed || storyboard ? (
              <section className="space-y-3 border-t border-white/10 py-4">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <h3 className="font-medium">{t('videoStageStoryboard')}</h3>
                  <span className={statusTone(storyboardStatus ?? 'pending')}>
                    {storyboardStale && !storyboardRunning
                      ? t('videoStoryboardNeedsRegeneration')
                      : t(stageStatusKey(storyboardStatus))}
                  </span>
                </div>
                {storyboardStale && storyboard ? (
                  <p className="text-[11px] leading-5 text-white/60">{t('videoStoryboardStale')}</p>
                ) : null}
                {storyboardEdit ? (
                  <EcommerceStoryboardEditor artifact={storyboardEdit.artifact} initialSegmentId={storyboardEdit.segmentId} error={error}
                    disabled={busy || offline || workflowRunning}
                    onSave={(edits) => void saveStoryboard(edits)} onCancel={() => setStoryboardEdit(null)} />
                ) : storyboard?.episodes?.length ? (
                  <div className="space-y-3">
                    {storyboard.episodes.map((episode, ei) => <div key={episode.episode_number ?? ei}>
                      <p className="mb-1 text-xs text-white/75">{episode.episode_title}</p>
                      <p className="mb-2 text-[11px] text-white/45">{t('videoStoryboardSummary', {
                        segments: episode.segments?.length ?? 0,
                        shots: (episode.segments ?? []).reduce((sum, segment) => sum + (segment.shots?.length ?? 0), 0),
                        seconds: (episode.segments ?? []).reduce((sum, segment) => sum + (segment.shots ?? []).reduce((total, shot) => total + (shot.duration ?? 2), 0), 0),
                      })}</p>
                      {(episode.segments ?? []).map((segment, si) => <button key={segment.segment_id} type="button"
                        disabled={busy || offline || workflowRunning || storyboardStale || !designConfirmed || !state?.storyboardRevision || !storyboardIsReady(state?.status)}
                        className="flex min-h-11 w-full items-center gap-3 rounded px-2 text-left text-xs text-white/70 transition-colors enabled:hover:bg-orange-500/10 enabled:hover:text-white focus-visible:outline-orange-400 disabled:opacity-40"
                        onClick={() => setStoryboardEdit({ artifact: structuredClone(storyboard), revision: state!.storyboardRevision!, segmentId: segment.segment_id })}>
                        <span className="text-white/35">{String(si + 1).padStart(2, '0')}</span><span className="min-w-0 flex-1 truncate">{segment.location}</span>
                        <span className="text-white/45">{segment.scene_time} / {segment.scene_space}</span>
                        <span>{t('videoStoryboardSegmentDuration', { seconds: (segment.shots ?? []).reduce((sum, shot) => sum + (shot.duration ?? 2), 0) })}</span>
                      </button>)}
                    </div>)}
                  </div>
                ) : <p className="text-[11px] leading-5 text-white/45">{t('videoStoryboardEmpty')}</p>}
                {!storyboardEdit ? <div className="flex flex-wrap gap-2">
                  {storyboardIsReady(state?.status) && storyboard?.episodes?.length && state?.storyboardRevision ? (
                    <button type="button" disabled={busy || offline || workflowRunning || storyboardStale || !designConfirmed}
                      className={`${VIDEO_BUTTON_CLASS} min-h-10 flex-1 rounded-lg px-3 text-xs`}
                      onClick={() => setStoryboardEdit({ artifact: structuredClone(storyboard!), revision: state.storyboardRevision! })}>
                      {t('videoEditStoryboard')}
                    </button>
                  ) : null}
                  <button type="button"
                    disabled={busy || offline || workflowRunning || !designConfirmed}
                    className={`${VIDEO_BUTTON_CLASS} min-h-10 flex-1 rounded-lg px-3 text-xs`}
                    onClick={() => void runStoryboard()}>
                    {storyboardRunning ? t('videoStatusRunning')
                      : storyboard?.episodes?.length ? t('videoRerunStoryboard') : t('videoGenerateStoryboard')}
                  </button>
                  {canContinueStoryboard ? (
                    <button type="button" disabled={busy || offline || workflowRunning}
                      className={`${VIDEO_BUTTON_CLASS} min-h-10 flex-1 rounded-lg px-3 text-xs`}
                      onClick={() => void continueWorkflow(SHORTFILM_STORYBOARD_STAGE)}>
                      {t('videoConfirmStoryboard')}
                    </button>
                  ) : null}
                </div> : null}
                {storyboardConfirmed && !storyboardEdit ? (
                  <p className="text-[11px] leading-5 text-white/55">{t('videoStoryboardConfirmed')}</p>
                ) : null}
              </section>
            ) : null}

            </div>
            <div hidden={visibleStage !== SHORTFILM_REFERENCE_STAGE}>
            {storyboardConfirmed || state?.reference?.scenes?.length ? (
              <section className="space-y-3 border-t border-white/10 py-4">
                <div className="flex items-center justify-between text-xs"><h3 className="font-medium">{t('videoStageReference')}</h3>
                  <span className={statusTone(referenceStatus ?? 'pending')}>{state?.referenceStale && !referenceRunning && state.reference?.scenes?.some((scene) => scene.selected) ? t('videoStoryboardNeedsRegeneration') : t(stageStatusKey(referenceStatus))}</span>
                </div>
                {state?.referenceStale && state.reference?.scenes?.some((scene) => scene.selected) ? <p className="text-xs text-white/55">{t('videoReferenceStale')}</p> : null}
                <div className="grid grid-cols-2 gap-3">
                  {(state?.reference?.scenes ?? []).map((scene, index) => <figure key={scene.id} className="min-w-0">
                    {scene.selected ? <img src={scene.selected} alt={scene.name} className="aspect-video w-full rounded object-contain bg-white/5" />
                      : <div className="flex aspect-video items-center justify-center rounded bg-white/5 text-xs text-white/40">{t('videoStatusPending')}</div>}
                    <figcaption className="mt-1 text-xs text-white/60">{t('videoStoryboardSegmentLabel', { number: index + 1 })}</figcaption>
                  </figure>)}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busy || offline || workflowRunning || !storyboardConfirmed || storyboardStale || Boolean(storyboardEdit)}
                    className={`${VIDEO_BUTTON_CLASS} min-h-10 flex-1 rounded px-3 text-xs`} onClick={() => void runReferences()}>
                    {referenceRunning ? t('videoStatusRunning') : state?.reference?.scenes?.some((scene) => scene.selected) ? t('videoRerunReference') : t('videoGenerateReference')}
                  </button>
                  {referenceReady && !referenceConfirmed ? <button type="button" disabled={busy || offline || workflowRunning || !storyboardConfirmed || Boolean(storyboardEdit)}
                    className={`${VIDEO_BUTTON_CLASS} min-h-10 flex-1 rounded px-3 text-xs`} onClick={() => void continueWorkflow(SHORTFILM_REFERENCE_STAGE)}>{t('videoConfirmReference')}</button> : null}
                </div>
                {referenceConfirmed ? <p className="text-xs text-white/55">{t('videoReferenceConfirmed')}</p> : null}
              </section>
            ) : null}

            </div>
            <div hidden={visibleStage !== SHORTFILM_VIDEO_STAGE}>
            {referenceConfirmed || state?.video?.clips?.length ? (
              <section className="space-y-3 border-t border-white/10 py-4">
                <div className="flex items-center justify-between text-xs"><h3 className="font-medium">{t('videoStageVideo')}</h3>
                  <span className={statusTone(videoStatus ?? 'pending')}>{state?.videoStale && !videoRunning && state.video?.clips?.some((scene) => scene.selected) ? t('videoStoryboardNeedsRegeneration') : t(stageStatusKey(videoStatus))}</span>
                </div>
                {state?.videoStale && state.video?.clips?.some((scene) => scene.selected) ? <p className="text-xs text-white/55">{t('videoClipsStale')}</p> : null}
                <div className="grid grid-cols-2 gap-3">
                  {(state?.video?.clips ?? []).map((scene, index) => <figure key={scene.id} className="min-w-0">
                    {scene.selected ? <video src={scene.selected} aria-label={scene.name} controls playsInline preload="metadata" className="aspect-video w-full rounded bg-black object-contain" />
                      : <div className="flex aspect-video items-center justify-center rounded bg-white/5 text-xs text-white/40">{t('videoStatusPending')}</div>}
                    <figcaption className="mt-1 text-xs text-white/60">{t('videoStoryboardSegmentLabel', { number: index + 1 })}</figcaption>
                  </figure>)}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busy || offline || workflowRunning || !referenceConfirmed || !referenceReady || Boolean(storyboardEdit)}
                    className={`${VIDEO_BUTTON_CLASS} min-h-10 flex-1 rounded px-3 text-xs`} onClick={() => void runVideos()}>
                    {videoRunning ? t('videoStatusRunning') : state?.video?.clips?.some((scene) => scene.selected) ? t('videoRerunVideo') : t('videoGenerateClips')}
                  </button>
                  {clipsReady && !clipsConfirmed ? <button type="button" disabled={busy || offline || workflowRunning || !referenceConfirmed || Boolean(storyboardEdit)}
                    className={`${VIDEO_BUTTON_CLASS} min-h-10 flex-1 rounded px-3 text-xs`} onClick={() => void continueWorkflow(SHORTFILM_VIDEO_STAGE)}>{t('videoConfirmClips')}</button> : null}
                </div>
                {clipsConfirmed ? <p className="text-xs text-white/55">{t('videoClipsConfirmed')}</p> : null}
              </section>
            ) : null}

            </div>
            <div hidden={visibleStage !== SHORTFILM_FINAL_STAGE}>
            {clipsConfirmed || state?.final?.final_videos?.length ? (
              <section className="space-y-3 border-t border-white/10 py-4">
                <div className="flex items-center justify-between text-xs"><h3 className="font-medium">{t('videoStagePost')}</h3>
                  <span>{t(stageStatusKey(finalStatus))}</span></div>
                {state?.finalStale && state.final?.final_videos?.length ? <p className="text-xs text-white/55">{t('videoFinalStale')}</p> : null}
                {(state?.final?.final_videos ?? []).map((video) => video.path ? <figure key={video.episode} className="space-y-2">
                  <video src={video.path} aria-label={video.name} controls playsInline preload="metadata" className="max-h-72 w-full rounded bg-black" />
                  <figcaption className="flex items-center justify-between gap-2 text-xs text-white/70"><span>{video.name}</span>
                    <a href={video.path} download className={`${VIDEO_BUTTON_CLASS} rounded px-3 py-2`}>{t('videoDownloadFinal')}</a></figcaption>
                </figure> : null)}
                <div className="flex gap-2">
                  <button type="button" disabled={busy || offline || workflowRunning || !clipsConfirmed || !clipsReady || Boolean(storyboardEdit)}
                    className={`${VIDEO_BUTTON_CLASS} min-h-10 flex-1 rounded px-3 text-xs`} onClick={() => void runFinal()}>
                    {finalRunning ? t('videoStatusRunning') : state?.final?.final_videos?.some((video) => video.path) ? t('videoReassemble') : t('videoAssemble')}
                  </button>
                  {finalReady && !finalConfirmed ? <button type="button" disabled={busy || offline || workflowRunning || !clipsConfirmed || Boolean(storyboardEdit)}
                    className={`${VIDEO_BUTTON_CLASS} min-h-10 flex-1 rounded px-3 text-xs`} onClick={() => void continueWorkflow(SHORTFILM_FINAL_STAGE)}>{t('videoConfirmFinal')}</button> : null}
                </div>
                {finalConfirmed ? <p className="text-xs text-green-300">{t('videoFinalConfirmed')}</p> : null}
              </section>
            ) : null}

            </div>
            {busy || workflowRunning ? (
              <div
                role="status"
                aria-live="polite"
                className="rounded-lg border border-white/10 bg-white/[0.03] p-3"
              >
                <div className="flex items-center gap-2 text-xs text-white/85">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  {savingStoryboard
                    ? t('videoSavingStoryboard')
                    : finalRunning
                    ? t('videoAssemblingLabel')
                    : videoRunning
                    ? t('videoGeneratingClipsLabel')
                    : referenceRunning
                    ? t('videoGeneratingReferenceLabel')
                    : storyboardRunning
                    ? t('videoGeneratingStoryboardLabel')
                    : designRunning
                    ? t('videoGeneratingDesignLabel')
                    : scriptRunning
                      ? t('videoGeneratingLabel')
                      : t('videoStartingLabel')}
                  {runningPercent != null ? (
                    <span className="tabular-nums text-white/50">{runningPercent}%</span>
                  ) : null}
                </div>
                {runningPercent != null ? (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-[var(--beat-accent)] transition-[width] duration-500"
                      style={{ width: `${Math.max(0, Math.min(100, runningPercent))}%` }}
                    />
                  </div>
                ) : null}
                {runningMessage ? (
                  <p className="mt-1.5 truncate text-[11px] text-white/55">
                    {runningMessage}
                  </p>
                ) : null}
                <p className="mt-1 text-[10px] leading-4 text-white/40">
                  {savingStoryboard ? t('videoSavingStoryboard') : t('videoWaitHint')}
                </p>
              </div>
            ) : null}

          </div>
        ) : null}

        {hasSession ? (
          <details className="border-t border-white/10 pt-2 text-[11px] text-white/45">
            <summary className="w-fit cursor-pointer rounded py-1 transition-colors hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400">{t('videoTaskDetails')}</summary>
            <p className="mt-1 break-all select-text leading-5">{t('videoSessionLabel')} · {state?.sessionId}</p>
          </details>
        ) : null}

        {notice ? (
          <p role="status" className="text-[11px] leading-5 text-green-300">
            {notice}
          </p>
        ) : null}
        {error || state?.error ? (
          <p role="alert" className="text-[11px] leading-5 text-red-300">
            {error || state?.error}
          </p>
        ) : null}
      </section>
    </div>
  );
}
