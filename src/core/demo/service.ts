import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile, rename, lstat } from 'node:fs/promises';
import { resolve, join, relative, extname, basename } from 'node:path';
import { getBeatDesignDataRoot } from '@/config/data-root';
import { buildTextCard } from '@/core/beatcanvas/text-nodes';
import { createProject, loadProjectWithLatestSnapshot, getActiveProject } from '@/core/projects/projects';
import { createEmptyProjectSnapshot } from '@/core/projects/project-snapshot';
import { persistBeatDesignCommand } from '@/core/commands/persist';
import { persistLocalProjectAsset, LOCAL_PROJECT_ASSET_BUCKET } from '@/core/projects/local-project-assets';
import { recordUserAsset, linkProjectAsset } from '@/core/workspace-lib/assets/user-assets';
import { isSupportedRasterImage } from '@/lib/image-upload-validation';
import { buildDemoSteps, type DemoInput, type DemoPlan } from './workflow-plan';

const planRoot = () => resolve(getBeatDesignDataRoot(), 'demo-plans');
const inputRoot = () => resolve(process.cwd(), '../../..', 'inputs');
const mediaTypes: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
export const locks = new Set<string>();

export async function listDemoInputs(kind: DemoInput['kind']) {
  const root = join(inputRoot(), kind);
  const files: { source: string; filename: string; subject: string; bytes: number }[] = [];
  async function scan(directory: string, depth: number) {
    const info = await lstat(directory).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
    if (!info) return;
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('Input directories must be ordinary local folders.');
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || entry.name.startsWith('.')) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory() && depth < 1) await scan(path, depth + 1);
      if (entry.isFile() && mediaTypes[extname(entry.name).toLowerCase()]) {
        const stat = await lstat(path);
        if (stat.size > 10 * 1024 * 1024) continue;
        files.push({ source: relative(root, path), filename: entry.name, subject: depth ? basename(directory) : '', bytes: stat.size });
        if (files.length > 100) throw new Error('Use at most 100 input images for this demo.');
      }
    }
  }
  await scan(root, 0);
  return { directory: root, files: files.sort((a, b) => a.source.localeCompare(b.source, undefined, { numeric: true })) };
}

function planPath(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid demo plan ID.');
  return join(planRoot(), `${id}.json`);
}
export async function savePlan(plan: DemoPlan) {
  await mkdir(planRoot(), { recursive: true });
  const target = planPath(plan.id);
  const temp = `${target}.${randomUUID()}.tmp`;
  const { steps: _steps, ...stored } = plan;
  await writeFile(temp, JSON.stringify(stored, null, 2), { flag: 'wx', mode: 0o600 });
  await rename(temp, target);
}
export async function getDemoPlan(id: string): Promise<DemoPlan> {
  const plan = JSON.parse(await readFile(planPath(id), 'utf8')) as DemoPlan;
  if (!(await getActiveProject({ projectId: plan.projectId }))) throw new Error('Project is unavailable.');
  const state = await loadProjectWithLatestSnapshot({ projectId: plan.projectId });
  plan.steps = buildDemoSteps(plan.input).flatMap(step => {
    const card = state?.snapshot.cards.find(card => card.id === `demo-${step.id}`);
    return card?.kind === 'text' ? [{ ...step, title: card.name, prompt: card.textContent }] : [];
  });
  return plan;
}
export async function listDemoPlans() {
  const entries = await readdir(planRoot()).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return []; throw error; });
  const plans: DemoPlan[] = [];
  for (const name of entries.filter(name => /^[a-f0-9-]{36}\.json$/.test(name))) {
    const plan = await getDemoPlan(name.slice(0, -5)).catch(() => null);
    if (plan) plans.push(plan);
  }
  return plans.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function createDemoPlan(input: DemoInput): Promise<DemoPlan> {
  const document = createEmptyProjectSnapshot();
  document.cards = buildDemoSteps(input).map((step, index) => {
    document.frames[`demo-${step.id}`] = { x: 100 + index % 3 * 440, y: 120 + Math.floor(index / 3) * 380, w: 400, h: 320 };
    return buildTextCard({ id: `demo-${step.id}`, name: step.title, textContent: step.prompt, textRole: input.kind === 'drama' ? 'storyboard' : 'note' });
  });
  const project = await createProject({ name: input.name, workspaceMode: 'canvas', initialSnapshot: document });
  const now = new Date().toISOString();
  const plan: DemoPlan = { id: randomUUID(), projectId: project.id, input, assets: [], createdAt: now, updatedAt: now, revision: 1 };
  await savePlan(plan);
  return plan;
}

