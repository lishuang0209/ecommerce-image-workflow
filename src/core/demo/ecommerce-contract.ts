import { z } from 'zod';
export const ecommerceTagSchema = z.object({
 sku: z.string().trim().min(1).max(100),
 product: z.string().trim().max(100).optional(),
 role: z.enum(['product','detail','style']),
 shot: z.enum(['front','detail','scene']).optional(),
 preserve: z.string().trim().max(1000).optional(),
 color: z.string().trim().max(100).optional(),
}).strict();
export type EcommerceTag = z.infer<typeof ecommerceTagSchema>;
export const pendingEcommercePrompt = '请先根据连接的商品信息生成并采用本任务提示词，或手动填写完整提示词，再执行图片生成。';
export function ecommerceTag(metadata: unknown): EcommerceTag | null {
 const parsed = ecommerceTagSchema.safeParse((metadata as { ecommerce?: unknown } | null)?.ecommerce);
 return parsed.success ? parsed.data : null;
}
export const ecommerceTaskPattern = /^(sku-[a-f0-9]{16})-(main|scene(?:-[a-z0-9]+)?)-image$/;
export const ecommercePromptPattern=/^(sku-[a-f0-9]{16})-(main|scene(?:-[a-z0-9]+)?)-prompt$/;
export function sceneDescriptionForTask(taskId:string,cards:Record<string,{textContent?:string}>){
 const brief=cards[taskId.replace(/-image$/,'-brief')]?.textContent?.trim();
 if(brief)return brief;
 // Existing demo tasks keep their original meaning until explicitly edited.
 return taskId.endsWith('-scene-office-image')?'办公桌面':taskId.endsWith('-scene-outdoor-image')?'户外森林':'';
}
export function preservationPrompt(tags: (EcommerceTag|null)[]) {
 return [...new Set(tags.filter((tag): tag is EcommerceTag=>!!tag&&tag.role!=='style').map(tag=>[
  tag.product?`商品：${tag.product}`:'', `SKU：${tag.sku}`, tag.color?`确认颜色：${tag.color}`:'', tag.preserve?`必须保留：${tag.preserve}`:'',
 ].filter(Boolean).join('；')))].join('\n');
}
/**
 * How one of the SKU's own photos should be used. Detail and scene photos prove appearance only: they must never
 * decide the overall view, composition or background, otherwise the model copies whichever photo is listed first.
 */
export function productReferenceRole(tag: EcommerceTag | null) {
 if (tag?.role === 'detail' || tag?.shot === 'detail') return '局部细节图；只用于确认材质、纹理、结构和Logo，禁止作为整体视角、构图或摆放依据';
 if (tag?.shot === 'scene') return '实拍场景图；只用于确认商品外观，禁止沿用其背景、环境和拍摄角度';
 if (tag?.shot === 'front') return '正面实拍；用于确认颜色、Logo、文字及整体结构';
 return '当前 SKU 商品实拍；用于确认颜色、Logo、文字及结构，不沿用其拍摄角度或背景';
}
/** Whole-product views first, local details and scene photos last, so a detail close-up is never reference 1. */
export function productReferenceRank(tag: EcommerceTag | null) {
 if (tag?.role === 'detail' || tag?.shot === 'detail') return 2;
 if (tag?.shot === 'scene') return 3;
 return tag?.shot === 'front' ? 0 : 1;
}
export function assertSkuReferences(expectedSku: string, task: 'main'|'scene', tags: (EcommerceTag|null)[]) {
 if (!tags.some(tag => tag?.sku === expectedSku && tag.role === 'product')) throw new Error('This SKU needs at least one product image.');
 if (tags.some(tag => !tag || tag.sku !== expectedSku)) throw new Error('A reference belongs to another SKU or has no SKU assignment.');
 if (task === 'main' && tags.some(tag => tag?.role === 'style')) throw new Error('Listing images cannot use lifestyle style references.');
 if (tags.length > 10) throw new Error('Use at most ten images per task.');
}
export function assertSkuTextContext(prefix: string, references: string[]) {
 const own = `${prefix}-facts`;
 if (!references.includes(own) || references.some(id => /^sku-[a-f0-9]{16}-facts$/.test(id) && id !== own)) throw new Error('Prompt must reference product information from its own SKU.');
}

