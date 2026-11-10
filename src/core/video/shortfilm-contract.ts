/**
 * Shared, server-safe contract for the shortfilm-agent video workflow.
 *
 * Keep this module free of Node-only imports: the canvas panel and the API
 * route both use it.
 */

export const SHORTFILM_SCRIPT_STAGE = 'script_generation';
export const SHORTFILM_DESIGN_STAGE = 'character_design';
export const SHORTFILM_FINAL_STAGE = 'post_production';
export const SHORTFILM_VIDEO_STAGE = 'video_generation';
export const SHORTFILM_REFERENCE_STAGE = 'reference_generation';
export const SHORTFILM_STORYBOARD_STAGE = 'storyboard';
export const SHORTFILM_STORYBOARD_CARD_ID = 'video-ad-storyboard';
export const SHORTFILM_SCRIPT_CARD_ID = 'video-ad-script';
export const SHORTFILM_FACTS_CARD_ID = 'video-product-facts';
export const SHORTFILM_SCRIPT_CARD_MAX_CHARS = 100_000;

export type ShortfilmStage = {
  id:
    | 'script_generation'
    | 'character_design'
    | 'storyboard'
    | 'reference_generation'
    | 'video_generation'
    | 'post_production';
  /** Message key under AppShell.studio.ecommerce. */
  labelKey: string;
  /** The six stages are connected to the sidecar. */
  connected: boolean;
};

export const SHORTFILM_STAGES: readonly ShortfilmStage[] = [
  { id: 'script_generation', labelKey: 'videoStageScript', connected: true },
  { id: 'character_design', labelKey: 'videoStageDesign', connected: true },
  { id: 'storyboard', labelKey: 'videoStageStoryboard', connected: true },
  { id: 'reference_generation', labelKey: 'videoStageReference', connected: true },
  { id: 'video_generation', labelKey: 'videoStageVideo', connected: true },
  { id: 'post_production', labelKey: 'videoStagePost', connected: true },
];

export type ShortfilmScriptEpisode = {
  episode_number?: number | string;
  act_title?: string;
  content?: string;
};

export type ShortfilmDesignAsset = {
  id: string;
  name: string;
  description?: string;
  visual_prompt?: string;
  selectedVersion?: string;
  selected?: string;
  versions?: string[];
  status?: string;
};

export type ShortfilmDesignArtifact = {
  session_id?: string;
  characters?: ShortfilmDesignAsset[];
  settings?: ShortfilmDesignAsset[];
};

export type ShortfilmScriptArtifact = {
  title?: string;
  logline?: string;
  /** Some shortfilm responses place the raw script under meta.original_text. */
  original_text?: string;
  meta?: { original_text?: string };
  episodes?: ShortfilmScriptEpisode[];
};

export type ShortfilmStageProgress = {
  message?: string;
  step?: string;
  percent?: number;
};

export type ShortfilmStatus = {
  session_id?: string;
  scenario?: string;
  current_stage?: string;
  status?: Record<string, string>;
  stage_progress?: Record<string, ShortfilmStageProgress>;
  error?: string | null;
};

/**
 * Turn the script artifact into one editable canvas text card. Episode headers
 * are kept because the downstream storyboard parser expects them.
 */
export function buildScriptCardText(
  artifact: ShortfilmScriptArtifact | null | undefined
): string {
  if (!artifact) return '';

  const lines: string[] = [];
  const title = typeof artifact.title === 'string' ? artifact.title.trim() : '';
  const logline =
    typeof artifact.logline === 'string' ? artifact.logline.trim() : '';
  if (title) lines.push(`# ${title}`);
  if (logline) lines.push(logline);

  const episodes = Array.isArray(artifact.episodes) ? artifact.episodes : [];
  for (const episode of episodes) {
    if (!episode || typeof episode !== 'object') continue;
    const number = Number(episode.episode_number);
    const heading =
      typeof episode.act_title === 'string' && episode.act_title.trim()
        ? episode.act_title.trim()
        : Number.isFinite(number)
          ? `第${number}集`
          : '';
    if (heading) lines.push('', `## ${heading}`);
    if (typeof episode.content === 'string' && episode.content.trim()) {
      lines.push(episode.content.trim());
    }
  }

  if (lines.length === 0) {
    const fallback =
      (typeof artifact.original_text === 'string' && artifact.original_text) ||
      (typeof artifact.meta?.original_text === 'string' &&
        artifact.meta.original_text) ||
      '';
    return fallback.trim().slice(0, SHORTFILM_SCRIPT_CARD_MAX_CHARS);
  }

  return lines.join('\n').trim().slice(0, SHORTFILM_SCRIPT_CARD_MAX_CHARS);
}

