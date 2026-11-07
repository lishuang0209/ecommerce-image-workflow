/**
 * Shared, server-safe contract for the shortfilm-agent video workflow.
 *
 * Keep this module free of Node-only imports: the canvas panel and the API
 * route both use it.
 */

export const SHORTFILM_SCRIPT_STAGE = 'script_generation';
export const SHORTFILM_DESIGN_STAGE = 'character_design';
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
  /** Only the first slice of the pipeline is wired in P1. */
  connected: boolean;
};

export const SHORTFILM_STAGES: readonly ShortfilmStage[] = [
  { id: 'script_generation', labelKey: 'videoStageScript', connected: true },
  { id: 'character_design', labelKey: 'videoStageDesign', connected: true },
  { id: 'storyboard', labelKey: 'videoStageStoryboard', connected: false },
  { id: 'reference_generation', labelKey: 'videoStageReference', connected: false },
  { id: 'video_generation', labelKey: 'videoStageVideo', connected: false },
  { id: 'post_production', labelKey: 'videoStagePost', connected: false },
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
