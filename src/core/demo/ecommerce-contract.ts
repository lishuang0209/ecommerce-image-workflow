import { z } from 'zod';
export const ecommerceTagSchema = z.object({
 sku: z.string().trim().min(1).max(100),
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
export const ecommerceTaskPattern = /^(sku-[a-f0-9]{16})-(main|scene(?:-office|-outdoor)?)-image$/;
export function preservationPrompt(tags: (EcommerceTag|null)[]) {
 return [...new Set(tags.filter((tag): tag is EcommerceTag=>!!tag&&tag.role!=='style').map(tag=>[
  `SKU：${tag.sku}`, tag.color?`确认颜色：${tag.color}`:'', tag.preserve?`必须保留：${tag.preserve}`:'',
 ].filter(Boolean).join('；')))].join('\n');
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
