import { ecommerceTaskPattern, sceneDescriptionForTask } from './ecommerce-contract';

/**
 * Side-by-side delivery view for one product. Columns are its SKUs. The first row is the adopted
 * listing image; later rows are scenes aligned by their description, so differently worded scenes
 * stay on separate rows. Only the latest successful scene output is the deliverable. Nothing here
 * calls a model.
 */
export type DeliveryCard = {
  id: string;
  kind: string;
  name?: string;
  assetId?: string | null;
  url?: string | null;
  status?: string;
  sourceConfigCardId?: string | null;
  textContent?: string;
  aspectRatio?: string;
};

export type DeliveryColumn = { sku: string; prefix: string; product: string };

export type DeliveryCell = {
  sku: string;
  ratio: string;
  url?: string;
  assetId?: string;
  missing: boolean;
};

export type DeliveryRow = {
  key: string;
  kind: 'main' | 'scene';
  scene: string;
  cells: DeliveryCell[];
};

export type DeliveryMatrix = {
  product: string;
  columns: DeliveryColumn[];
  rows: DeliveryRow[];
};

export type DeliveryResize = { id: string; url: string; sourceAssetId: string; ratio: string; mode: string };

export type DeliveryFile = {
  product: string;
  sku: string;
  kind: 'main' | 'scene';
  scene: string;
  ratio: string;
  method: 'original' | 'crop' | 'pad' | 'expand';
  url: string;
  assetId: string;
  /** Path inside the zip, relative to the product folder (or the zip root when the product has no name). */
  relativePath: string;
  path: string;
};

const methodLabel = { original: '原图', crop: '居中裁剪', pad: '留白补边', expand: '扩图' } as const;

export function safeDeliverySegment(value: string) {
  const cleaned = value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80);
  return cleaned || 'item';
}

function sceneLabel(task: DeliveryCard, sku: string, cards: Record<string, DeliveryCard>) {
  const named = task.name?.startsWith(`${sku} · `) ? task.name.slice(sku.length + 3) : task.name;
  return (sceneDescriptionForTask(task.id, cards) || named || '').trim();
}

function cell(sku: string, ratio: string, url?: string | null, assetId?: string | null): DeliveryCell {
  return url && assetId ? { sku, ratio, url, assetId, missing: false } : { sku, ratio, missing: true };
}

export function buildDeliveryMatrix(columns: DeliveryColumn[], cards: Record<string, DeliveryCard>): DeliveryMatrix {
  const product = columns.find(column => column.product.trim())?.product.trim() || '';
  const latest = new Map<string, DeliveryCard>();
  for (const card of Object.values(cards)) {
    const task = card.sourceConfigCardId ? ecommerceTaskPattern.exec(card.sourceConfigCardId) : null;
    if (card.kind === 'output' && card.status === 'succeeded' && card.assetId && card.url && task && task[2] !== 'main') latest.set(card.sourceConfigCardId!, card);
  }
  const main: DeliveryRow = {
    key: 'main',
    kind: 'main',
    scene: '',
    cells: columns.map(column => {
      const adopted = cards[`${column.prefix}-adopted-main`];
      return cell(column.sku, adopted?.aspectRatio?.trim() || '1:1', adopted?.url, adopted?.assetId);
    }),
  };
  const sceneRows: { key: string; scene: string; bySku: Map<string, DeliveryCell> }[] = [];
  for (const column of columns) {
    const tasks = Object.values(cards).filter(card => card.kind === 'generation' && card.id.startsWith(`${column.prefix}-scene-`) && card.id.endsWith('-image'));
    for (const task of tasks) {
      const scene = sceneLabel(task, column.sku, cards);
      if (!scene) continue;
      let row = sceneRows.find(item => item.scene === scene && !item.bySku.has(column.sku));
      if (!row) {
        const duplicate = sceneRows.some(item => item.scene === scene);
        row = { key: duplicate ? `${scene}#${task.id}` : scene, scene, bySku: new Map() };
        sceneRows.push(row);
      }
      const output = latest.get(task.id);
      row.bySku.set(column.sku, cell(column.sku, output?.aspectRatio?.trim() || task.aspectRatio?.trim() || '4:5', output?.url, output?.assetId));
    }
  }
  const rows = [main, ...sceneRows.map(row => ({
    key: row.key,
    kind: 'scene' as const,
    scene: row.scene,
    cells: columns.map(column => row.bySku.get(column.sku) || cell(column.sku, '4:5')),
  }))];
  return { product, columns, rows };
}

function csvField(value: string) {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function uniqueFilename(used: Set<string>, folder: string, filename: string) {
  const dot = filename.lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const extension = dot > 0 ? filename.slice(dot) : '';
  let name = filename;
  let count = 2;
  while (used.has(`${folder}/${name}`)) {
    name = `${stem}-${count}${extension}`;
    count += 1;
  }
  used.add(`${folder}/${name}`);
  return name;
}

function fileBase(kind: 'main' | 'scene', scene: string, ratio: string, method: DeliveryFile['method']) {
  const head = kind === 'main' ? '主图' : safeDeliverySegment(scene);
  const parts = [head, ratio.replace(':', 'x')];
  if (method !== 'original') parts.push(methodLabel[method]);
  return `${parts.join('_')}.png`;
}

/** Files for the current cells, plus resized copies of those same assets when `resized` is non-empty. */
export function deliveryPackage(matrix: DeliveryMatrix, resized: DeliveryResize[] = []) {
  const productFolder = matrix.product ? safeDeliverySegment(matrix.product) : '';
  const used = new Set<string>();
  const files: DeliveryFile[] = [];
  const add = (entry: Omit<DeliveryFile, 'relativePath' | 'path' | 'product'> & { sku: string }) => {
    const skuFolder = safeDeliverySegment(entry.sku);
    const folder = productFolder ? `${productFolder}/${skuFolder}` : skuFolder;
    const filename = uniqueFilename(used, folder, fileBase(entry.kind, entry.scene, entry.ratio, entry.method));
    const relativePath = `${skuFolder}/${filename}`;
    files.push({ ...entry, product: matrix.product, relativePath, path: productFolder ? `${productFolder}/${relativePath}` : relativePath });
  };
  for (const row of matrix.rows) {
    for (const item of row.cells) {
      if (item.missing || !item.url || !item.assetId) continue;
      add({ sku: item.sku, kind: row.kind, scene: row.scene, ratio: item.ratio, method: 'original', url: item.url, assetId: item.assetId });
      const extras = new Map<string, DeliveryResize & { mode: 'crop' | 'pad' | 'expand' }>();
      for (const copy of resized) {
        if (copy.sourceAssetId === item.assetId && copy.url && (copy.mode === 'crop' || copy.mode === 'pad' || copy.mode === 'expand')) extras.set(`${copy.ratio}:${copy.mode}`, { ...copy, mode: copy.mode });
      }
      for (const copy of extras.values()) add({ sku: item.sku, kind: row.kind, scene: row.scene, ratio: copy.ratio, method: copy.mode, url: copy.url, assetId: copy.id });
    }
  }
  const header = ['商品', 'SKU', '类型', '场景名', '画幅', '处理方式', '文件名'];
  const lines = files.map(file => [file.product, file.sku, file.kind === 'main' ? '主图' : '场景', file.scene, file.ratio, methodLabel[file.method], file.relativePath].map(csvField).join(','));
  return { files, csv: `\uFEFF${[header.join(','), ...lines].join('\n')}\n`, csvPath: productFolder ? `${productFolder}/清单.csv` : '清单.csv' };
}