export function validateEcommerceInputs({prefix,task,references,cards,assets}: {
 prefix:string;task:string;references:string[];
 cards:Record<string,{kind:string;assetId?:string|null;referenceCardIds:string[]}>;
 assets:{id:string;metadata:unknown;source?:string}[];
}) {
 const tags=assets.map(asset=>ecommerceTag(asset.metadata));
 let identityTags=tags;
 let hasMaster=false;
 if(task==='main'){
  const master=cards[`${prefix}-master-reference`];
  const masterAsset=master&&references.includes(`${prefix}-master-reference`)?assets.find(asset=>asset.id===master.assetId):undefined;
  if(masterAsset){
   const metadata=masterAsset.metadata as {ecommerceOutput?:{task?:string};sourceCardId?:string};
   const tag=ecommerceTag(metadata);
   // A foreign image is allowed only through an explicit composition-master placement,
   // originating at an adopted main image for that SKU.
   const adopted=Object.values(cards).find(card=>card.kind==='asset'&&card.assetId===masterAsset.id&&master.referenceCardIds.some(id=>cards[id]===card)&&metadata.ecommerceOutput?.task==='main');
   if(masterAsset.source!=='provider'||!tag||!adopted||!metadata.sourceCardId?.endsWith('-main-image'))throw new Error('The composition master must be an adopted listing image.');
   identityTags=assets.filter(asset=>asset.id!==masterAsset.id).map(asset=>ecommerceTag(asset.metadata));hasMaster=true;
  }
 }else{
  const adoptedId=`${prefix}-adopted-main`,adopted=cards[adoptedId];
  const product=assets.find(asset=>asset.id===adopted?.assetId);
  const metadata=product?.metadata as {ecommerceOutput?:{task?:string};sourceCardId?:string}|undefined;
  if(product?.source!=='provider'||!adopted||!references.includes(adoptedId)||metadata?.sourceCardId!==`${prefix}-main-image`||metadata.ecommerceOutput?.task!=='main')throw new Error('Adopt a successful listing image and connect it before creating scenes.');
  if(assets.some(asset=>asset.id!==product?.id&&ecommerceTag(asset.metadata)?.role!=='style'))throw new Error('Scene identity must come from the adopted listing image; only style references may be added.');
 }
 const product=identityTags.find(tag=>tag?.role==='product');
 if(!product)throw new Error('Connect the product identity for this SKU.');
 assertSkuReferences(product.sku,task==='main'?'main':'scene',identityTags);
 return {sku:product.sku,tags:identityTags,hasMaster};
}

/** Local readiness check shared by workflow controls and paid-generation preflight. */
export function isEcommerceTaskPromptReady(card:{id:string;referenceCardIds:string[]},cards:Record<string,{kind:string;textContent?:string;referenceCardIds:string[]}>){
 const match=ecommerceTaskPattern.exec(card.id);if(!match)return false;
 const id=card.id.replace(/-image$/,'-prompt'),text=cards[id];
 if(text?.kind!=='text'||!card.referenceCardIds.includes(id)||!text.textContent?.trim()||text.textContent.trim()===pendingEcommercePrompt)return false;
 try{assertSkuTextContext(match[1],text.referenceCardIds);return true;}catch{return false;}
}

/** Product (family) a SKU belongs to; only SKUs of the same non-empty product may share a composition or scenes. */
export function productOfSku(sku:string,tags:(EcommerceTag|null)[]){
 return tags.find(tag=>tag?.sku===sku&&tag.role!=='style'&&tag.product?.trim())?.product?.trim()||'';
}
export function assertSameProduct(sku:string,otherSku:string,tags:(EcommerceTag|null)[]){
 const own=productOfSku(sku,tags),other=productOfSku(otherSku,tags);
 if(!own||!other)throw new Error('Set the same product name for both SKUs before reusing between them.');
 if(own!==other)throw new Error('These SKUs belong to different products and cannot share a composition or scenes.');
}