export async function importDemoInputs(id: string, expectedRevision: number) {
  if (locks.has(id)) throw new Error('This plan is already importing. Please wait.');
  locks.add(id);
  try {
    const plan = await getDemoPlan(id);
    if (plan.revision !== expectedRevision) throw new Error('Plan changed. Reload before importing.');
    const { directory, files } = await listDemoInputs(plan.input.kind);
    const known = new Set(plan.assets.map(asset => `${asset.source}:${asset.sha256}`));
    for (const source of files) {
      // Recheck each component before reading so a symlink swap cannot escape the input folder.
      let current = directory;
      for (const part of source.source.split(/[\\/]/)) {
        current = join(current, part);
        if ((await lstat(current)).isSymbolicLink()) throw new Error('Symbolic links are not supported.');
      }
      const bytes = await readFile(current);
      if (bytes.length > 10 * 1024 * 1024) throw new Error('Image exceeds 10 MB.');
      const mimeType = mediaTypes[extname(source.filename).toLowerCase()];
      if (!isSupportedRasterImage(mimeType, bytes)) throw new Error(`Invalid image: ${source.filename}`);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const identity = `${source.source}:${sha256}`;
      if (known.has(identity)) continue;
      const persisted = await persistLocalProjectAsset({ projectId: plan.projectId, filename: source.filename, mimeType, bytes });
      await recordUserAsset({ id: persisted.assetId, type: 'image', source: 'upload', storageProvider: 'local', bucket: LOCAL_PROJECT_ASSET_BUCKET, objectKey: persisted.objectKey, publicUrl: persisted.publicUrl, filename: persisted.filename, mimeType, sizeBytes: persisted.sizeBytes, sha256, originProjectId: plan.projectId, assetClass: 'original' });
      await linkProjectAsset({ projectId: plan.projectId, assetId: persisted.assetId, role: 'upload' });
      const cardId = `demo-asset-${persisted.assetId}`;
      const state = await loadProjectWithLatestSnapshot({ projectId: plan.projectId });
      if (!state) throw new Error('Project is unavailable.');
      const commandId = randomUUID();
      const result = await persistBeatDesignCommand({ projectId: plan.projectId, origin: 'ui', commandId, idempotencyKey: commandId, expectedRevision: state.snapshotVersion, command: { type: 'canvas.apply', operations: [{ type: 'upsert_card', card: { ...buildTextCard({ id: cardId, name: source.filename }), kind: 'asset', type: 'image', assetId: persisted.assetId, url: persisted.publicUrl, status: 'succeeded' }, frame: { x: -380, y: 100 + plan.assets.length * 300, w: 320, h: 260 } }] } });
      if (!result.ok) throw new Error(result.message);
      plan.assets.push({ id: persisted.assetId, cardId, filename: source.filename, source: source.source, subject: source.subject, sha256, url: persisted.publicUrl });
      known.add(identity);
      // Checkpoint each imported file; a failed later file does not duplicate prior imports on retry.
      plan.updatedAt = new Date().toISOString();
      await savePlan(plan);
    }
    plan.revision++;
    plan.updatedAt = new Date().toISOString();
    await savePlan(plan);
    return plan;
  } finally { locks.delete(id); }
}
