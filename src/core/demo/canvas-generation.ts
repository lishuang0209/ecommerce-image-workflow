import { ecommerceTag, assertSkuTextContext, pendingEcommercePrompt, ecommerceTaskPattern, preservationPrompt, validateEcommerceInputs } from './ecommerce-contract';
import { skuNodePrefix } from './ecommerce-materials';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getBeatDesignDataRoot } from '@/config/data-root';
import { normalizeAssetFirstGenerationRequest } from '@/core/commands/generation-contract';
import { assertCanvasGenerationSource } from '@/core/organization/generation-source';
import { loadProjectWithLatestSnapshot } from '@/core/projects/projects';
import { resolveCanvasTextReferences } from '@/core/beatcanvas/text-nodes';
import { getProjectAssetById, recordUserAsset, linkGenerationAsset } from '@/core/workspace-lib/assets/user-assets';
import { persistLocalProjectAsset, resolveLocalProjectAssetPath, LOCAL_PROJECT_ASSET_BUCKET } from '@/core/projects/local-project-assets';
import { recordGeneration, updateGenerationById } from '@/core/effects/record-generation';
import { isSupportedRasterImage } from '@/lib/image-upload-validation';
import { getConfig } from '@/modules/config/service';
import { generateBailianImage } from './bailian-image';

