import { sceneDescriptionForTask, ecommerceTag, isEcommerceTaskPromptReady, assertSkuTextContext, ecommerceTaskPattern, preservationPrompt, validateEcommerceInputs, productReferenceRole, productReferenceRank, isCompleteCompositionTemplate, compositionImageDirective, parseCompositionTemplate } from './ecommerce-contract';
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
import { releaseImageGeneration, reserveImageGeneration } from './image-generation-slots';

const root = () => resolve(getBeatDesignDataRoot(), 'bailian-canvas-intents');
const tokenPath = (token: string) => { if (!/^[a-f0-9-]{36}$/.test(token)) throw new Error('Invalid generation authorization.'); return resolve(root(), `${token}.json`); };
async function save(token: string, value: unknown) { const target = tokenPath(token), temp = `${target}.${randomUUID()}.tmp`; await writeFile(temp, JSON.stringify(value), { mode: 0o600 }); await rename(temp, target); }
type Intent = { promptDigest?: string; digest: string; projectId: string; sourceCardId: string; expires: number; generationId?: string };
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
    const template=cards[skuTask[1]+'-composition-template'];
    const usesTemplate=skuTask[2]==='main'&&card.referenceCardIds.includes(skuTask[1]+'-composition-template');
    if(usesTemplate&&(template?.kind!=='text'||!isCompleteCompositionTemplate(template.textContent)))throw new Error('Complete the composition template (count, facing and size) before generating.');
    // A reused composition must carry explicit pose rules; the master image alone is only a suggestion to the model.
    if(skuTask[2]==='main'&&inputs.hasMaster&&!usesTemplate)throw new Error('Set the composition template (count, facing and size) before generating with a reused composition.');
    const parsedTemplate=template?.kind==='text'?parseCompositionTemplate(template.textContent):{};
    const directive=usesTemplate&&parsedTemplate.count&&parsedTemplate.facing&&parsedTemplate.scale?compositionImageDirective({count:parsedTemplate.count,facing:parsedTemplate.facing,scale:parsedTemplate.scale}):'';
    const constraints=preservationPrompt(inputs.tags);
    const scene=skuTask[2]==='main'?'':sceneDescriptionForTask(card.id,cards);
    const instructions=skuTask[2]==='main'
      ? '任务约束：纯白背景，完整商品，柔和影棚光。商品颜色、Logo、文字、结构只以本 SKU 实拍参考为准。'+(usesTemplate?'数量、朝向和主体大小只按硬性构图执行，参考图里的一双鞋、正面或相反朝向都不能沿用。':'')+(inputs.hasMaster?(usesTemplate?'母版只参考光影和画面位置，禁止沿用母版的商品数量和朝向，禁止继承其颜色、Logo或身份。禁止镜像翻转。':'构图优先以母版图为准，沿用其商品数量、朝向、拍摄视角、主体大小、画面位置和光影。禁止镜像翻转，禁止擅自改成正面或另一侧。母版不提供商品颜色、Logo或身份。即使文本描述与母版视角不同，也以母版姿态为准。'):(usesTemplate?'':'摆放、视角和构图以已采用提示词的构图要求为准；')+'不要照搬任何一张参考图的拍摄角度、朝向或背景。')
      : '任务约束：'+(scene?'场景为'+scene+'，':'')+'背景必须按场景要求完整重绘，禁止输出白底、纯色或棚拍背景，禁止沿用已采用主图的背景。环境、光线与景深按用户场景要求和已采用提示词执行，不默认套用办公或森林环境。已采用主图只用于确定商品外观，保持其颜色、Logo、文字和结构；风格参考只提供背景氛围。';
    const masterCard=cards[skuTask[1]+'-master-reference'];
    // Main images: whole-product photos lead, details and scene photos follow; the master (if any) stays last as before.
    if(skuTask[2]==='main')assets.sort((a,b)=>(masterCard?.assetId===a.id?4:productReferenceRank(ecommerceTag(a.metadata)))-(masterCard?.assetId===b.id?4:productReferenceRank(ecommerceTag(b.metadata))));
    const referenceRoles=assets.map((asset,index)=>{
      const tag=ecommerceTag(asset.metadata);
      const master=masterCard;
      const role=master?.assetId===asset.id?(usesTemplate?'构图母版；只参考光影和画面位置，数量和朝向必须按硬性构图，禁止继承商品颜色与身份':'构图母版；只参考构图、角度、光影，禁止继承商品颜色与身份'):skuTask[2]!=='main'&&cards[skuTask[1]+'-adopted-main']?.assetId===asset.id?'已采用主图；商品主体身份依据':tag?.role==='style'?'背景风格参考；不作为商品身份依据':productReferenceRole(tag)+(usesTemplate?'；禁止作为商品数量或朝向的依据':'');
      return '参考图'+(index+1)+'：'+role;
    }).join('\n');
    // The card's ratio is what the provider renders; a stale ratio in the prompt text must not contradict it.
    prompt=[directive,prompt,constraints,instructions,referenceRoles,directive].filter(Boolean).join('\n').replace(/输出画幅：[0-9]+:[0-9]+/g,'输出画幅：'+card.aspectRatio);
    if(prompt.length>12000)throw new Error('Combined product information exceeds 12000 characters.');
    ecommerceOutput={sku:inputs.sku,task:skuTask[2],ratio:card.aspectRatio,preserve:[...new Set(inputs.tags.map(tag=>tag?.preserve).filter(Boolean))].join('；'),color:inputs.tags.find(tag=>tag?.color)?.color||''};
    const text = cards[`${skuTask[1]}-${skuTask[2]}-prompt`];
    if (!isEcommerceTaskPromptReady(card,cards)) throw new Error('Review and adopt the task prompt before generating images.');
    assertSkuTextContext(skuTask[1], text!.referenceCardIds);
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
  if (!reserveImageGeneration()) throw new Error('Two images are already generating. Wait before submitting another.');
  let id: string | null = null;
  let slotHeld = true;
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
      finally { releaseImageGeneration(); }
    })();
    slotHeld = false;
    return { status: 'processing', wmTaskId: id };
  } catch (error) { if (slotHeld) releaseImageGeneration(); if (id) await updateGenerationById({ id, status: 'failed', error: error instanceof Error ? error.message : 'Generation failed.' }); throw error; }
}
