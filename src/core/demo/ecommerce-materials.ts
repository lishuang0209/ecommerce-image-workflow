import { createHash, randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/core/workspace-lib/db-adapter';
import { userAsset, projectAssetMembership } from '@/config/db/schema';
import { loadProjectWithLatestSnapshot } from '@/core/projects/projects';
import { persistBeatDesignCommand } from '@/core/commands/persist';
import type { CanvasOperation } from '@/core/commands/canvas-commands';
import type { CanvasCard, CanvasGenerationCard } from '@/core/beatcanvas/canvas-types';
import { buildTextCard } from '@/core/beatcanvas/text-nodes';
import { ecommerceTag, pendingEcommercePrompt, preservationPrompt } from './ecommerce-contract';
import { getProjectAssetById } from '@/core/workspace-lib/assets/user-assets';

export const skuNodePrefix = (sku: string) => `sku-${createHash('sha256').update(sku).digest('hex').slice(0,16)}`;
export async function bindEcommerceMaterials({projectId,sku,action='import',assetId,masterSku}: {
 projectId:string;sku:string;action?:'import'|'workflow'|'adopt';assetId?:string;masterSku?:string;
}) {
 const state=await loadProjectWithLatestSnapshot({projectId});
 if(!state)throw new Error('Project is unavailable.');
 const db=await getDb();
 type AssetRow={id:string;filename:string|null;publicUrl:string;metadata:unknown;type:string};
 const rows:AssetRow[]=await db.select({id:userAsset.id,filename:userAsset.filename,publicUrl:userAsset.publicUrl,metadata:userAsset.metadata,type:userAsset.type}).from(userAsset).innerJoin(projectAssetMembership,eq(projectAssetMembership.assetId,userAsset.id)).where(and(eq(projectAssetMembership.projectId,projectId),eq(userAsset.type,'image')));
 // Generated outputs never become raw product photos on a later import.
 const assets=[...new Map(rows.filter(asset=>ecommerceTag(asset.metadata)?.sku===sku&&!(asset.metadata as {ecommerceOutput?:unknown}|null)?.ecommerceOutput).map(asset=>[asset.id,asset])).values()];
 if(!assets.length)throw new Error('Import product photos for this SKU first.');
 const cards=new Map<string,CanvasCard>(state.snapshot.cards.map(card=>[card.id,card]));
 const prefix=skuNodePrefix(sku),factsId=`${prefix}-facts`;
 const factsFrames=state.snapshot.cards.filter(card=>/^sku-[a-f0-9]{16}-facts$/.test(card.id)).map(card=>state.snapshot.frames[card.id]?.y??100);
 const y=state.snapshot.frames[factsId]?.y??(factsFrames.length?Math.max(...factsFrames)+1600:100);
 const operations:CanvasOperation[]=[];
 if(action!=='import'&&state.snapshot.cards.some(card=>card.id.startsWith(prefix+'-')&&card.kind==='generation'&&(card.status==='processing'||card.status==='pending')))throw new Error('Wait for this SKU to finish generating before changing the workflow.');
 if(action==='import'){
  if(cards.has('ecommerce-start'))operations.push({type:'remove_card',cardId:'ecommerce-start'});
  for(const [index,asset] of assets.entries()){
   const id=`sku-asset-${asset.id}`,tag=ecommerceTag(asset.metadata)!;
   if(!cards.has(id))operations.push({type:'upsert_card',card:{...buildTextCard({id,name:`${sku} · ${tag.shot||tag.role} · ${asset.filename||asset.id}`}),kind:'asset',type:'image',assetId:asset.id,url:asset.publicUrl,status:'succeeded'},frame:{x:-740-index%2*330,y:y+Math.floor(index/2)*290,w:300,h:260}});
  }
  if(!cards.has(factsId))operations.push({type:'upsert_text',cardId:factsId,name:`${sku} · 商品信息`,textContent:`${preservationPrompt(assets.map(asset=>ecommerceTag(asset.metadata)))}\n商品名称、型号与容量：请核对后填写，未确认的规格不应补写。\n素材标签会在生成时自动读取；请在此补充其他商品事实。`,frame:{x:-40,y,w:400,h:400}});
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
  if(masterSku){
   if(masterSku===sku)throw new Error('Select a different SKU as the master.');
   const master=cards.get(`${skuNodePrefix(masterSku)}-adopted-main`);
   if(master?.kind!=='asset'||!master.assetId)throw new Error('Adopt the master SKU listing image first.');
   masterId=`${prefix}-master-reference`;
   operations.push({type:'upsert_card',card:{...master,id:masterId,name:`${sku} · 构图母版（${masterSku}）`,referenceCardIds:[master.id]},frame:state.snapshot.frames[masterId]??{x:420,y:y-380,w:300,h:300}});
  }
  for(const [index,task]of(['main','scene-office','scene-outdoor']as const).entries()){
   const promptId=`${prefix}-${task}-prompt`,generationId=`${prefix}-${task}-image`;
   const label=task==='main'?'白底主图':task==='scene-office'?'办公桌面场景':'户外森林场景';
   if(!cards.has(promptId)){
    const text=buildTextCard({id:promptId,name:`${sku} · ${label}提示词`,textContent:pendingEcommercePrompt});
    text.referenceCardIds=[factsId];
    operations.push({type:'upsert_card',card:text,frame:{x:420,y:y+index*510,w:400,h:400}});
   }
   const own=assets.filter(asset=>ecommerceTag(asset.metadata)?.role!=='style').map(asset=>`sku-asset-${asset.id}`);
   const adoptedId=`${prefix}-adopted-main`;
   const references=task==='main'?[promptId,...own,...(masterId?[masterId]:[])]:[promptId,...(cards.has(adoptedId)?[adoptedId]:[]),...assets.filter(asset=>ecommerceTag(asset.metadata)?.role==='style').map(asset=>`sku-asset-${asset.id}`)];
   const existing=cards.get(generationId);
   // Explicit template application may add a master, but never resets edited prompts or existing references on a routine repeat.
   if(existing&&!(masterId&&task==='main'))continue;
   const generation:CanvasGenerationCard=existing?.kind==='generation'?{...existing,referenceCardIds:[...new Set([...existing.referenceCardIds.filter(id=>id!==`${prefix}-master-reference`),masterId!])]}:{...buildTextCard({id:generationId,name:`${sku} · ${label}`}),kind:'generation',type:'image',modelId:'qwen-image-2.1',aspectRatio:task==='main'?'1:1':'4:5',outputQuality:'1k',referenceCardIds:references};
   operations.push({type:'upsert_card',card:generation,...(!existing?{frame:{x:900,y:y+index*510,w:400,h:400}}:{})});
  }
 }
 if(operations.length){const commandId=randomUUID();const result=await persistBeatDesignCommand({projectId,origin:'ui',commandId,idempotencyKey:commandId,expectedRevision:state.snapshotVersion,command:{type:'canvas.apply',operations}});if(!result.ok)throw new Error(result.message);}
 return {sku,assets:assets.length,hasProduct:assets.some(asset=>ecommerceTag(asset.metadata)?.role==='product'),taskIds:action==='workflow'?['main','scene-office','scene-outdoor'].map(task=>`${prefix}-${task}-image`):[]};
}

export async function listEcommerceMaterials(projectId:string):Promise<{id:string;filename:string;url:string;tag:import('./ecommerce-contract').EcommerceTag}[]>{
 const {listProjectAssets}=await import('@/core/workspace-lib/assets/user-assets');
 const rows=await listProjectAssets({projectId,limit:1000});
 return rows.filter((asset:typeof rows[number])=>asset.type==='image'&&asset.source==='upload'&&ecommerceTag(asset.metadata)).map((asset:typeof rows[number])=>({id:asset.id,filename:asset.filename||asset.id,url:asset.publicUrl,tag:ecommerceTag(asset.metadata)!}));
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
export async function editEcommerceProfile({projectId,sku,color,preserve,expected}:{projectId:string;sku:string;color:string;preserve:string;expected:{assetId:string;tag:import('./ecommerce-contract').EcommerceTag}[]}){
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
  for(const item of materials)await editEcommerceMaterial({projectId,assetId:item.id,tag:{...item.tag,color,preserve},expectedTag:item.tag});
  return {saved:true,updated:materials.length};
 });
}