const root = () => resolve(getBeatDesignDataRoot(), 'bailian-canvas-intents');
const tokenPath = (token: string) => { if (!/^[a-f0-9-]{36}$/.test(token)) throw new Error('Invalid generation authorization.'); return resolve(root(), `${token}.json`); };
async function save(token: string, value: unknown) { const target = tokenPath(token), temp = `${target}.${randomUUID()}.tmp`; await writeFile(temp, JSON.stringify(value), { mode: 0o600 }); await rename(temp, target); }
type Intent = { promptDigest?: string; digest: string; projectId: string; sourceCardId: string; expires: number; generationId?: string };
let busy = false;
export function isBailianCanvasGeneration(value: unknown) {
  const request = value as { modelId?: string; sourceSurface?: string } | null;
  return request?.modelId === 'qwen-image-2.1' && request.sourceSurface === 'canvas';
}
export async function reviewBailianCanvas(source: unknown) {
  const generation = normalizeAssetFirstGenerationRequest(source);
  if (!isBailianCanvasGeneration(generation) || generation.mode !== 'image' || !generation.sourceCardId) throw new Error('Bailian requires an image generation node.');
  const context = await assertCanvasGenerationSource(generation.projectId, generation.sourceCardId, generation);
  const state = await loadProjectWithLatestSnapshot({ projectId: generation.projectId });
  if (!state) throw new Error('Project is unavailable.');
  const cards = Object.fromEntries(state.snapshot.cards.map(card => [card.id, card]));
  const card = cards[generation.sourceCardId];
  if (!card || card.kind !== 'generation') throw new Error('Generation node is unavailable.');
  let prompt = resolveCanvasTextReferences({ cards, referenceCardIds: card.referenceCardIds, prompt: card.prompt }).resolvedPrompt;
  if (!prompt.trim() || prompt.length > 12000) throw new Error('Prompt must contain 1–12000 characters.');
  if (!generation.references.length || generation.references.length > 10) throw new Error('Connect 1–10 project images before generating.');
  if (!['1:1','4:5','4:3','3:4','3:2','2:3','16:9','9:16'].includes(card.aspectRatio) || card.outputQuality !== '1k') throw new Error('Select an explicit supported aspect ratio and 1k quality.');
  const assets = [];
  for (const ref of generation.references) {
    const asset = await getProjectAssetById({ projectId: generation.projectId, assetId: ref.assetId });
    if (!asset || asset.type !== 'image' || asset.storageProvider !== 'local' || asset.bucket !== LOCAL_PROJECT_ASSET_BUCKET) throw new Error('Every image reference must belong to this local project.');
    assets.push(asset);
  }
  const skuTask = ecommerceTaskPattern.exec(card.id);
  let ecommerceOutput: {sku:string;task:string;ratio:string;preserve:string;color:string}|undefined;
  if (skuTask) {
    const inputs=validateEcommerceInputs({prefix:skuTask[1],task:skuTask[2],references:card.referenceCardIds,cards,assets});
    if(skuNodePrefix(inputs.sku)!==skuTask[1])throw new Error('Connect the product identity for this SKU.');
    const constraints=preservationPrompt(inputs.tags);
    const scene=skuTask[2]==='scene-office'?'办公桌面':skuTask[2]==='scene-outdoor'?'户外森林':'';
    const instructions=skuTask[2]==='main'
      ? '任务约束：纯白背景，完整商品居中正面，柔和影棚光。商品颜色、Logo、文字、结构只以本 SKU 实拍参考为准。'+(inputs.hasMaster?'另一 SKU 母版只提供构图、角度、光影，不得复制它的颜色、Logo 或商品身份。':'')
      : '任务约束：'+(scene?'场景为'+scene+'，':'')+'自然光，浅景深。商品主体以已采用主图为准，保持其颜色、Logo、文字和结构；风格参考只提供背景氛围。';
    const referenceRoles=assets.map((asset,index)=>{
      const tag=ecommerceTag(asset.metadata);
      const master=cards[skuTask[1]+'-master-reference'];
      return '参考图'+(index+1)+'：'+(master?.assetId===asset.id?'构图母版；只参考构图、角度、光影，禁止继承商品颜色与身份':skuTask[2]!=='main'&&cards[skuTask[1]+'-adopted-main']?.assetId===asset.id?'已采用主图；商品主体身份依据':tag?.role==='style'?'背景风格参考；不作为商品身份依据':'当前 SKU 商品实拍；保留颜色、Logo、文字及结构');
    }).join('\n');
    prompt=[prompt,constraints,instructions,referenceRoles].filter(Boolean).join('\n');
    if(prompt.length>12000)throw new Error('Combined product information exceeds 12000 characters.');
    ecommerceOutput={sku:inputs.sku,task:skuTask[2],ratio:card.aspectRatio,preserve:[...new Set(inputs.tags.map(tag=>tag?.preserve).filter(Boolean))].join('；'),color:inputs.tags.find(tag=>tag?.color)?.color||''};
    const text = cards[`${skuTask[1]}-${skuTask[2]}-prompt`];
    if (text?.kind !== 'text' || !card.referenceCardIds.includes(text.id) || text.textContent === pendingEcommercePrompt) throw new Error('Review and adopt the task prompt before generating images.');
    assertSkuTextContext(skuTask[1], text.referenceCardIds);
  }
  if (!(await getConfig('BAILIAN_API_KEY'))) throw new Error('Save your Bailian API key first.');
  return { generation, context, prompt, assets, ratio: card.aspectRatio, ecommerceOutput };
}
export async function createBailianCanvasIntent(source: unknown) {
  const reviewed = await reviewBailianCanvas(source);
  const token = randomUUID(); await mkdir(root(), { recursive: true, mode: 0o700 });
  await save(token, { promptDigest: createHash('sha256').update(reviewed.prompt).digest('hex'), digest: reviewed.context.sourceContextDigest, projectId: reviewed.generation.projectId, sourceCardId: reviewed.generation.sourceCardId, expires: Date.now() + 600000 });
  return token;
}
export async function submitBailianCanvas(source: unknown, token: string) {
  const intent = JSON.parse(await readFile(tokenPath(token), 'utf8')) as Intent;
  const generation = normalizeAssetFirstGenerationRequest(source);
  if (generation.projectId !== intent.projectId || generation.sourceCardId !== intent.sourceCardId) throw new Error('Generation authorization does not match the source.');
  if (intent.generationId) return { status: 'processing', wmTaskId: intent.generationId };
  if (intent.expires < Date.now()) throw new Error('Generation authorization expired. Review the node again.');
  if (busy) throw new Error('An image is already generating. Wait before submitting.');
  busy = true;
  let id: string | null = null;
  try {
    const reviewed = await reviewBailianCanvas(source);
    if (reviewed.context.sourceContextDigest !== intent.digest || createHash('sha256').update(reviewed.prompt).digest('hex') !== intent.promptDigest) throw new Error('Connected inputs changed. Review the node again.');
    const references = [];
    for (const asset of reviewed.assets) {
      const bytes = await readFile(resolveLocalProjectAssetPath({ objectKey: asset.objectKey }));
      if (bytes.length > 10 * 1024 * 1024 || !isSupportedRasterImage(asset.mimeType || '', bytes)) throw new Error('Invalid reference image.');
      references.push({ bytes, mimeType: asset.mimeType! });
    }
    // An atomic claim prevents a token replay from starting a second paid request.
    const claim = await open(`${tokenPath(token)}.claim`, 'wx', 0o600).catch(() => { throw new Error('Submission already claimed; check generation history.'); }); await claim.close();
    id = await recordGeneration({ projectId: intent.projectId, effectId: 37, status: 'processing', input: { provider: 'bailian', model: 'qwen-image-2.1-turbo', prompt: reviewed.prompt, generation, sourceContextDigest: intent.digest } });
    if (!id) throw new Error('Unable to persist generation.');
    intent.generationId = id; await save(token, intent);
    for (const asset of reviewed.assets) await linkGenerationAsset({ generationId: id, assetId: asset.id, role: 'input' });
    const generationId = id;
    void (async () => {
      try {
        const output = await generateBailianImage({ references, prompt: reviewed.prompt, ratio: reviewed.ratio, quality: '1k' });
        const persisted = await persistLocalProjectAsset({ projectId: intent.projectId, filename: reviewed.ecommerceOutput ? `${reviewed.ecommerceOutput.sku}-${reviewed.ecommerceOutput.task}-${reviewed.ratio.replace(':','x')}-${generationId}.png` : `bailian-${generationId}.png`, mimeType: 'image/png', bytes: output.bytes });
        await recordUserAsset({ id: persisted.assetId, type: 'image', source: 'provider', storageProvider: 'local', bucket: LOCAL_PROJECT_ASSET_BUCKET, objectKey: persisted.objectKey, publicUrl: persisted.publicUrl, filename: persisted.filename, mimeType: 'image/png', sizeBytes: persisted.sizeBytes, sha256: persisted.sha256, originProjectId: intent.projectId, metadata: { provider: 'bailian', requestId: output.requestId, sourceCardId: intent.sourceCardId, ...(reviewed.ecommerceOutput ? { ecommerce: {sku:reviewed.ecommerceOutput.sku,role:'product',preserve:reviewed.ecommerceOutput.preserve,color:reviewed.ecommerceOutput.color}, ecommerceOutput:reviewed.ecommerceOutput } : {}) } });
        await linkGenerationAsset({ generationId, assetId: persisted.assetId, role: 'output' });
        await updateGenerationById({ id: generationId, status: 'succeeded', output: { resultUrl: persisted.publicUrl, stored_result_url: persisted.publicUrl, assetId: persisted.assetId, provider: 'bailian', usage: output.usage } });
      } catch (error) { await updateGenerationById({ id: generationId, status: 'failed', error: error instanceof Error ? error.message : 'Bailian generation failed.' }); }
      finally { busy = false; }
    })();
    return { status: 'processing', wmTaskId: id };
  } catch (error) { if (id) await updateGenerationById({ id, status: 'failed', error: error instanceof Error ? error.message : 'Generation failed.' }); busy = false; throw error; }
}