/** Localized name for the imported script text card. */
export function scriptCardName(locale?: string): string {
  if (locale === 'zh') return '广告脚本';
  if (locale === 'ja') return '広告スクリプト';
  return 'Ad script';
}

/** Localized canvas card name for a generated character/setting image. */
export function designCardName(
  kind: 'character' | 'setting',
  name: string,
  locale?: string
): string {
  const label =
    locale === 'zh'
      ? kind === 'character'
        ? '角色'
        : '场景'
      : locale === 'ja'
        ? kind === 'character'
          ? 'キャラクター'
          : 'シーン'
        : kind === 'character'
          ? 'Character'
          : 'Setting';
  return `${label} · ${name}`;
}

/** i18n key for a shortfilm stage status. */
export function stageStatusKey(status: string | undefined): string {
  switch (status) {
    case 'running':
      return 'videoStatusRunning';
    case 'waiting':
      return 'videoStatusWaiting';
    case 'completed':
      return 'videoStatusCompleted';
    case 'stopped':
      return 'videoStatusStopped';
    case 'error':
      return 'videoStatusError';
    default:
      return 'videoStatusPending';
  }
}

export function scriptIsReady(status: Record<string, string> | undefined): boolean {
  const value = status?.[SHORTFILM_SCRIPT_STAGE];
  return value === 'completed' || value === 'waiting';
}

export function designIsReady(status: Record<string, string> | undefined): boolean {
  const value = status?.[SHORTFILM_DESIGN_STAGE];
  return value === 'completed' || value === 'waiting';
}


export type ShortfilmStoryboardShot = {
  shot_number?: number;
  shot_type?: string;
  duration?: number;
  content?: string;
};

export type ShortfilmStoryboardSegment = {
  segment_id: string;
  segment_number?: number;
  total_duration?: number;
  location?: string;
  scene_time?: string;
  scene_space?: string;
  scene_context?: string;
  characters?: string[];
  shots?: ShortfilmStoryboardShot[];
};

export type ShortfilmStoryboardArtifact = {
  session_id?: string;
  episodes?: Array<{
    episode_number?: number;
    episode_title?: string;
    segments?: ShortfilmStoryboardSegment[];
  }>;
};

export function hasStoryboardContent(artifact: ShortfilmStoryboardArtifact | null | undefined): boolean {
  return Boolean(artifact?.episodes?.length && artifact.episodes.every((episode) =>
    episode.segments?.length && episode.segments.every((segment) =>
      segment.segment_id && segment.shots?.length &&
      segment.shots.every((shot) => typeof shot.content === 'string' && shot.content.trim())
    )
  ));
}

export function storyboardIsReady(status: Record<string, string> | undefined): boolean {
  const value = status?.[SHORTFILM_STORYBOARD_STAGE];
  return value === 'completed' || value === 'waiting';
}

export function storyboardCardName(locale?: string): string {
  if (locale === 'zh') return '广告分镜';
  if (locale === 'ja') return '広告絵コンテ';
  return 'Ad storyboard';
}

