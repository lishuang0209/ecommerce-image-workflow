import { useEffect, useMemo, useState } from 'react';
import type { CanvasCard } from '@/core/beatcanvas/canvas-types';
import { apiJsonDelete, apiJsonGet, apiJsonPost } from '@/lib/api-client';
import { useTranslations } from '@/core/workspace-lib/shims/next-intl';
import { ecommerceTaskPattern } from '@/core/demo/ecommerce-contract';

const ratios = ['1:1', '3:4', '9:16'] as const;
type Derived = { id: string; url: string; sourceAssetId: string; ratio: string; mode: string; sku: string; task: string; filename: string };

/** Batch size change for finished results. Local crop / padding only: no model call, no cost. */
export function EcommerceResizePanel({ projectId, cards }: { projectId: string; cards: Record<string, CanvasCard> }) {
  const t = useTranslations('AppShell.studio.ecommerce');
  const [picked, setPicked] = useState<string[]>([]);
  const [targets, setTargets] = useState<string[]>(['3:4']);
  const [mode, setMode] = useState<'auto' | 'crop' | 'pad'>('auto');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [derived, setDerived] = useState<Derived[]>([]), [zipping, setZipping] = useState(false);
  const sources = useMemo(() => {
    const rows: { assetId: string; url: string; label: string }[] = [];
    for (const card of Object.values(cards)) {
      const main = /^(sku-[a-f0-9]{16})-adopted-main$/.exec(card.id);
      if (main && card.assetId && card.url) rows.push({ assetId: card.assetId, url: card.url, label: card.name.replace(/ · 已采用主图.*$/, '') + ' · ' + t('mainTaskTitle') });
    }
    const latest = new Map<string, CanvasCard>();
    for (const card of Object.values(cards)) {
      if (card.kind === 'output' && card.status === 'succeeded' && card.assetId && card.url && card.sourceConfigCardId && ecommerceTaskPattern.exec(card.sourceConfigCardId)?.[2]?.startsWith('scene')) latest.set(card.sourceConfigCardId, card);
    }
    for (const [taskId, output] of latest) rows.push({ assetId: output.assetId!, url: output.url!, label: cards[taskId]?.name || taskId });
    return rows;
  }, [cards, t]);
  async function reload() {
    try { setDerived((await apiJsonGet<{ derived: Derived[] }>(`/api/demo/ecommerce-resize?projectId=${projectId}`)).derived); } catch { /* the list is optional; errors surface on run */ }
  }
  useEffect(() => { void reload(); }, [projectId]);
  const valid = picked.filter(id => sources.some(row => row.assetId === id));
  async function run() {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await apiJsonPost<{ derived: (Derived & { created: boolean })[] }>('/api/demo/ecommerce-resize', { projectId, assetIds: valid, ratios: targets, mode });
      setNotice(t('resizeDone', { created: result.derived.filter(item => item.created).length, total: result.derived.length }));
      await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('failed')); } finally { setBusy(false); }
  }
  // A source that is no longer the adopted main or the latest scene result is an older version.
  const isCurrent = (assetId: string) => sources.some(row => row.assetId === assetId);
  const taskName = (item: Derived) => item.task === 'main' ? t('mainTaskTitle') : (Object.values(cards).find(card => card.kind === 'generation' && card.id.endsWith(`-${item.task}-image`) && card.name.startsWith(item.sku + ' · '))?.name || item.filename).replace(/^.* · /, '');
  // The list arrives oldest first, so a larger index means a newer result. Each source keeps its newest method on top.
  const groups = useMemo(() => {
    const bySku = new Map<string, Map<string, Map<string, { newest: number; sizes: Derived[] }>>>();
    derived.forEach((item, index) => {
      const skus = bySku.get(item.sku) ?? new Map(), sourcesOfSku = skus.get(item.sourceAssetId) ?? new Map();
      const method = sourcesOfSku.get(item.mode) ?? { newest: index, sizes: [] };
      method.newest = index; method.sizes.push(item);
      sourcesOfSku.set(item.mode, method); skus.set(item.sourceAssetId, sourcesOfSku); bySku.set(item.sku, skus);
    });
    return [...bySku].map(([sku, skus]) => ({ sku, items: [...skus].map(([sourceId, methods]) => {
      const first = derived.find(item => item.sourceAssetId === sourceId)!;
      const ordered = [...methods].map(([mode, value]) => ({ mode, newest: value.newest, sizes: [...value.sizes].sort((x, y) => x.ratio.localeCompare(y.ratio)) })).sort((x, y) => y.newest - x.newest);
      const current = isCurrent(sourceId);
      return { sourceId, current, label: taskName(first) + (current ? '' : t('resizeOldVersion')), methods: ordered };
    }).sort((x, y) => Number(y.current) - Number(x.current)) }));
  }, [derived, sources]);
  const modeLabel = (mode: string) => t(mode === 'crop' ? 'resizeCropShort' : 'resizePadShort');
  const zipName = (sku: string, label: string, size: Derived) => `${sku}_${label}_${size.ratio.replace(':', 'x')}_${size.mode}.png`.replace(/[\\/:*?"<>|]/g, '-');
  async function remove(assetId: string) {
    if (!window.confirm(t('resizeDeleteConfirm'))) return;
    setError('');
    try { await apiJsonDelete('/api/demo/ecommerce-resize', { projectId, assetId }); await reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('failed')); }
  }
  async function downloadAll() {
    setZipping(true); setError('');
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      for (const group of groups) for (const item of group.items) for (const size of item.methods.flatMap(method => method.sizes)) {
        const response = await fetch(size.url);
        if (!response.ok) throw new Error(t('failed'));
        zip.folder(group.sku.replace(/[\\/:*?"<>|]/g, '-'))!.file(zipName(group.sku, item.label, size).slice(group.sku.length + 1), await response.blob());
      }
      const url = URL.createObjectURL(await zip.generateAsync({ type: 'blob' }));
      const link = document.createElement('a'); link.href = url; link.download = 'resized-images.zip'; link.click(); URL.revokeObjectURL(url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('failed')); } finally { setZipping(false); }
  }
  if (!sources.length) return null;
  const toggle = (list: string[], value: string, on: boolean) => on ? [...new Set([...list, value])] : list.filter(item => item !== value);
  return <section aria-label={t('resizeTitle')} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
    <div className="flex items-center justify-between text-xs"><h3>{t('resizeTitle')}</h3><span className="text-[var(--beat-text-3)]">{t('resizeFree')}</span></div>
    <p className="text-[11px] leading-5 text-[var(--beat-text-3)]">{t('resizeHint')}</p>
    <div className="space-y-1">{sources.map(row => <label key={row.assetId} className="flex min-h-12 items-center gap-2 rounded-lg px-2 text-xs hover:bg-white/[0.03]">
      <input type="checkbox" disabled={busy} checked={picked.includes(row.assetId)} onChange={event => setPicked(current => toggle(current, row.assetId, event.target.checked))} />
      <img src={row.url} alt={row.label} className="size-9 shrink-0 rounded bg-white/5 object-contain" />
      <span className="min-w-0 flex-1 truncate">{row.label}</span>
    </label>)}</div>
    <div className="flex flex-wrap items-center gap-3 text-xs">{ratios.map(ratio => <label key={ratio} className="flex min-h-9 items-center gap-1.5"><input type="checkbox" disabled={busy} checked={targets.includes(ratio)} onChange={event => setTargets(current => toggle(current, ratio, event.target.checked))} />{ratio}</label>)}</div>
    <label className="block text-xs">{t('resizeMode')}<select aria-label={t('resizeMode')} disabled={busy} value={mode} onChange={event => setMode(event.target.value as typeof mode)} className="mt-1 min-h-10 w-full rounded border border-white/15 bg-[var(--beat-surface)] px-2 text-xs">
      <option value="auto">{t('resizeAuto')}</option><option value="crop">{t('resizeCrop')}</option><option value="pad">{t('resizePad')}</option></select></label>
    {mode === 'crop' && <p className="text-[11px] leading-5 text-amber-300">{t('resizeCropWarn')}</p>}
    <button type="button" disabled={busy || !valid.length || !targets.length} className="min-h-10 w-full rounded-lg bg-[var(--beat-accent)] px-3 text-xs text-black disabled:opacity-40" onClick={() => void run()}>{busy ? t('taskRunningShort') : t('resizeRun') + ' · ' + valid.length * targets.length}</button>
    {notice && <p role="status" className="text-xs text-green-300">{notice}</p>}
    {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    {derived.length > 0 && <div className="space-y-3 border-t border-white/10 pt-3">
      <div className="flex items-center justify-between text-xs"><h4>{t('resizeResults')} · {derived.length}</h4>
        <button type="button" disabled={busy || zipping} className="min-h-9 text-orange-400 disabled:opacity-40" onClick={() => void downloadAll()}>{zipping ? t('taskRunningShort') : t('resizeDownloadAll')}</button></div>
      {groups.map(group => <div key={group.sku} className="space-y-2"><p className="text-xs">{group.sku}</p>
        {group.items.map(item => {
          const tiles = (method: (typeof item.methods)[number]) => <div key={method.mode} className="space-y-1"><p className="text-[11px] text-[var(--beat-text-3)]">{modeLabel(method.mode)}</p>
            <div className="grid grid-cols-3 gap-2">{method.sizes.map(size => <figure key={size.id} className="space-y-1">
              <a href={size.url} target="_blank" rel="noreferrer"><img src={size.url} alt={item.label + ' ' + size.ratio} className="aspect-square w-full rounded bg-white/5 object-contain" /></a>
              <figcaption className="space-y-0.5 text-[11px]"><span className="block text-[var(--beat-text-3)]">{size.ratio}</span>
                <span className="flex items-center justify-between"><a href={size.url} download={zipName(group.sku, item.label, size)} className="text-orange-400">{t('resizeDownload')}</a>
                <button type="button" disabled={busy} className="text-[var(--beat-text-3)] hover:text-red-300 disabled:opacity-40" onClick={() => void remove(size.id)}>{t('resizeDelete')}</button></span></figcaption>
            </figure>)}</div></div>;
          return <div key={item.sourceId} className="space-y-1"><p className={'truncate text-xs '+(item.current?'text-[var(--beat-text-2)]':'text-[var(--beat-text-3)]')}>{item.label}</p>
            {tiles(item.methods[0])}
            {item.methods.length > 1 && <details><summary className="min-h-9 cursor-pointer py-1 text-[11px] text-[var(--beat-text-3)]">{t('resizeEarlier')} · {item.methods.length - 1} ▾</summary><div className="space-y-2">{item.methods.slice(1).map(tiles)}</div></details>}
          </div>;
        })}
      </div>)}
    </div>}
  </section>;
}
