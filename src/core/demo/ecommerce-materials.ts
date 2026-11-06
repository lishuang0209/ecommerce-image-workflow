import {templateCompositionLine} from './text-prompt-contract';
import { createHash, randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/core/workspace-lib/db-adapter';
import { userAsset, projectAssetMembership } from '@/config/db/schema';
import { loadProjectWithLatestSnapshot } from '@/core/projects/projects';
import { persistBeatDesignCommand } from '@/core/commands/persist';
import type { CanvasOperation } from '@/core/commands/canvas-commands';
import type { CanvasCard, CanvasGenerationCard } from '@/core/beatcanvas/canvas-types';
import { buildTextCard } from '@/core/beatcanvas/text-nodes';
import { ecommerceTag, pendingEcommercePrompt, ecommerceTaskPattern, preservationPrompt, assertSameProduct, productOfSku, compositionTemplateText, type CompositionTemplate, type EcommerceTag } from './ecommerce-contract';
import { getProjectAssetById } from '@/core/workspace-lib/assets/user-assets';

export const skuNodePrefix = (sku: string) => `sku-${createHash('sha256').update(sku).digest('hex').slice(0,16)}`;
/** Copies another SKU's detailed scene prompt, swapping its colour word for this SKU's colour; null when it cannot be done safely. */
function copiedScenePrompt(cards:Map<string,CanvasCard>,assets:{metadata:unknown}[],sourceId?:string){
 if(!sourceId||!/^sku-[a-f0-9]{16}-scene-[A-Za-z0-9]+-prompt$/.test(sourceId))return null;
 const source=cards.get(sourceId),text=source?.kind==='text'?source.textContent?.trim():'';
 const facts=cards.get(sourceId.replace(/-scene-.*$/,'-facts')),from=facts?.kind==='text'?/确认颜色：([^；\n]+)/.exec(facts.textContent||'')?.[1]?.trim():'';
 const to=assets.map(asset=>ecommerceTag(asset.metadata)?.color?.trim()).find(Boolean);
 if(!text||text===pendingEcommercePrompt||!from||!to||!text.includes(from))return null;
 return text.split(from).join(to);
}
/** Directly under the SKU facts card, in the same column. */
const legacyFactsLines=/\n?商品名称、型号与容量：请核对后填写，未确认的规格不应补写。|\n?素材标签会在生成时自动读取；请在此补充其他商品事实。/g;
export const templateFrame=(y:number)=>({x:-40,y:y+440,w:400,h:300});

async function sameProductComposition(projectId:string,sku:string,cards:CanvasCard[]){
 const {listProjectAssets}=await import('@/core/workspace-lib/assets/user-assets');
 const rows=await listProjectAssets({projectId,limit:500});
 const tags:(EcommerceTag|null)[]=rows.filter((row:{metadata:unknown})=>!(row.metadata as {ecommerceOutput?:unknown}|null)?.ecommerceOutput).map((row:{metadata:unknown})=>ecommerceTag(row.metadata));
 const product=productOfSku(sku,tags);
 if(!product)return null;
 const byId=new Map(cards.map(card=>[card.id,card]));
 const candidates=[...new Set<string>(tags.map(tag=>tag?.sku).filter((other):other is string=>!!other&&other!==sku&&productOfSku(other,tags)===product))]
  .map(other=>({sku:other,adopted:byId.get(skuNodePrefix(other)+'-adopted-main'),template:byId.has(skuNodePrefix(other)+'-composition-template')}))
  .filter(item=>item.adopted?.kind==='asset'&&item.adopted.assetId);
 const best=candidates.find(item=>item.template)||candidates[0];
 return best?{sku:best.sku,assetId:best.adopted!.assetId!}:null;
}

export async function bindEcommerceMaterials({projectId,sku,action='import',assetId,masterSku,masterAssetId,clearMaster,sceneDescription,taskId,copyPromptFrom,template}: {
 projectId:string;sku:string;action?:'import'|'workflow'|'adopt'|'master'|'scene'|'template';template?:CompositionTemplate;assetId?:string;masterSku?:string;masterAssetId?:string;clearMaster?:boolean;sceneDescription?:string;taskId?:string;copyPromptFrom?:string;
}):Promise<{sku:string;assets:number;hasProduct:boolean;taskIds:string[]}> {
 const state=await loadProjectWithLatestSnapshot({projectId});
 if(!state)throw new Error('Project is unavailable.');
 if(action==='scene'&&!state.snapshot.cards.some(card=>card.id===skuNodePrefix(sku)+'-main-image')){
  await bindEcommerceMaterials({projectId,sku,action:'workflow'});
  return bindEcommerceMaterials({projectId,sku,action,sceneDescription,taskId,copyPromptFrom});
 }
 if(action==='workflow'&&!state.snapshot.cards.some(card=>card.id===skuNodePrefix(sku)+'-facts')){
  await bindEcommerceMaterials({projectId,sku,action:'import'});
  return bindEcommerceMaterials({projectId,sku,action,assetId,masterSku,masterAssetId,clearMaster});
 }
 // A new colour of a product that already has an adopted main image follows that composition by default.
 if(action==='workflow'&&!masterSku&&!clearMaster&&!state.snapshot.cards.some(card=>card.id===skuNodePrefix(sku)+'-main-image')){
  const source=await sameProductComposition(projectId,sku,state.snapshot.cards);
  if(source){
   if(!state.snapshot.cards.some(card=>card.id===skuNodePrefix(source.sku)+'-composition-master'))await bindEcommerceMaterials({projectId,sku:source.sku,action:'master',assetId:source.assetId});
   return bindEcommerceMaterials({projectId,sku,action,masterSku:source.sku});
  }
 }
 const db=await getDb();
 type AssetRow={id:string;filename:string|null;publicUrl:string;metadata:unknown;type:string};
 const rows:AssetRow[]=await db.select({id:userAsset.id,filename:userAsset.filename,publicUrl:userAsset.publicUrl,metadata:userAsset.metadata,type:userAsset.type}).from(userAsset).innerJoin(projectAssetMembership,eq(projectAssetMembership.assetId,userAsset.id)).where(and(eq(projectAssetMembership.projectId,projectId),eq(userAsset.type,'image')));
 // Generated outputs never become raw product photos on a later import.
 const photoTags=rows.filter(asset=>!(asset.metadata as {ecommerceOutput?:unknown}|null)?.ecommerceOutput).map(asset=>ecommerceTag(asset.metadata));
 const assets=[...new Map(rows.filter(asset=>ecommerceTag(asset.metadata)?.sku===sku&&!(asset.metadata as {ecommerceOutput?:unknown}|null)?.ecommerceOutput).map(asset=>[asset.id,asset])).values()];
 if(!assets.length)throw new Error('Import product photos for this SKU first.');
 const cards=new Map<string,CanvasCard>(state.snapshot.cards.map(card=>[card.id,card]));
 const prefix=skuNodePrefix(sku),factsId=`${prefix}-facts`,templateId=`${prefix}-composition-template`;
 const factsFrames=state.snapshot.cards.filter(card=>/^sku-[a-f0-9]{16}-facts$/.test(card.id)).map(card=>state.snapshot.frames[card.id]?.y??100);
 const y=state.snapshot.frames[factsId]?.y??(factsFrames.length?Math.max(...factsFrames)+1600:100);
 const operations:CanvasOperation[]=[];
 // Marking a composition reference only adds reference cards, so it never has to wait for running tasks.
 if(action!=='import'&&action!=='master'&&state.snapshot.cards.some(card=>card.id.startsWith(prefix+'-')&&card.kind==='generation'&&(card.status==='processing'||card.status==='pending')))throw new Error('Wait for this SKU to finish generating before changing the workflow.');
 if(action==='import'){
  if(cards.has('ecommerce-start'))operations.push({type:'remove_card',cardId:'ecommerce-start'});
  for(const [index,asset] of assets.entries()){
   const id=`sku-asset-${asset.id}`,tag=ecommerceTag(asset.metadata)!;
   if(!cards.has(id))operations.push({type:'upsert_card',card:{...buildTextCard({id,name:`${sku} · ${tag.shot||tag.role} · ${asset.filename||asset.id}`}),kind:'asset',type:'image',assetId:asset.id,url:asset.publicUrl,status:'succeeded'},frame:{x:-740-index%2*330,y:y+Math.floor(index/2)*290,w:300,h:260}});
  }
  if(!cards.has(factsId))operations.push({type:'upsert_text',cardId:factsId,name:`${sku} · 商品信息`,textContent:preservationPrompt(assets.map(asset=>ecommerceTag(asset.metadata))),frame:{x:-40,y,w:400,h:400}});
 }else if(action==='scene'){
  if(copyPromptFrom){
   const sourceSku=photoTags.find(tag=>tag&&skuNodePrefix(tag.sku)===copyPromptFrom.replace(/-scene-.*$/,''))?.sku;
   if(!sourceSku)throw new Error('The scene to copy is unavailable.');
   assertSameProduct(sku,sourceSku,photoTags);
  }
  const description=sceneDescription?.trim();
  if(!description||description.length>800)throw new Error('Enter a scene description of 1–800 characters.');
  const id=taskId||`${prefix}-scene-${randomUUID().replaceAll('-','')}-image`;
  const match=ecommerceTaskPattern.exec(id);
  if(!match||match[1]!==prefix||match[2]==='main')throw new Error('Scene task must belong to this SKU.');
  const existing=cards.get(id);
  if(existing&&existing.kind!=='generation')throw new Error('Invalid scene node.');
  const promptId=id.replace(/-image$/,'-prompt'),briefId=id.replace(/-image$/,'-brief');
  const label=description.slice(0,40);
  const sceneY=state.snapshot.frames[id]?.y??Math.max(y,...state.snapshot.cards.filter(card=>card.id.startsWith(prefix+'-')&&card.kind==='generation').map(card=>state.snapshot.frames[card.id]?.y??y))+510;
  // New scenes use ONE text node: the user's own description is the editable prompt (AI expansion is optional).
  // Scenes that already have a separate brief node keep that two-node structure and its review reset.
  const legacyBrief=cards.has(briefId);
  if(legacyBrief)operations.push({type:'upsert_text',cardId:briefId,name:`${sku} · 场景要求`,textContent:description,frame:state.snapshot.frames[briefId]??{x:-40,y:sceneY,w:400,h:240}});
  const prompt={...buildTextCard({id:promptId,name:`${sku} · ${label}提示词`,textContent:legacyBrief?pendingEcommercePrompt:copiedScenePrompt(cards,assets,copyPromptFrom)||description}),referenceCardIds:legacyBrief?[factsId,briefId]:[factsId]};
  operations.push({type:'upsert_card',card:prompt,frame:state.snapshot.frames[promptId]??{x:420,y:sceneY,w:400,h:400}});
  const adoptedId=`${prefix}-adopted-main`;
  const generation:CanvasGenerationCard={...(existing?.kind==='generation'?existing:buildTextCard({id,name:''})),id,kind:'generation',type:'image',name:`${sku} · ${label}`,modelId:'qwen-image-2.1',aspectRatio:'4:5',outputQuality:'1k',prompt:'',referenceCardIds:[promptId,...(cards.has(adoptedId)?[adoptedId]:[]),...assets.filter(asset=>ecommerceTag(asset.metadata)?.role==='style').map(asset=>`sku-asset-${asset.id}`)]};
  // Scenes are 4:5, so the node frame is 4:5 too (400×500) and the result is not cropped to a square.
  operations.push({type:'upsert_card',card:generation,...(!existing?{frame:{x:900,y:sceneY,w:400,h:500}}:{})});
 }else if(action==='master'){
  const adopted=cards.get(`${prefix}-adopted-main`);
  if(!assetId||adopted?.kind!=='asset'||adopted.assetId!==assetId)throw new Error('Adopt this main image before marking it as a composition reference.');
  const asset=await getProjectAssetById({projectId,assetId});
  const metadata=asset?.metadata as {sourceCardId?:string;ecommerceOutput?:{task?:string}}|null;
  if(!asset||asset.source!=='provider'||ecommerceTag(asset.metadata)?.sku!==sku||metadata?.sourceCardId!==`${prefix}-main-image`||metadata.ecommerceOutput?.task!=='main')throw new Error('Invalid composition reference.');
  for(const id of [`${prefix}-composition-master`,`${prefix}-composition-master-${assetId}`]){
   operations.push({type:'upsert_card',card:{...adopted,id,name:`${sku} · 同款构图参考`,referenceCardIds:[`${prefix}-main-image`]},frame:state.snapshot.frames[id]??{x:1370,y,w:340,h:360}});
  }
 }else if(action==='template'){
  if(!template)throw new Error('Choose count, facing and size for the composition template.');
  operations.push(...templateOperations(compositionTemplateText(template)));
 }else if(action==='adopt'){
  if(!assetId)throw new Error('Choose a successful listing image.');
  const asset=await getProjectAssetById({projectId,assetId});
  const metadata=asset?.metadata as {sourceCardId?:string;ecommerceOutput?:{task?:string}}|null;
  if(!asset||asset.source!=='provider'||asset.type!=='image'||ecommerceTag(asset.metadata)?.sku!==sku||metadata?.sourceCardId!==`${prefix}-main-image`||metadata.ecommerceOutput?.task!=='main')throw new Error('Only a saved listing image generated for this SKU can be adopted.');
  const id=`${prefix}-adopted-main`;
  operations.push({type:'upsert_card',card:{...buildTextCard({id,name:`${sku} · 已采用主图 / 母版 · 1:1`}),kind:'asset',type:'image',assetId,url:asset.publicUrl,status:'succeeded',referenceCardIds:[`${prefix}-main-image`]},frame:state.snapshot.frames[id]??{x:1370,y,w:340,h:360}});
  // Pin this concrete asset into existing scene nodes. Further main generations cannot change it.
  for(const card of state.snapshot.cards.filter(card=>card.kind==='generation'&&card.id.startsWith(prefix+'-scene'))){
   operations.push({type:'set_references',cardId:card.id,referenceCardIds:[card.id.replace(/-image$/,'-prompt'),id,...assets.filter(asset=>ecommerceTag(asset.metadata)?.role==='style').map(asset=>`sku-asset-${asset.id}`)]});
  }
 }else{
  if(!assets.some(asset=>ecommerceTag(asset.metadata)?.role==='product'))throw new Error('This SKU needs at least one product photo.');
  if(assets.length>10)throw new Error('Use at most ten reference photos for this MVP workflow.');
  if(!cards.has(factsId))throw new Error('Import materials into the canvas first.');
  let masterId:string|undefined;
  if(clearMaster){
   if(masterSku)throw new Error('Choose independent composition or a master, not both.');
   const id=`${prefix}-master-reference`;
   if(cards.has(id))operations.push({type:'remove_card',cardId:id});
   const main=cards.get(`${prefix}-main-image`);
   if(main?.kind==='generation')operations.push({type:'set_references',cardId:main.id,referenceCardIds:main.referenceCardIds.filter(ref=>ref!==id)});
  }
  if(masterSku){
   if(masterSku===sku)throw new Error('Select a different SKU as the master.');
   const master=cards.get(`${skuNodePrefix(masterSku)}-composition-master`);
   if(master?.kind!=='asset'||!master.assetId)throw new Error('Mark an adopted main image as a composition reference first.');
   if(masterAssetId&&master.assetId!==masterAssetId)throw new Error('Composition reference changed. Reload and select it again.');
   assertSameProduct(sku,masterSku,photoTags);
   masterId=`${prefix}-master-reference`;
   const masterTemplate=cards.get(`${skuNodePrefix(masterSku)}-composition-template`);
   // Reusing a composition also reuses its template, so the explicit pose rules travel with the master image.
   if(masterTemplate?.kind==='text'&&masterTemplate.textContent?.trim()&&!cards.has(templateId))operations.push(...templateOperations(masterTemplate.textContent));
   operations.push({type:'upsert_card',card:{...master,id:masterId,name:`${sku} · 构图母版（${masterSku}）`,referenceCardIds:[`${skuNodePrefix(masterSku)}-composition-master-${master.assetId}`]},frame:state.snapshot.frames[masterId]??{x:420,y:y-380,w:300,h:300}});
  }
  for(const [index,task]of(['main']as const).entries()){
   const promptId=`${prefix}-${task}-prompt`,generationId=`${prefix}-${task}-image`;
   const label='白底主图';
   if(!cards.has(promptId)){
    const text=buildTextCard({id:promptId,name:`${sku} · ${label}提示词`,textContent:pendingEcommercePrompt});
    text.referenceCardIds=[factsId];
    operations.push({type:'upsert_card',card:text,frame:{x:420,y:y+index*510,w:400,h:400}});
   }
   const own=assets.filter(asset=>ecommerceTag(asset.metadata)?.role!=='style').map(asset=>`sku-asset-${asset.id}`);
   const adoptedId=`${prefix}-adopted-main`;
   const hasTemplate=cards.has(templateId)||operations.some(op=>op.type==='upsert_text'&&op.cardId===templateId);
   const references=task==='main'?[promptId,...own,...(hasTemplate?[templateId]:[]),...(masterId?[masterId]:[])]:[promptId,...(cards.has(adoptedId)?[adoptedId]:[]),...assets.filter(asset=>ecommerceTag(asset.metadata)?.role==='style').map(asset=>`sku-asset-${asset.id}`)];
   const existing=cards.get(generationId);
   // Explicit template application may add a master, but never resets edited prompts or existing references on a routine repeat.
   if(existing&&!(masterId&&task==='main'))continue;
   const generation:CanvasGenerationCard=existing?.kind==='generation'?{...existing,referenceCardIds:[...new Set([...existing.referenceCardIds.filter(id=>id!==`${prefix}-master-reference`),...(hasTemplate?[templateId]:[]),masterId!])]}:{...buildTextCard({id:generationId,name:`${sku} · ${label}`}),kind:'generation',type:'image',modelId:'qwen-image-2.1',aspectRatio:task==='main'?'1:1':'4:5',outputQuality:'1k',referenceCardIds:references};
   operations.push({type:'upsert_card',card:generation,...(!existing?{frame:{x:900,y:y+index*510,w:400,h:400}}:{})});
  }
 }
 function templateOperations(text:string):CanvasOperation[]{
  const main=cards.get(`${prefix}-main-image`);
  return [{type:'upsert_text',cardId:templateId,name:`${sku} · 构图模板`,textContent:text,frame:templatePosition()},
   ...(main?.kind==='generation'&&!main.referenceCardIds.includes(templateId)?[{type:'set_references',cardId:main.id,referenceCardIds:[...main.referenceCardIds,templateId]} as CanvasOperation]:[]),
   ...singleCompositionLine()];
 }
 function templatePosition(){
  const frame=state!.snapshot.frames[templateId];
  // The first release placed the template above the facts card, where it overlapped neighbours.
  return !frame||(frame.x===-40&&frame.y===y-300&&frame.h===240)?templateFrame(y):frame;
 }
 /** With a template the main prompt keeps one composition line that defers to it, so the two never conflict. */
 function singleCompositionLine():CanvasOperation[]{
  const promptId=`${prefix}-main-prompt`,card=cards.get(promptId);
  if(card?.kind!=='text'||!card.textContent||!/^构图：/m.test(card.textContent)||card.textContent.includes(templateCompositionLine))return [];
  // upsert_text rebuilds the card and would drop its references; keep the card and change only the text.
  return [{type:'upsert_card',card:{...card,referenceCardIds:[...new Set([factsId,...card.referenceCardIds])],textContent:card.textContent.replace(/^构图：.*$/m,templateCompositionLine)}}];
 }
 const facts=cards.get(factsId);
 // Every SKU prompt must keep its own facts reference, or generation refuses it.
 for(const card of state.snapshot.cards)if(card.kind==='text'&&card.id.startsWith(prefix+'-')&&card.id.endsWith('-prompt')&&cards.has(factsId)&&!card.referenceCardIds.includes(factsId))operations.push({type:'upsert_card',card:{...card,referenceCardIds:[factsId,...card.referenceCardIds]}});
 if(facts?.kind==='text'&&facts.textContent&&legacyFactsLines.test(facts.textContent))operations.push({type:'upsert_text',cardId:factsId,name:facts.name,textContent:facts.textContent.replace(legacyFactsLines,'').trim(),frame:state.snapshot.frames[factsId]});
 if(action!=='template'&&cards.has(templateId)&&!operations.some(op=>op.type==='upsert_text'&&op.cardId===templateId)){
  const frame=templatePosition();
  if(frame!==state.snapshot.frames[templateId])operations.push({type:'move_card',cardId:templateId,frame} as CanvasOperation);
  operations.push(...singleCompositionLine());
 }
 if(operations.length){const commandId=randomUUID();const result=await persistBeatDesignCommand({projectId,origin:'ui',commandId,idempotencyKey:commandId,expectedRevision:state.snapshotVersion,command:{type:'canvas.apply',operations}});if(!result.ok)throw new Error(result.message);}
 return {sku,assets:assets.length,hasProduct:assets.some(asset=>ecommerceTag(asset.metadata)?.role==='product'),taskIds:action==='workflow'?['main'].map(task=>`${prefix}-${task}-image`):[]};
}

export async function listEcommerceMaterials(projectId:string):Promise<{id:string;filename:string;url:string;sha256?:string|null;tag:import('./ecommerce-contract').EcommerceTag}[]>{
 const {listProjectAssets}=await import('@/core/workspace-lib/assets/user-assets');
 const rows=await listProjectAssets({projectId,limit:1000});
 return [...new Map<string,import('./ecommerce-profiles').EcommerceMaterial>(rows.filter((asset:typeof rows[number])=>asset.type==='image'&&asset.source==='upload'&&ecommerceTag(asset.metadata)).map((asset:typeof rows[number])=>[asset.id,{id:asset.id,filename:asset.filename||asset.id,url:asset.publicUrl,sha256:asset.sha256,tag:ecommerceTag(asset.metadata)!}] as const)).values()];
}
export async function editEcommerceMaterial({projectId,assetId,tag,expectedTag}:{projectId:string;assetId:string;tag:import('./ecommerce-contract').EcommerceTag;expectedTag:import('./ecommerce-contract').EcommerceTag}){
 const asset=await getProjectAssetById({projectId,assetId});
 const current=ecommerceTag(asset?.metadata);
 if(!asset||asset.source!=='upload'||!current)throw new Error('Original ecommerce photo is unavailable.');
 if(current.sku!==tag.sku)throw new Error('SKU assignment is fixed after import. Import into another SKU separately.');
 if(JSON.stringify(current)!==JSON.stringify(expectedTag))throw new Error('Material tags changed. Reload the list and retry.');
 const state=await loadProjectWithLatestSnapshot({projectId});
 if(state?.snapshot.cards.some(card=>card.kind==='generation'&&(card.status==='pending'||card.status==='processing')&&card.referenceCardIds.some(id=>state.snapshot.cards.some(ref=>ref.id===id&&ref.assetId===assetId))))throw new Error('Wait for the image task to finish before editing these tags.');
 const {updateProjectOriginalAssetMetadata}=await import('@/core/workspace-lib/assets/user-assets');
 await updateProjectOriginalAssetMetadata({projectId,assetId,expectedMetadata:asset.metadata,metadata:{...(asset.metadata as Record<string,unknown>),ecommerce:tag}});
 return {saved:true};
}

/** One SKU-level edit, committed atomically to all original photo tags. */
export async function editEcommerceProfile({projectId,sku,color,preserve,product,expected}:{projectId:string;sku:string;color:string;preserve:string;product?:string;expected:{assetId:string;tag:import('./ecommerce-contract').EcommerceTag}[]}){
 const {withDatabaseTransaction}=await import('@/core/db/transaction-context');
 return withDatabaseTransaction(async()=>{
  const materials=(await listEcommerceMaterials(projectId)).filter(item=>item.tag.sku===sku);
  if(!materials.length||materials.length!==expected.length||new Set(expected.map(item=>item.assetId)).size!==expected.length)throw new Error('SKU photos changed. Reload before saving the product profile.');
  for(const item of materials){
   const before=expected.find(value=>value.assetId===item.id);
   if(!before||JSON.stringify(before.tag)!==JSON.stringify(item.tag))throw new Error('SKU information changed. Reload and retry.');
  }
  const state=await loadProjectWithLatestSnapshot({projectId});
  if(state?.snapshot.cards.some(card=>card.kind==='generation'&&card.id.startsWith(skuNodePrefix(sku)+'-')&&(card.status==='pending'||card.status==='processing')))throw new Error('Wait for this SKU to finish generating before changing its profile.');
  for(const item of materials)await editEcommerceMaterial({projectId,assetId:item.id,tag:{...item.tag,color,preserve,...(product!==undefined?{product:product.trim()||undefined}:{})},expectedTag:item.tag});
  return {saved:true,updated:materials.length};
 });
}
