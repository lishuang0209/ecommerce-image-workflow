import type {
  ShortfilmScriptArtifact,
  ShortfilmStatus,
} from './shortfilm-contract';

const DEFAULT_BASE_URL = 'http://127.0.0.1:8000';

export const getShortfilmBaseUrl = () =>
  (process.env.SHORTFILM_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(
    /\/+$/,
    ''
  );

export class ShortfilmRequestError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = 'ShortfilmRequestError';
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    throw new ShortfilmRequestError(
      text.trim() || `shortfilm-agent returned ${response.status}.`,
      response.status
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ShortfilmRequestError('shortfilm-agent returned invalid JSON.');
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
  timeoutMs = 20_000
): Promise<T> {
  const response = await fetch(`${getShortfilmBaseUrl()}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  return readJson<T>(response);
}

export async function isShortfilmOnline(): Promise<boolean> {
  try {
    const response = await fetch(`${getShortfilmBaseUrl()}/api/health`, {
      signal: AbortSignal.timeout(1_500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export type StartShortfilmInput = {
  idea: string;
  style: string;
  episodes: number;
  videoRatio: string;
  videoResolution: string;
  llmModel: string;
  vlmModel: string;
  imageT2iModel: string;
  imageIt2iModel: string;
  videoModel: string;
  videoFirstFrameModel: string;
  videoStartEndModel: string;
  videoReferenceModel: string;
};

export type StartShortfilmResponse = {
  session_id: string;
  scenario?: string;
  stages?: Array<{ id: string; name: string; type: string }>;
  status?: Record<string, string>;
};

export async function startShortfilmProject(
  input: StartShortfilmInput
): Promise<StartShortfilmResponse> {
  return request<StartShortfilmResponse>(
    '/api/project/start',
    {
      method: 'POST',
      body: JSON.stringify({
        scenario: 'ecommerce_ad',
        idea: input.idea,
        style: input.style,
        episodes: input.episodes,
        video_ratio: input.videoRatio,
        video_resolution: input.videoResolution,
        llm_model: input.llmModel,
        vlm_model: input.vlmModel,
        image_t2i_model: input.imageT2iModel,
        image_it2i_model: input.imageIt2iModel,
        video_model: input.videoModel,
        video_first_frame_model: input.videoFirstFrameModel,
        video_start_end_model: input.videoStartEndModel,
        video_reference_model: input.videoReferenceModel,
        video_generation_mode: 'first_frame',
        enable_concurrency: true,
      }),
    },
    30_000
  );
}

export async function getShortfilmStatus(
  sessionId: string
): Promise<ShortfilmStatus> {
  return request<ShortfilmStatus>(
    `/api/project/${encodeURIComponent(sessionId)}/status`
  );
}

export async function getShortfilmArtifact<T = unknown>(
  sessionId: string,
  stage: string
): Promise<{ stage?: string; artifact: T }> {
  return request<{ stage?: string; artifact: T }>(
    `/api/project/${encodeURIComponent(sessionId)}/artifact/${encodeURIComponent(stage)}`
  );
}

export async function getShortfilmScript(
  sessionId: string
): Promise<ShortfilmScriptArtifact> {
  const response = await getShortfilmArtifact<ShortfilmScriptArtifact>(
    sessionId,
    'script_generation'
  );
  return response.artifact ?? {};
}

/**
 * The shortfilm endpoint streams SSE. P1 only needs completion, so wait for
 * the stream to end and let the caller poll /status for the final state.
 */
export async function runShortfilmStage(
  sessionId: string,
  stage: string,
  timeoutMs = 300_000
): Promise<void> {
  const response = await fetch(
    `${getShortfilmBaseUrl()}/api/project/${encodeURIComponent(sessionId)}/execute/${encodeURIComponent(stage)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(timeoutMs),
    }
  );
  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new ShortfilmRequestError(
      message.trim() || `shortfilm-agent returned ${response.status}.`,
      response.status
    );
  }
  // Drain the SSE stream so the server-side workflow finishes.
  await response.text();
}

export async function continueShortfilm(
  sessionId: string
): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(
    `/api/project/${encodeURIComponent(sessionId)}/continue`,
    { method: 'POST', body: JSON.stringify({}) }
  );
}
