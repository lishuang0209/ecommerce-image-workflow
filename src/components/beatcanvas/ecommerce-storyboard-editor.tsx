'use client';

import { useState } from 'react';
import type { ShortfilmStoryboardArtifact } from '@/core/video/shortfilm-contract';
import type { StoryboardEdits } from '@/core/video/shortfilm-storyboard-edit';
import { useTranslations } from '@/core/workspace-lib/shims/next-intl';
import { VIDEO_BUTTON_CLASS } from './ecommerce-video-button-styles';

type Episode = NonNullable<ShortfilmStoryboardArtifact['episodes']>[number];
type Segment = NonNullable<Episode['segments']>[number];
type Shot = NonNullable<Segment['shots']>[number];

const inputClass = 'mt-1 min-h-10 w-full rounded border border-white/15 bg-black/25 px-3 py-2 text-sm outline-none focus:border-white/50 disabled:opacity-40';

export function EcommerceStoryboardEditor({ artifact, disabled, onSave, onCancel, initialSegmentId, error }: {
  artifact: ShortfilmStoryboardArtifact;
  initialSegmentId?: string;
  error?: string;
  disabled: boolean;
  onSave: (edits: StoryboardEdits) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('AppShell.studio.ecommerce');
  const [draft, setDraft] = useState(() => {
    const copy = structuredClone(artifact);
    for (const episode of copy.episodes ?? []) {
      for (const segment of episode.segments ?? []) {
        segment.shots = segment.shots?.map((shot, index) => ({ ...shot, shot_number: shot.shot_number ?? index + 1 }));
      }
    }
    return copy;
  });
  const [characters, setCharacters] = useState<Record<string, string>>(() => Object.fromEntries(
    (artifact.episodes ?? []).flatMap((episode) => (episode.segments ?? []).map((segment) =>
      [segment.segment_id, (segment.characters ?? []).join(', ')]
    ))
  ));
  const [openSegment, setOpenSegment] = useState(initialSegmentId ?? artifact.episodes?.[0]?.segments?.[0]?.segment_id);
  const [undo, setUndo] = useState<{ restore: (current: ShortfilmStoryboardArtifact) => ShortfilmStoryboardArtifact; message: string } | null>(null);
  const [validationError, setValidationError] = useState('');
  const updateSegment = (ei: number, si: number, patch: Partial<Segment>) => setDraft((previous) => ({
    ...previous,
    episodes: previous.episodes?.map((episode, index) => index !== ei ? episode : {
      ...episode, segments: episode.segments?.map((segment, index) => index !== si ? segment : { ...segment, ...patch }),
    }),
  }));
  const updateShot = (ei: number, si: number, hi: number, patch: Partial<Shot>) => setDraft((previous) => ({
    ...previous,
    episodes: previous.episodes?.map((episode, index) => index !== ei ? episode : {
      ...episode, segments: episode.segments?.map((segment, index) => index !== si ? segment : {
        ...segment, shots: segment.shots?.map((shot, index) => index !== hi ? shot : { ...shot, ...patch }),
      }),
    }),
  }));
  const rememberDeletion = (ei: number, si: number, hi?: number) => {
    const segment = draft.episodes![ei].segments![si];
    const wholeSegment = hi === undefined || segment.shots?.length === 1;
    setUndo({
      message: t(hi !== undefined && wholeSegment ? 'videoStoryboardLastShotDeleted' : 'videoStoryboardDeleted'),
      restore: (current) => ({ ...current, episodes: current.episodes?.map((episode, index) => {
        if (index !== ei) return episode;
        const segments = [...(episode.segments ?? [])];
        if (wholeSegment) segments.splice(si, 0, segment);
        else {
          const index = segments.findIndex((item) => item.segment_id === segment.segment_id);
          if (index >= 0) {
            const shots = [...(segments[index].shots ?? [])];
            shots.splice(hi!, 0, segment.shots![hi!]);
            segments[index] = { ...segments[index], shots };
          }
        }
        return { ...episode, segments };
      }) }),
    });
  };
  const deleteSegment = (ei: number, si: number) => setDraft((previous) => ({
    ...previous,
    episodes: previous.episodes?.map((episode, index) => index !== ei ? episode : {
      ...episode, segments: episode.segments?.filter((_, index) => index !== si),
    }),
  }));
  const deleteShot = (ei: number, si: number, hi: number) => setDraft((previous) => ({
    ...previous,
    episodes: previous.episodes?.map((episode, index) => index !== ei ? episode : {
      ...episode,
      segments: episode.segments?.flatMap((segment, index) => {
        if (index !== si) return [segment];
        const shots = segment.shots?.filter((_, index) => index !== hi) ?? [];
        return shots.length ? [{ ...segment, shots }] : [];
      }),
    }),
  }));
  return (
    <form noValidate className="relative space-y-3" onSubmit={(event) => {
      event.preventDefault();
      if (disabled) return;
      const episodes = (draft.episodes ?? []).map((episode, ei) => ({
        episode_number: episode.episode_number ?? ei + 1,
        episode_title: episode.episode_title ?? '',
        segments: (episode.segments ?? []).map((segment) => ({
          segment_id: segment.segment_id, location: segment.location ?? '',
          scene_time: segment.scene_time ?? '', scene_space: segment.scene_space ?? '',
          scene_context: segment.scene_context ?? '',
          characters: (characters[segment.segment_id] ?? '').split(/[,，、;；\n]/).map((name) => name.trim()).filter(Boolean),
          shots: (segment.shots ?? []).map((shot, hi) => ({
            shot_number: shot.shot_number ?? hi + 1,
            shot_type: shot.shot_type?.trim() || t('videoStoryboardDefaultShotType'),
            duration: shot.duration ?? 2, content: shot.content?.trim() ?? '',
          })),
        })),
      }));
      if (!episodes.length || episodes.some((episode) => !episode.segments.length || episode.segments.some((segment) => !segment.shots.length))) {
        setValidationError(t('videoStoryboardKeepSegment'));
        return;
      }
      if (episodes.some((episode) => episode.segments.some((segment) => segment.shots.some((shot) => !shot.content)))) {
        setValidationError(t('videoStoryboardContentRequired'));
        return;
      }
      if (episodes.some((episode) => episode.segments.some((segment) => {
        const total = segment.shots.reduce((sum, shot) => sum + shot.duration, 0);
        return total < 5 || total > 15 || segment.shots.some((shot) => !Number.isInteger(shot.duration) || shot.duration < 2 || shot.duration > 15);
      }))) {
        setValidationError(t('videoStoryboardDurationHint'));
        return;
      }
      setValidationError('');
      onSave({ episodes });
    }}>
      <p className="text-xs leading-5 text-white/55">{t('videoStoryboardSaveHint')}</p>
      <fieldset disabled={disabled} className="min-w-0 space-y-4 disabled:opacity-60">
        {(draft.episodes ?? []).map((episode, ei) => (
          <section key={episode.episode_number ?? ei} className="space-y-2">
            <label className="block text-[11px] text-white/70">
              {t('videoStoryboardEpisodeTitle')}
              <input className={inputClass} maxLength={500} value={episode.episode_title ?? ''}
                onChange={(event) => setDraft((previous) => ({ ...previous,
                  episodes: previous.episodes?.map((item, index) => index === ei ? { ...item, episode_title: event.target.value } : item),
                }))} />
            </label>
            {(episode.segments ?? []).map((segment, si) => (
              <section key={segment.segment_id} className="border-b border-white/10 py-3">
                <div className="flex items-center justify-between gap-2">
                  <button type="button" aria-expanded={openSegment === segment.segment_id}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left text-sm text-white/80 hover:text-orange-400 focus-visible:outline-orange-400"
                    onClick={() => setOpenSegment(openSegment === segment.segment_id ? undefined : segment.segment_id)}>
                    <span>{openSegment === segment.segment_id ? '▾' : '▸'}</span>
                    <span className="min-w-0 flex-1 truncate">{t('videoStoryboardSegmentLabel', { number: si + 1 })} · {segment.location}</span>
                    <span className="ml-auto shrink-0 text-xs text-white/45">{t('videoStoryboardSegmentDuration', { seconds: (segment.shots ?? []).reduce((sum, shot) => sum + (shot.duration ?? 2), 0) })}</span>
                  </button>
                  <button type="button" className={"min-h-10 shrink-0 rounded px-2 text-xs text-white/50 transition-colors hover:bg-red-500/10 hover:text-red-300 focus-visible:outline-orange-400"}
                    aria-label={t('videoStoryboardDeleteSegmentLabel', { number: si + 1 })}
                    onClick={() => { rememberDeletion(ei, si); deleteSegment(ei, si); }}>{t('videoStoryboardDeleteSegment')}</button>
                </div>
                <div hidden={openSegment !== segment.segment_id} className="space-y-4 pb-3 pt-2">
                <label className="block text-xs text-white/70">{t('videoStoryboardLocation')}
                  <input className={inputClass} maxLength={500} value={segment.location ?? ''} onChange={(event) => updateSegment(ei, si, { location: event.target.value })} />
                </label>
                <div className="grid grid-cols-2 gap-4">
                {(['scene_time', 'scene_space'] as const).map((field) => {
                  const options = field === 'scene_time' ? ['\u65e5', '\u591c'] : ['\u5185', '\u5916'];
                  return <label key={field} className="block text-xs text-white/70">
                    {t(field === 'scene_time' ? 'videoStoryboardSceneTime' : 'videoStoryboardSceneSpace')}
                    <select className={inputClass} value={segment[field] ?? ''} onChange={(event) => updateSegment(ei, si, { [field]: event.target.value })}>
                      {!options.includes(segment[field] ?? '') ? <option value={segment[field] ?? ''}>{segment[field] || '—'}</option> : null}
                      {options.map((value, index) => <option key={value} value={value}>{t(field === 'scene_time' ? (index ? 'videoSceneNight' : 'videoSceneDay') : (index ? 'videoSceneOutside' : 'videoSceneInside'))}</option>)}
                    </select>
                  </label>;
                })}
                </div>
                <details className="text-xs text-white/60"><summary className="cursor-pointer py-2 hover:text-white">{t('videoStoryboardSceneContext')}</summary>
                  <textarea aria-label={t('videoStoryboardSceneContext')} className={inputClass} maxLength={4000} value={segment.scene_context ?? ''} onChange={(event) => updateSegment(ei, si, { scene_context: event.target.value })} />
                </details>
                <label className="block text-[11px] text-white/70">
                  {t('videoStoryboardCharacters')}
                  <input className={inputClass} value={characters[segment.segment_id] ?? ''} maxLength={12000}
                    onChange={(event) => setCharacters((previous) => ({ ...previous, [segment.segment_id]: event.target.value }))} />
                </label>
                {(segment.shots ?? []).map((shot, hi) => (
                  <section key={shot.shot_number ?? hi} className="space-y-2 border-t border-white/10 pt-2">
                    <div className="flex items-center justify-between gap-2">
                      <h5 className="text-[11px] text-white/75">{t('videoStoryboardShotLabel', { number: hi + 1 })}</h5>
                      <button type="button" className={"min-h-10 shrink-0 rounded px-2 text-xs text-white/50 transition-colors hover:bg-red-500/10 hover:text-red-300 focus-visible:outline-orange-400"}
                        aria-label={t('videoStoryboardDeleteShotLabel', { segment: si + 1, shot: hi + 1 })}
                        onClick={() => { rememberDeletion(ei, si, hi); deleteShot(ei, si, hi); }}>{t('videoStoryboardDeleteShot')}</button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block text-[11px] text-white/70">
                        {t('videoStoryboardShotType')}
                        <input className={inputClass} required maxLength={100} value={shot.shot_type ?? t('videoStoryboardDefaultShotType')}
                          onChange={(event) => updateShot(ei, si, hi, { shot_type: event.target.value })} />
                      </label>
                      <label className="block text-[11px] text-white/70">
                        {t('videoStoryboardShotDuration')}
                        <input className={inputClass} type="number" required min={2} max={15} step={1} value={shot.duration ?? 2}
                          onChange={(event) => updateShot(ei, si, hi, { duration: Number(event.target.value) })} />
                      </label>
                    </div>
                    <label className="block text-[11px] text-white/70">
                      {t('videoStoryboardShotContent')}
                      <textarea className={`${inputClass} min-h-32 leading-6`} required maxLength={20000} value={shot.content ?? ''}
                        onChange={(event) => updateShot(ei, si, hi, { content: event.target.value })} />
                    </label>
                  </section>
                ))}
                <p className="text-[10px] text-white/55">{t('videoStoryboardSegmentDuration', {
                  seconds: (segment.shots ?? []).reduce((sum, shot) => sum + (shot.duration ?? 2), 0),
                })}</p>
                </div>
              </section>
            ))}
          </section>
        ))}
      </fieldset>
      <footer className="sticky bottom-0 z-10 space-y-3 border-t border-white/10 bg-[#17181B] py-3">
      {undo ? <div role="status" className="flex items-center justify-between gap-3 text-xs text-white/70">{undo.message}<button type="button" disabled={disabled} className={`${VIDEO_BUTTON_CLASS} min-h-9 rounded px-3`} onClick={() => { setDraft(undo.restore); setUndo(null); }}>{t('videoStoryboardUndo')}</button></div> : null}
      {error ? <p role="alert" className="text-xs text-red-300">{error}</p> : null}
      {validationError ? <p role="alert" className="text-[11px] text-red-300">{validationError}</p> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={disabled} className={`${VIDEO_BUTTON_CLASS} min-h-10 flex-1 rounded px-3 text-xs`}>
          {t('videoSaveStoryboard')}
        </button>
        <button type="button" disabled={disabled} onClick={onCancel} className={`${VIDEO_BUTTON_CLASS} min-h-10 rounded px-3 text-xs`}>
          {t('videoDesignAssetCancel')}
        </button>
      </div>
      </footer>
    </form>
  );
}
