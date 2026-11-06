import { useEffect, useMemo, useState } from 'react';
import type { CanvasCard } from '@/core/beatcanvas/canvas-types';
import { apiJsonDelete, apiJsonGet, apiJsonPost } from '@/lib/api-client';
import { useTranslations } from '@/core/workspace-lib/shims/next-intl';
import { adoptedMainSkuName, ecommerceTaskPattern } from '@/core/demo/ecommerce-contract';
import { stylePresetIds, type StylePreset } from '@/core/demo/ecommerce-style-presets';

type Styled = { id: string; url: string; sourceAssetId: string; preset: StylePreset; sku: string; filename: string };

/** Paid background and lighting change for finished images. The original file is kept. */
export function EcommerceStylePanel({ projectId, cards, onChanged }: { projectId: string; cards: Record<string, CanvasCard>; onChanged?: () => void }) {
  const t = useTranslations('AppShell.studio.ecommerce');
  const [picked, setPicked] = useState<string[]>([]);
  const [preset, setPreset] = useState<StylePreset>('daylight');
  const [styled, setStyled] = useState<Styled[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const sources = useMemo(() => {
    const rows: { assetId: string; url: string; label: string }[] = [];
    for (const card of Object.values(cards)) {
      const main = /^(sku-[a-f0-9]{16})-adopted-main$/.exec(card.id);
      if (main && card.assetId && card.url) rows.push({ assetId: card.assetId, url: card.url, label: adoptedMainSkuName(card.name) + ' · ' + t('mainTaskTitle') });
    }
    const latest = new Map<string, CanvasCard>();
    for (const card of Object.values(cards)) {
      if (card.kind === 'output' && card.status === 'succeeded' && card.assetId && card.url && card.sourceConfigCardId && ecommerceTaskPattern.exec(card.sourceConfigCardId)?.[2]?.startsWith('scene')) latest.set(card.sourceConfigCardId, card);
    }
    for (const [taskId, output] of latest) rows.push({ assetId: output.assetId!, url: output.url!, label: cards[taskId]?.name || taskId });
    return rows;
  }, [cards, t]);
  async function reload() {
    try { setStyled((await apiJsonGet<{ styled: Styled[] }>(`/api/demo/ecommerce-style?projectId=${projectId}`)).styled); } catch { /* errors surface when the user runs a change */ }
  }
  useEffect(() => { void reload(); }, [projectId]);
  const valid = picked.filter(id => sources.some(row => row.assetId === id));
  async function run() {
    if (valid.length > 8) { setError(t('styleTooMany')); return; }
    if (!window.confirm(t('styleConfirm', { count: valid.length, style: t(('style_' + preset) as 'style_daylight') }))) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await apiJsonPost<{ styled: (Styled & { created: boolean })[] }>('/api/demo/ecommerce-style', { projectId, assetIds: valid, preset });
      const created = result.styled.filter(item => item.created).length;
      setNotice(t('styleDone', { created, reused: result.styled.length - created }));
      await reload();
      onChanged?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('failed')); }
    finally { setBusy(false); }
  }
  async function remove(assetId: string) {
    if (!window.confirm(t('styleDeleteConfirm'))) return;
    setError('');
    try { await apiJsonDelete('/api/demo/ecommerce-style', { projectId, assetId }); await reload(); onChanged?.(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('failed')); }
  }
  if (!sources.length) return null;
  const toggle = (list: string[], value: string, on: boolean) => on ? [...new Set([...list, value])] : list.filter(item => item !== value);
  return <section aria-label={t('styleTitle')} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
    <div className="flex items-center justify-between text-xs"><h3>{t('styleTitle')}</h3><span className="text-[var(--beat-text-3)]">{t('stylePaid')}</span></div>
    <p className="text-[11px] leading-5 text-[var(--beat-text-3)]">{t('styleHint')}</p>
    <div className="space-y-1">{sources.map(row => <label key={row.assetId} className="flex min-h-12 items-center gap-2 rounded-lg px-2 text-xs hover:bg-white/[0.03]">
      <input type="checkbox" disabled={busy} checked={picked.includes(row.assetId)} onChange={event => setPicked(current => toggle(current, row.assetId, event.target.checked))} />
      <img src={row.url} alt={row.label} className="size-9 shrink-0 rounded bg-white/5 object-contain" />
      <span className="min-w-0 flex-1 truncate">{row.label}</span>
    </label>)}</div>
    <label className="block text-xs">{t('styleChoose')}<select aria-label={t('styleChoose')} disabled={busy} value={preset} onChange={event => setPreset(event.target.value as StylePreset)} className="mt-1 min-h-10 w-full rounded border border-white/15 bg-[var(--beat-surface)] px-2 text-xs">{stylePresetIds.map(id => <option key={id} value={id}>{t(('style_' + id) as 'style_daylight')}</option>)}</select></label>
    <button type="button" disabled={busy || !valid.length || valid.length > 8} className="min-h-10 w-full rounded-lg bg-[var(--beat-accent)] px-3 text-xs text-black disabled:opacity-40" onClick={() => void run()}>{busy ? t('taskRunningShort') : t('styleRun') + ' · ' + valid.length}</button>
    {notice && <p role="status" className="text-xs text-green-300">{notice}</p>}
    {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    {styled.length > 0 && <div className="space-y-2 border-t border-white/10 pt-3">
      <h4 className="text-xs">{t('styleResults')} · {styled.length}</h4>
      <div className="grid grid-cols-3 gap-2">{styled.map(item => <figure key={item.id} className="space-y-1">
        <a href={item.url} target="_blank" rel="noreferrer"><img src={item.url} alt={t(('style_' + item.preset) as 'style_daylight')} className="aspect-square w-full rounded bg-white/5 object-contain" /></a>
        <figcaption className="space-y-0.5 text-[11px]"><span className="block truncate text-[var(--beat-text-3)]">{item.sku} · {t(('style_' + item.preset) as 'style_daylight')}</span>
          <button type="button" disabled={busy} className="text-[var(--beat-text-3)] hover:text-red-300 disabled:opacity-40" onClick={() => void remove(item.id)}>{t('resizeDelete')}</button></figcaption>
      </figure>)}</div>
    </div>}
  </section>;
}
