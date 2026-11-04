import { Cloud, Database } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DEFAULT_BEATAPI_BASE_URL,
  getBeatCanvasProviderPublicConfig,
} from '@/core/beatcanvas/providers/provider-config';
import { useTranslations } from '@/core/workspace-lib/shims/next-intl';
import { apiGet, apiPost, apiJsonGet, apiJsonPost } from '@/lib/api-client';
import { maskApiKeyPreview } from '@/lib/mask-api-key';

/** Custom plug glyph — the workspace's "connect your API" mark. */
function PlugGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M9 2.5v4.5" />
      <path d="M15 2.5v4.5" />
      <path d="M6.5 7h11v3.8a5.5 5.5 0 0 1-11 0V7Z" />
      <path d="M12 16.3v2.2" />
      <path d="M12 18.5c0 1.6 1.4 3 3 3h2.5" />
    </svg>
  );
}

const inputClassName =
  'h-11 w-full rounded-[12px] border border-white/[0.12] bg-white/[0.04] px-3.5 font-mono text-[13px] text-white outline-none transition placeholder:text-white/30 focus:border-[#ff7a33]/55 focus:ring-[3px] focus:ring-[#ff7a33]/15';

const saveButtonClassName =
  'h-11 w-full rounded-[12px] bg-[#ff7a33] text-[14px] font-semibold text-[#1d1d1f] shadow-[0_8px_24px_rgba(255,122,51,0.24)] transition hover:bg-[#ff8a4d] disabled:cursor-not-allowed disabled:opacity-60';

const configuredKeyMask = '••••••••••••••••••••••••';

type BeatApiConfigState = {
  baseUrl: string;
  apiKeyConfigured: boolean;
  apiKeyPreview: string;
};

type StorageConfigState = {
  mode: 'beatapi' | 's3';
  managedEligible: boolean;
  custom: {
    region: string;
    endpoint: string;
    bucketName: string;
    publicUrl: string;
    forcePathStyle: boolean;
    accessKeyConfigured: boolean;
    secretKeyConfigured: boolean;
  };
};

function BailianConfigForm({ onConfigured }: { onConfigured: (configured: boolean) => void }) {
  const t = useTranslations('demo');
  const [baseUrl, setBaseUrl] = useState('https://dashscope.aliyuncs.com');
  const [apiKey, setApiKey] = useState('');
  const [configured, setConfigured] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    apiJsonGet<{ baseUrl: string; configured: boolean }>('/api/demo/config').then(state => {
      if (!active) return;
      setBaseUrl(state.baseUrl); setConfigured(state.configured); onConfigured(state.configured); setLoaded(true);
    }).catch(() => { if (active) setError(t('configLoadError')); });
    return () => { active = false; };
  }, []);
  return <form className="space-y-4 px-5 py-5" onSubmit={event => {
    event.preventDefault(); setSaving(true); setError('');
    void apiJsonPost<{ configured: boolean }>('/api/demo/config', { baseUrl, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) }).then(state => {
      setApiKey(''); setConfigured(state.configured); onConfigured(state.configured); toast.success(t('saved'));
    }).catch(err => setError(err instanceof Error ? err.message : t('configLoadError'))).finally(() => setSaving(false));
  }}>
    <div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">{t('bailian')}</p><span className="text-xs text-white/50">{configured ? t('configured') : t('unconfigured')}</span></div>
    <label className="block space-y-2 text-xs text-white/60" htmlFor="bailian-base-url">{t('endpoint')}<input id="bailian-base-url" type="url" className={inputClassName} value={baseUrl} onChange={event => setBaseUrl(event.target.value)} required disabled={!loaded || saving} /></label>
    <label className="block space-y-2 text-xs text-white/60" htmlFor="bailian-api-key">{t('key')}<input id="bailian-api-key" type="password" autoComplete="off" spellCheck={false} className={inputClassName} value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={configured ? t('keyKeep') : t('key')} disabled={!loaded || saving} /></label>
    <p className="text-xs leading-6 text-white/50">{t('keyHint')}</p>
    <p className="rounded-lg border border-white/10 p-3 text-xs leading-6 text-white/65">{t('bailianExecutionNotice')}</p>
    {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    <button type="submit" disabled={!loaded || saving || (!configured && apiKey.trim().length < 10)} className={saveButtonClassName}>{saving ? t('saving') : t('save')}</button>
  </form>;
}