export const compositionOptions = {
 count: { single: '单件商品（只出现一件，例如单只鞋）', pair: '一对商品（例如一双鞋，两只并排）' },
 facing: { left: '侧面，商品前端朝左', right: '侧面，商品前端朝右', front: '正面朝向镜头', threeQuarter: '四分之三侧面，前端朝左前方' },
 scale: { small: '小，主体约占画面宽度 45%', medium: '中，主体约占画面宽度 60%', large: '大，主体约占画面宽度 75%' },
} as const;
export type CompositionTemplate = { count: keyof typeof compositionOptions.count; facing: keyof typeof compositionOptions.facing; scale: keyof typeof compositionOptions.scale };
export const compositionTemplateSchema = z.object({
 count: z.enum(['single','pair']), facing: z.enum(['left','right','front','threeQuarter']), scale: z.enum(['small','medium','large']),
}).strict();
const templateLines = { count: '数量：', facing: '朝向：', scale: '主体大小：' } as const;
/** The template is a plain text node connected to the main image, so the connection itself is the model input. */
export function compositionTemplateText(template: CompositionTemplate) {
 return ['构图模板（硬性要求，优先于参考图的姿态）：',
  templateLines.count + compositionOptions.count[template.count],
  templateLines.facing + compositionOptions.facing[template.facing],
  templateLines.scale + compositionOptions.scale[template.scale],
  '主体居中，禁止镜像翻转，禁止改变数量。'].join('\n');
}
export function parseCompositionTemplate(text: string | undefined): Partial<CompositionTemplate> {
 const result: Partial<CompositionTemplate> = {};
 for (const key of Object.keys(templateLines) as (keyof CompositionTemplate)[]) {
  const line = text?.split('\n').find(value => value.startsWith(templateLines[key]))?.slice(templateLines[key].length).trim();
  const found = Object.entries(compositionOptions[key]).find(([, label]) => label === line)?.[0];
  if (found) (result as Record<string, string>)[key] = found;
 }
 return result;
}
export const isCompleteCompositionTemplate = (text: string | undefined) => Object.keys(parseCompositionTemplate(text)).length === 3;

/** Concrete pose rules for the image model. Reference photos must not override these. */
export function compositionImageDirective(template: CompositionTemplate) {
  const count = template.count === 'single'
    ? '画面中只能出现 1 件商品。如果商品是鞋，只画一只鞋，禁止画成一双、两只并排、叠放或前后两只。'
    : '画面中必须是一对商品。如果商品是鞋，必须是两只鞋并排，禁止只画一只。';
  const facing = {
    left: '纯侧面。商品前端（鞋头、瓶口等朝前的一端）指向画面左侧。禁止前端朝右，禁止正面，禁止四分之三角度。',
    right: '纯侧面。商品前端（鞋头、瓶口等朝前的一端）指向画面右侧。禁止前端朝左，禁止正面，禁止四分之三角度。',
    front: '正面朝向镜头。禁止纯侧面，禁止四分之三角度。',
    threeQuarter: '四分之三侧面，前端朝左前方。禁止纯正面，禁止前端朝右。',
  }[template.facing];
  const scale = {
    small: '主体约占画面宽度 45%。',
    medium: '主体约占画面宽度 60%。',
    large: '主体约占画面宽度 75%。',
  }[template.scale];
  return [
    '硬性构图（高于所有参考图和母版，必须执行）：',
    count,
    facing,
    `${scale}主体居中，四周留白。`,
    '参考图和母版只用于确认颜色、Logo、外形和部件。它们如果是一双、正面或朝向不同，也必须改成上面的数量和朝向。禁止镜像翻转。',
  ].join('\n');
}

export const adoptedMainSkuName = (name: string) => name.replace(/ · 已采用主图.*$/, '');
export const factsProductName = (facts: string) => /商品：([^；\n]+)/.exec(facts)?.[1];