/** Keep the complete episode → segment → shot hierarchy in a readable text card. */
export function buildStoryboardCardText(
  artifact: ShortfilmStoryboardArtifact | null | undefined,
  locale?: string
): string {
  const labels = locale === 'zh'
    ? { episode: '版本', segment: '片段', shot: '镜头', characters: '人物', seconds: '秒' }
    : locale === 'ja'
      ? { episode: 'バージョン', segment: 'セグメント', shot: 'ショット', characters: '登場人物', seconds: '秒' }
      : { episode: 'Version', segment: 'Segment', shot: 'Shot', characters: 'Characters', seconds: 's' };
  const lines: string[] = [];
  for (const [episodeIndex, episode] of (artifact?.episodes ?? []).entries()) {
    lines.push(`## ${episode.episode_title || `${labels.episode} ${episode.episode_number ?? episodeIndex + 1}`}`);
    for (const [segmentIndex, segment] of (episode.segments ?? []).entries()) {
      const duration = typeof segment.total_duration === 'number' ? ` · ${segment.total_duration}${labels.seconds}` : '';
      lines.push('', `### ${labels.segment} ${segment.segment_number ?? segmentIndex + 1}${duration}`);
      const setting = [segment.scene_time, segment.scene_space, segment.location].filter(Boolean).join(' · ');
      if (setting) lines.push(setting);
      if (segment.scene_context) lines.push(segment.scene_context);
      if (segment.characters?.length) lines.push(`${labels.characters}: ${segment.characters.join(' / ')}`);
      for (const [shotIndex, shot] of (segment.shots ?? []).entries()) {
        const details = [shot.shot_type, typeof shot.duration === 'number' ? `${shot.duration}${labels.seconds}` : ''].filter(Boolean).join(' · ');
        lines.push('', `${labels.shot} ${shot.shot_number ?? shotIndex + 1}${details ? ` · ${details}` : ''}`, shot.content ?? '');
      }
    }
    lines.push('');
  }
  return lines.join('\n').trim().slice(0, SHORTFILM_SCRIPT_CARD_MAX_CHARS);
}

/** A change invalidates this stage and all confirmations downstream of it. */
export function confirmationsBeforeStage(confirmed: readonly string[] | undefined, stage: string): string[] {
  const index = SHORTFILM_STAGES.findIndex((item) => item.id === stage);
  return (confirmed ?? []).filter((id) => {
    const confirmedIndex = SHORTFILM_STAGES.findIndex((item) => item.id === id);
    return confirmedIndex >= 0 && confirmedIndex < index;
  });
}

export type ShortfilmReferenceArtifact = { scenes?: ShortfilmDesignAsset[] };

export function referenceIsReady(status: Record<string, string> | undefined): boolean {
  return ['completed', 'waiting'].includes(status?.[SHORTFILM_REFERENCE_STAGE] ?? '');
}

export function hasReferenceContent(reference: ShortfilmReferenceArtifact | null | undefined, storyboard: ShortfilmStoryboardArtifact | null | undefined): boolean {
  const ids = (storyboard?.episodes ?? []).flatMap((episode) => (episode.segments ?? []).map((segment) => segment.segment_id));
  return ids.length > 0 && ids.every((id) => reference?.scenes?.some((scene) => scene.id === id && scene.selected && scene.status !== 'failed'));
}

export function referenceCardName(name: string, locale?: string): string {
  return `${locale === 'zh' ? '画面' : locale === 'ja' ? 'フレーム' : 'Frame'} · ${name}`;
}

export type ShortfilmVideoArtifact = { clips?: Array<ShortfilmDesignAsset & { duration?: number }> };

export function videoIsReady(status: Record<string, string> | undefined): boolean {
  return ['completed', 'waiting'].includes(status?.[SHORTFILM_VIDEO_STAGE] ?? '');
}

export function hasVideoContent(video: ShortfilmVideoArtifact | null | undefined, storyboard: ShortfilmStoryboardArtifact | null | undefined): boolean {
  return hasReferenceContent({ scenes: video?.clips }, storyboard);
}

export function videoCardName(name: string, locale?: string): string {
  return `${locale === 'zh' ? '视频' : locale === 'ja' ? '動画' : 'Video'} · ${name}`;
}

export function videoSegmentDescription(segment: ShortfilmStoryboardSegment): string {
  return (segment.shots ?? []).map((shot, index) => `Shot ${index + 1} [${shot.duration ?? 2}s] ${shot.shot_type ?? ''}: ${shot.content ?? ''}`).join('\n');
}

export type ShortfilmFinalArtifact = { final_videos?: Array<{ episode: number; name: string; path: string; preview_path?: string }> };
export function finalIsReady(status: Record<string, string> | undefined): boolean {
  return ['completed', 'waiting'].includes(status?.[SHORTFILM_FINAL_STAGE] ?? '');
}
export function finalCardName(name: string, locale?: string): string {
  return `${locale === 'zh' ? '成片' : locale === 'ja' ? '完成動画' : 'Final video'} · ${name}`;
}
export function hasFinalContent(final: ShortfilmFinalArtifact | null | undefined, storyboard: ShortfilmStoryboardArtifact | null | undefined): boolean {
  return Boolean(storyboard?.episodes?.length && storyboard.episodes.every((episode, index) =>
    final?.final_videos?.some((video) => video.episode === (episode.episode_number ?? index + 1) && video.path)));
}
