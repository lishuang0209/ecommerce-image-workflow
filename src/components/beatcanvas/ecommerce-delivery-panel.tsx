import { useEffect, useState } from 'react';
import type { CanvasCard } from '@/core/beatcanvas/canvas-types';
import { apiJsonGet } from '@/lib/api-client';
import { useTranslations } from '@/core/workspace-lib/shims/next-intl';
import { buildDeliveryMatrix, deliveryPackage, safeDeliverySegment, type DeliveryColumn, type DeliveryResize } from '@/core/demo/ecommerce-delivery';
import { skuLabel } from './ecommerce-material-library';

/** Current finished images for one product, compared by SKU and downloaded with a manifest. No model call. */
export function EcommerceDeliveryPanel({ projectId, cards, skus, activeSku }: { projectId: string; cards: Record<string, CanvasCard>; skus: DeliveryColumn[]; activeSku: string }) {
  const t = useTranslations('AppShell.studio.ecommerce');
  const [includeResized, setIncludeResized] = useState(false);
  const [derived, setDerived] = useState<DeliveryResize[]>([]);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const current = skus.find(item => item.sku === activeSku);
  const product = current?.product.trim() || '';
  const columns = skus.filter(item => item.prefix && (product ? item.product === product : item.sku === activeSku));
  const matrix = buildDeliveryMatrix(columns, cards);
  const ready = matrix.rows.some(row => row.kind === 'scene' || row.cells.some(cell => !cell.missing));
  const pack = deliveryPackage(matrix, includeResized ? derived : []);
  const chosen = matrix.rows.flatMap(row => row.cells.map(cell => ({ row, cell }))).find(item => `${item.row.key}:${item.cell.sku}` === selected && !item.cell.missing);
  useEffect(() => { void apiJsonGet<{ derived: DeliveryResize[] }>(`/api/demo/ecommerce-resize?projectId=${projectId}`).then(result => setDerived(result.derived)).catch(() => undefined); }, [projectId]);
  async function download() {
    setBusy(true); setError('');
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      for (const file of pack.files) {
        const response = await fetch(file.url);
        if (!response.ok) throw new Error(t('failed'));
        zip.file(file.path, await response.blob());
      }
      zip.file(pack.csvPath, pack.csv);
      const url = URL.createObjectURL(await zip.generateAsync({ type: 'blob' }));
      const link = document.createElement('a'); link.href = url; link.download = `${safeDeliverySegment(matrix.product || columns[0]?.sku || 'delivery')}.zip`; link.click();
      URL.revokeObjectURL(url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('failed')); }
    finally { setBusy(false); }
  }
  if (!columns.length) return null;
  return <section aria-label={t('deliveryTitle')} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
    <div className="flex items-center justify-between text-xs"><h3>{t('deliveryTitle')}</h3><span className="text-[var(--beat-text-3)]">{t('deliveryFree')}</span></div>
    <p className="text-[11px] leading-5 text-[var(--beat-text-3)]">{t('deliveryHint')}</p>
    {!ready ? <p className="text-xs text-[var(--beat-text-3)]">{t('deliveryEmpty')}</p> : <>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-1 text-xs">
          <thead><tr><th className="w-16" />{columns.map(column => <th key={column.sku} className="max-w-28 truncate px-1 text-left font-normal text-[var(--beat-text-2)]" title={skuLabel(column)}>{skuLabel(column)}</th>)}</tr></thead>
          <tbody>{matrix.rows.map(row => <tr key={row.key}>
            <th scope="row" className="max-w-20 truncate pr-1 text-left font-normal text-[var(--beat-text-3)]" title={row.kind === 'main' ? t('deliveryMain') : row.scene}>{row.kind === 'main' ? t('deliveryMain') : row.scene}</th>
            {row.cells.map(cell => {
              const key = `${row.key}:${cell.sku}`;
              const label = `${skuLabel(columns.find(column => column.sku === cell.sku) || { sku: cell.sku })} · ${row.kind === 'main' ? t('deliveryMain') : row.scene || t('sceneTaskTitle')}`;
              return <td key={cell.sku}>{cell.missing ? <span className="flex h-16 items-center text-[11px] text-[var(--beat-text-3)]">{t('deliveryMissing')}</span> : <button type="button" aria-pressed={selected === key} aria-label={`${t('deliveryView')} ${label}`} className={'block overflow-hidden rounded-lg border ' + (selected === key ? 'border-orange-400' : 'border-white/10')} onClick={() => setSelected(current => current === key ? '' : key)}><img src={cell.url} alt={label} className="size-16 bg-white object-contain" /><span className="block py-0.5 text-[10px] text-[var(--beat-text-3)]">{cell.ratio}</span></button>}</td>;
            })}
          </tr>)}</tbody>
        </table>
      </div>
      {chosen?.cell.url && <figure className="space-y-2"><img src={chosen.cell.url} alt={chosen.row.kind === 'main' ? t('deliveryMain') : chosen.row.scene} className="max-h-80 w-full rounded-lg bg-white object-contain" /><figcaption className="flex items-center justify-between text-[11px] text-[var(--beat-text-3)]"><span>{chosen.cell.sku} · {chosen.row.kind === 'main' ? t('deliveryMain') : chosen.row.scene} · {chosen.cell.ratio}</span><a className="text-orange-400" href={chosen.cell.url} target="_blank" rel="noreferrer">{t('viewImage')}</a></figcaption></figure>}
      <label className="flex min-h-10 items-center gap-2 text-xs"><input type="checkbox" checked={includeResized} onChange={event => setIncludeResized(event.target.checked)} />{t('deliveryIncludeResized')}</label>
      <button type="button" disabled={busy || !pack.files.length} className="min-h-10 w-full rounded-lg border border-white/20 text-xs disabled:opacity-40" onClick={() => void download()}>{busy ? t('taskRunningShort') : t('deliveryDownload')}</button>
    </>}
    {error && <p role="alert" className="text-xs leading-6 text-red-300">{error}</p>}
  </section>;
}