function ApiConfigForm({
  providerLabel,
  isDefault,
  state,
  loaded,
  onSaved,
}: {
  providerLabel: string;
  isDefault: boolean;
  state: BeatApiConfigState | null;
  loaded: boolean;
  onSaved: (state: BeatApiConfigState) => void;
}) {
  const t = useTranslations('AppShell.header.apiConfig');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const configured = Boolean(state?.apiKeyConfigured && state.apiKeyPreview);

  async function save() {
    const nextKey = apiKey.trim();
    if (!nextKey) return;
    setSaving(true);
    try {
      const result = await apiPost<{ apiKeyPreview?: string }>(
        '/api/config/beatapi',
        { apiKey: nextKey }
      );
      toast.success(t('saved'));
      setApiKey('');
      setEditing(false);
      onSaved({
        baseUrl: DEFAULT_BEATAPI_BASE_URL,
        apiKeyConfigured: true,
        apiKeyPreview: result?.apiKeyPreview || maskApiKeyPreview(nextKey),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 px-5 py-5">
      <div className="flex items-center gap-2">
        <p className="text-[13px] font-medium text-white">{providerLabel}</p>
        {isDefault ? (
          <span className="rounded-full border border-[#ff7a33]/30 bg-[#ff7a33]/10 px-2 py-0.5 text-[11px] font-semibold tracking-[0.04em] text-[#ff9a62]">
            {t('defaultBadge')}
          </span>
        ) : null}
      </div>

      <div>
        <label
          htmlFor="beatapi-key"
          className="mb-2 block text-[12px] font-medium text-white/45"
        >
          {t('keyLabel')}
        </label>
        {!loaded ? (
          <div
            className="h-11 animate-pulse rounded-[12px] border border-white/[0.08] bg-white/[0.04] motion-reduce:animate-none"
            aria-label={t('loadingConnection')}
          />
        ) : (
          <input
            id="beatapi-key"
            type={configured && !editing ? 'text' : 'password'}
            value={configured && !editing ? configuredKeyMask : apiKey}
            onFocus={() => {
              if (configured && !editing) {
                setEditing(true);
                setApiKey('');
              }
            }}
            onBlur={() => {
              if (!apiKey.trim()) setEditing(false);
            }}
            onChange={(event) => {
              setEditing(true);
              setApiKey(event.target.value);
            }}
            placeholder={t('keyPlaceholder')}
            autoComplete="off"
            className={inputClassName}
          />
        )}
      </div>

      <button
        type="button"
        disabled={!loaded || saving || !apiKey.trim()}
        onClick={() => void save()}
        className={saveButtonClassName}
      >
        {saving ? t('saving') : t('save')}
      </button>

      <a
        href="https://beatapi.io/dashboard/apikeys"
        target="_blank"
        rel="noreferrer"
        className="inline-flex text-[12px] font-semibold text-[#ff8b4d] transition hover:text-[#ffa26b]"
      >
        {t('getKey')}
      </a>
    </div>
  );
}

function StorageConfigForm({ onSaved }: { onSaved: () => void }) {
  const t = useTranslations('AppShell.header.apiConfig.storage');
  const [state, setState] = useState<StorageConfigState | null>(null);
  const [mode, setMode] = useState<'beatapi' | 's3'>('beatapi');
  const [region, setRegion] = useState('auto');
  const [endpoint, setEndpoint] = useState('');
  const [bucketName, setBucketName] = useState('');
  const [publicUrl, setPublicUrl] = useState('');
  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretAccessKey, setSecretAccessKey] = useState('');
  const [forcePathStyle, setForcePathStyle] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void apiGet<StorageConfigState>('/api/config/storage')
      .then((config) => {
        if (cancelled || !config) return;
        setState(config);
        setMode(config.mode);
        setRegion(config.custom.region || 'auto');
        setEndpoint(config.custom.endpoint);
        setBucketName(config.custom.bucketName);
        setPublicUrl(config.custom.publicUrl);
        setForcePathStyle(config.custom.forcePathStyle);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setSaving(true);
    try {
      await apiPost('/api/config/storage', {
        mode,
        ...(mode === 's3'
          ? {
              region: region.trim() || 'auto',
              endpoint: endpoint.trim(),
              bucketName: bucketName.trim(),
              publicUrl: publicUrl.trim(),
              accessKeyId: accessKeyId.trim(),
              secretAccessKey: secretAccessKey.trim(),
              forcePathStyle,
            }
          : {}),
      });
      toast.success(t('saved'));
      setState((previous) =>
        previous
          ? {
              mode,
              managedEligible: previous.managedEligible,
              custom: {
                ...previous.custom,
                region,
                endpoint,
                bucketName,
                publicUrl,
                forcePathStyle,
                accessKeyConfigured: Boolean(
                  accessKeyId || previous.custom.accessKeyConfigured
                ),
                secretKeyConfigured: Boolean(
                  secretAccessKey || previous.custom.secretKeyConfigured
                ),
              },
            }
          : previous
      );
      setAccessKeyId('');
      setSecretAccessKey('');
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 px-5 py-5">
      <div className="grid grid-cols-2 gap-1 rounded-[12px] border border-white/[0.08] bg-black/20 p-1">
        <button
          type="button"
          disabled={!state?.managedEligible}
          onClick={() => {
            if (state?.managedEligible) setMode('beatapi');
          }}
          className={`inline-flex h-10 items-center justify-center gap-2 rounded-[10px] text-[13px] font-semibold transition ${
            mode === 'beatapi'
              ? 'bg-white/[0.08] text-white'
              : 'text-white/40 hover:text-white/70'
          } disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:text-white/40`}
        >
          <Cloud
            className={`size-3.5 ${mode === 'beatapi' ? 'text-[#ff8b4d]' : ''}`}
          />
          {t('managedTitle')}
        </button>
        <button
          type="button"
          onClick={() => setMode('s3')}
          className={`inline-flex h-10 items-center justify-center gap-2 rounded-[10px] text-[13px] font-semibold transition ${
            mode === 's3'
              ? 'bg-white/[0.08] text-white'
              : 'text-white/40 hover:text-white/70'
          }`}
        >
          <Database
            className={`size-3.5 ${mode === 's3' ? 'text-[#ff8b4d]' : ''}`}
          />
          {t('customTitle')}
        </button>
      </div>

      {mode === 'beatapi' ? (
        <p className="text-[12px] leading-5 text-white/40">{t('managedHint')}</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-[110px_1fr] gap-3">
            <input
              value={region}
              onChange={(event) => setRegion(event.target.value)}
              placeholder={t('regionPlaceholder')}
              aria-label={t('regionLabel')}
              className={inputClassName}
            />
            <input
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
              placeholder={t('endpointPlaceholder')}
              aria-label={t('endpointLabel')}
              className={inputClassName}
            />
          </div>
          <input
            value={bucketName}
            onChange={(event) => setBucketName(event.target.value)}
            placeholder={t('bucketPlaceholder')}
            aria-label={t('bucketLabel')}
            className={inputClassName}
          />
          <input
            value={publicUrl}
            onChange={(event) => setPublicUrl(event.target.value)}
            placeholder={t('publicUrlPlaceholder')}
            aria-label={t('publicUrlLabel')}
            className={inputClassName}
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              type="password"
              value={accessKeyId}
              onChange={(event) => setAccessKeyId(event.target.value)}
              placeholder={
                state?.custom?.accessKeyConfigured
                  ? t('configuredPlaceholder')
                  : t('accessKeyPlaceholder')
              }
              aria-label={t('accessKeyLabel')}
              autoComplete="off"
              className={inputClassName}
            />
            <input
              type="password"
              value={secretAccessKey}
              onChange={(event) => setSecretAccessKey(event.target.value)}
              placeholder={
                state?.custom?.secretKeyConfigured
                  ? t('configuredPlaceholder')
                  : t('secretKeyPlaceholder')
              }
              aria-label={t('secretKeyLabel')}
              autoComplete="off"
              className={inputClassName}
            />
          </div>
          <label className="flex items-center gap-2 text-[12px] text-white/45">
            <input
              type="checkbox"
              checked={forcePathStyle}
              onChange={(event) => setForcePathStyle(event.target.checked)}
              className="accent-[#ff7a33]"
            />
            {t('forcePathStyle')}
          </label>
        </div>
      )}

      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className={saveButtonClassName}
      >
        {saving ? t('saving') : t('save')}
      </button>
    </div>
  );
}

export function WorkspaceApiConfigDialog(_props: { providerId?: string | null }) {
  const t = useTranslations('AppShell.header.apiConfig');
  const demoCopy = useTranslations('demo');
  const [section, setSection] = useState<'bailian' | 'storage'>('bailian');
  const [configured, setConfigured] = useState(false);

  return (
    <Dialog>
      <DialogTrigger
        aria-label={demoCopy('config')}
        title={demoCopy('config')}
        className={`relative inline-flex size-9 shrink-0 items-center justify-center rounded-full border bg-white/[0.035] transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7a33]/45 ${configured ? 'border-[#ff7a33]/35 text-[#ff8b4d]' : 'border-white/[0.09] text-[#a0a1a8]'}`}
      >
        <PlugGlyph className="size-[18px]" />
        {configured && <span className="absolute right-0 top-0 size-2.5 rounded-full border-2 border-[#111214] bg-[#c7f36b]" aria-hidden="true" />}
      </DialogTrigger>
      <DialogContent className="beat-product-shell max-h-[88vh] overflow-y-auto rounded-[24px] border border-white/10 bg-[#111214] p-0 text-[#f5f5f7] sm:max-w-[480px]">
        <DialogHeader className="border-b border-white/[0.08] px-5 pb-4 pt-5 text-left">
          <DialogTitle className="text-[17px] font-semibold">{t('title')}</DialogTitle>
          <DialogDescription className="text-xs leading-6 text-white/50">{demoCopy('bailianDescription')}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 border-b border-white/[0.08] p-1">
          {(['bailian', 'storage'] as const).map(item => <button key={item} type="button" aria-pressed={section === item} onClick={() => setSection(item)} className={`min-h-11 rounded-lg text-sm ${section === item ? 'bg-white/[0.08] text-white' : 'text-white/45'}`}>{item === 'bailian' ? demoCopy('bailian') : t('storageTab')}</button>)}
        </div>
        {section === 'bailian' ? <BailianConfigForm onConfigured={setConfigured} /> : <p className="px-5 py-6 text-sm leading-7 text-white/60">{demoCopy('localStorageNotice')}</p>}
      </DialogContent>
    </Dialog>
  );
}
