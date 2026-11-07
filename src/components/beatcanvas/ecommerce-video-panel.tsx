'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw, Video } from 'lucide-react';

import type { CanvasCard } from '@/core/beatcanvas/canvas-types';
import type { ProjectSnapshotDocument } from '@/core/projects/project-snapshot';
import {
  designIsReady,
  scriptIsReady,
  SHORTFILM_DESIGN_STAGE,
  SHORTFILM_SCRIPT_STAGE,
  SHORTFILM_STAGES,
  stageStatusKey,
  type ShortfilmDesignArtifact,
  type ShortfilmScriptArtifact,
  type ShortfilmStageProgress,
} from '@/core/video/shortfilm-contract';
import { normalizeLocale } from '@/config/locale';
import { useLocale, useTranslations } from '@/core/workspace-lib/shims/next-intl';
import { apiJsonGet, apiJsonPost } from '@/lib/api-client';

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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
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
  useEffect(() => {
    if (!state?.sessionId) return;
    const running =
      scriptStatus === 'running' || designStatus === 'running';
    if (!busy && !running) return;
    const timer = window.setInterval(() => {
      void refresh().catch(() => undefined);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [busy, designStatus, refresh, scriptStatus, state?.sessionId]);

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
      setNotice(t('videoContinuePending'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('videoError'));
    } finally {
      setBusy(false);
    }
  };

  const script = state?.script ?? null;
  const design = state?.design ?? null;
  const ready = scriptIsReady(state?.status);
  const designReady = designIsReady(state?.status);
  const confirmedStages = state?.confirmedStages ?? [];
  // Only offer confirm/continue while the script has not been confirmed yet.
  const canContinue =
    ready && !confirmedStages.includes(SHORTFILM_SCRIPT_STAGE);
  const canContinueDesign =
    designReady && !confirmedStages.includes(SHORTFILM_DESIGN_STAGE);
  const scriptConfirmed = confirmedStages.includes(SHORTFILM_SCRIPT_STAGE);
  const hasSession = Boolean(state?.sessionId);
  const offline = state ? !state.connected : false;
  const stages: VideoStageView[] = state?.stages?.length
    ? state.stages
    : SHORTFILM_STAGES.map((stage) => ({ ...stage, status: 'pending' }));
  const scriptStage = stages.find((stage) => stage.id === SHORTFILM_SCRIPT_STAGE);
  const designStage = stages.find((stage) => stage.id === SHORTFILM_DESIGN_STAGE);
  const scriptRunning = scriptStage?.status === 'running';
  const designRunning = designStage?.status === 'running';
  const activeStage = designRunning ? designStage : scriptRunning ? scriptStage : null;
  const runningPercent =
    typeof activeStage?.progress === 'number' ? activeStage.progress : null;
  const runningMessage = activeStage?.message ?? null;
  const fallbackText =
    script && !script.episodes?.length
      ? script.original_text || script.meta?.original_text || ''
      : '';
  const designAssets = [
    ...(design?.characters ?? []),
    ...(design?.settings ?? []),
  ];
  const designHasImages = designAssets.some((asset) => asset.selected);

  return (
    <div className="pointer-events-auto absolute left-4 top-4 z-40 w-[460px] max-w-[calc(100%_-_32px)] text-[var(--beat-text-1)]">
      <section
        aria-label={t('videoTitle')}
        className="max-h-[72vh] space-y-3 overflow-auto rounded-xl border border-white/15 bg-[var(--beat-surface)] p-4 shadow-xl"
      >
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <Video className="size-4 text-[var(--beat-accent)]" aria-hidden="true" />
              {t('videoTitle')}
            </h2>
            <p className="mt-1 text-[11px] leading-5 text-[var(--beat-text-3)]">
              {t('videoIntro')}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              disabled={busy}
              aria-label={t('videoRefresh')}
              title={t('videoRefresh')}
              className="flex min-h-8 w-8 items-center justify-center rounded-lg border border-white/15 text-white/60 hover:bg-white/5 disabled:opacity-40"
              onClick={() => void refresh().catch(() => undefined)}
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
            </button>
            <span
              className={`shrink-0 rounded-full border px-2 py-1 text-[10px] ${
                state?.connected
                  ? 'border-green-400/30 text-green-300'
                  : 'border-white/15 text-white/45'
              }`}
            >
              {state?.connected ? t('videoServiceOnline') : t('videoServiceUnknown')}
            </span>
          </div>
        </header>

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
              className="min-h-11 w-full rounded-lg bg-[var(--beat-accent)] px-3 text-sm font-medium text-black disabled:opacity-40"
              onClick={() => void startAndRun()}
            >
              {busy ? t('videoStatusRunning') : t('videoCreateAndGenerate')}
            </button>
          </div>
        ) : null}

        {hasSession ? (
          <div className="space-y-3">
            <p className="truncate text-[10px] text-white/40">
              {t('videoSessionLabel')} · {state?.sessionId}
            </p>

            <ol className="space-y-1">
              {(stages ?? []).map((stage, index) => {
                const status = stage.status ?? 'pending';
                return (
                  <li
                    key={stage.id}
                    className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
                  >
                    <div className="flex items-center gap-2 text-xs">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-white/20 text-[10px] text-white/60">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{t(stage.labelKey)}</span>
                      <span className={`shrink-0 text-[10px] ${statusTone(status)}`}>
                        {stage.connected
                          ? t(stageStatusKey(status))
                          : t('videoStageNotConnected')}
                      </span>
                    </div>
                    {stage.status === 'running' &&
                    typeof stage.progress === 'number' ? (
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-[var(--beat-accent)] transition-[width]"
                          style={{ width: `${Math.max(0, Math.min(100, stage.progress))}%` }}
                        />
                      </div>
                    ) : null}
                    {stage.status === 'running' && stage.message ? (
                      <p className="mt-1 truncate text-[10px] text-white/45">
                        {stage.message}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ol>

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
                    disabled={busy || offline}
                    className="min-h-10 flex-1 rounded-lg bg-[var(--beat-accent)] px-3 text-xs font-medium text-black disabled:opacity-40"
                    onClick={() => void runScript()}
                  >
                    {busy ? t('videoStatusRunning') : t('videoRerunScript')}
                  </button>
                  {canContinue ? (
                    <button
                      type="button"
                      disabled={busy || offline}
                      className="min-h-10 flex-1 rounded-lg border border-white/20 px-3 text-xs hover:bg-white/5 disabled:opacity-40"
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
                  disabled={busy || offline}
                  className="min-h-10 w-full rounded-lg bg-[var(--beat-accent)] px-3 text-xs font-medium text-black disabled:opacity-40"
                  onClick={() => void runScript()}
                >
                  {busy ? t('videoStatusRunning') : t('videoRunScript')}
                </button>
              </div>
            )}

            {scriptConfirmed ? (
              <section className="space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between text-xs">
                  <h3 className="font-medium">{t('videoStageDesign')}</h3>
                  <span className={statusTone(designStage?.status ?? 'pending')}>
                    {designReady ? t('videoStatusCompleted') : t('videoStatusPending')}
                  </span>
                </div>

                {designHasImages ? (
                  <div className="grid grid-cols-3 gap-1.5">
                    {designAssets.map((asset) =>
                      asset.selected ? (
                        <img
                          key={asset.id}
                          src={asset.selected}
                          alt={asset.name}
                          className="aspect-square w-full rounded bg-white/5 object-contain"
                        />
                      ) : null
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] leading-5 text-white/45">
                    {t('videoDesignEmpty')}
                  </p>
                )}

                {canContinueDesign ? (
                  <button
                    type="button"
                    disabled={busy || offline}
                    className="min-h-10 w-full rounded-lg border border-white/20 text-xs hover:bg-white/5 disabled:opacity-40"
                    onClick={() => void continueWorkflow(SHORTFILM_DESIGN_STAGE)}
                  >
                    {t('videoConfirmDesign')}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy || offline}
                    className="min-h-10 w-full rounded-lg bg-[var(--beat-accent)] text-xs font-medium text-black disabled:opacity-40"
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

            {busy ? (
              <div
                role="status"
                aria-live="polite"
                className="rounded-lg border border-white/10 bg-white/[0.03] p-3"
              >
                <div className="flex items-center gap-2 text-xs text-white/85">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  {designRunning
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
                  {t('videoWaitHint')}
                </p>
              </div>
            ) : null}

          </div>
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
