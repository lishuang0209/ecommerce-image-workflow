import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

test('SKU workflow persists explicit adoption and composition-only master without resetting imported facts',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'beatdesign-ecommerce-chain-'));
 process.env.BEATDESIGN_DATA_DIR=directory;
 execFileSync(process.execPath,['node_modules/drizzle-kit/bin.cjs','push','--force'],{env:process.env,stdio:'pipe'});
 const {createCreativeCanvas}=await import('./create-canvas');
 const {bindEcommerceMaterials,skuNodePrefix,listEcommerceMaterials,editEcommerceMaterial,editEcommerceProfile}=await import('./ecommerce-materials');
 const {loadProjectWithLatestSnapshot}=await import('@/core/projects/projects');
 const {recordUserAsset,linkProjectAsset}=await import('@/core/workspace-lib/assets/user-assets');
 const {persistBeatDesignCommand}=await import('@/core/commands/persist');
 const project=await createCreativeCanvas({name:'Isolated workflow fixture',template:'ecommerce',locale:'en'});
 const black='Black',white='White',bp=skuNodePrefix(black),wp=skuNodePrefix(white);
 async function asset(sku:string,generated=false){
  const id=randomUUID();
  await recordUserAsset({id,type:'image',source:generated?'provider':'upload',bucket:'local-project-assets',objectKey:id,publicUrl:`/media/${id}.png`,originProjectId:project.id,metadata:{ecommerce:{sku,role:'product',shot:'front',preserve:'Logo'},...(generated?{sourceCardId:`${skuNodePrefix(sku)}-main-image`,ecommerceOutput:{task:'main'}}:{})}});
  await linkProjectAsset({projectId:project.id,assetId:id,role:generated?'generated':'upload'});return id;
 }
 const raw=await asset(black);const whiteRaw=await asset(white);
 const bind=(sku:string,extra:Partial<Parameters<typeof bindEcommerceMaterials>[0]>={})=>bindEcommerceMaterials({projectId:project.id,sku,...extra});
 const snapshot=async()=>{const state=await loadProjectWithLatestSnapshot({projectId:project.id});assert.ok(state);return state;};
 await bind(black);await bind(white);
 assert.equal((await snapshot()).snapshot.cards.filter(card=>card.kind==='generation').length,0);
 const library=await listEcommerceMaterials(project.id);assert.equal(library.length,2);
 const saved=library.find(item=>item.id===whiteRaw)!;
 const changed={...saved.tag,color:'Confirmed white',preserve:'Keep THERMOS Logo and latch'};
 await editEcommerceMaterial({projectId:project.id,assetId:whiteRaw,tag:changed,expectedTag:saved.tag});
 assert.deepEqual((await listEcommerceMaterials(project.id)).find(item=>item.id===whiteRaw)?.tag,changed);
 await assert.rejects(()=>editEcommerceMaterial({projectId:project.id,assetId:whiteRaw,tag:{...changed,color:'stale'},expectedTag:saved.tag}),/changed/);
 await assert.rejects(()=>editEcommerceMaterial({projectId:project.id,assetId:whiteRaw,tag:{...changed,sku:'Another SKU'},expectedTag:changed}),/fixed/);
 await assert.rejects(()=>editEcommerceMaterial({projectId:randomUUID(),assetId:whiteRaw,tag:changed,expectedTag:changed}),/unavailable/);
 await bind(black,{action:'workflow'});
 await assert.rejects(()=>bind(black,{action:'adopt',assetId:raw}),/Only a saved/);
 const main=await asset(black,true);await bind(black,{action:'adopt',assetId:main});
 let state=await snapshot();
 const pin=state.snapshot.cards.find(card=>card.id===bp+'-adopted-main');assert.equal(pin?.assetId,main);
 for(const scene of state.snapshot.cards.filter(card=>card.kind==='generation'&&card.id.startsWith(bp+'-scene-'))){assert.ok(scene.referenceCardIds.includes(bp+'-adopted-main'));assert.ok(!scene.referenceCardIds.includes('sku-asset-'+raw));}
 const id=randomUUID();
 const result=await persistBeatDesignCommand({projectId:project.id,origin:'ui',commandId:id,idempotencyKey:id,expectedRevision:state.snapshotVersion,command:{type:'canvas.apply',operations:[{type:'upsert_text',cardId:bp+'-facts',textContent:'User facts remain authoritative.'},{type:'upsert_card',card:{...state.snapshot.cards.find(card=>card.id===bp+'-main-image')!,prompt:'Revised main settings'}}]}});assert.ok(result.ok);
 await bind(black);await bind(black,{action:'workflow'});await bind(white,{action:'workflow',masterSku:black});
 state=await snapshot();
 assert.equal(state.snapshot.cards.find(card=>card.id===bp+'-facts')?.textContent,'User facts remain authoritative.');
 assert.equal(state.snapshot.cards.find(card=>card.id===bp+'-adopted-main')?.assetId,main);
 assert.equal(state.snapshot.cards.find(card=>card.id===wp+'-master-reference')?.assetId,main);
 assert.ok(state.snapshot.cards.find(card=>card.id===wp+'-main-image')?.referenceCardIds.includes(wp+'-master-reference'));
 assert.equal(state.snapshot.cards.filter(card=>card.kind==='generation').length,6);
 const originals=(await listEcommerceMaterials(project.id)).filter(item=>item.tag.sku===black);
 // Add another original for the same SKU; SKU edits must update both, not generated assets.
 const another=await asset(black);const before=(await listEcommerceMaterials(project.id)).filter(item=>item.tag.sku===black);
 const expected=before.map(item=>({assetId:item.id,tag:item.tag}));
 await editEcommerceProfile({projectId:project.id,sku:black,color:'Matte black',preserve:'THERMOS Logo',expected});
 const after=(await listEcommerceMaterials(project.id)).filter(item=>item.tag.sku===black);
 assert.equal(after.length,2);assert.ok(after.every(item=>item.tag.color==='Matte black'&&item.tag.preserve==='THERMOS Logo'));
 await assert.rejects(()=>editEcommerceProfile({projectId:project.id,sku:black,color:'Wrong',preserve:'Wrong',expected}),/changed/);
 assert.ok((await listEcommerceMaterials(project.id)).filter(item=>item.tag.sku===black).every(item=>item.tag.color==='Matte black'));
 await assert.rejects(()=>editEcommerceProfile({projectId:project.id,sku:black,color:'Wrong',preserve:'Wrong',expected:[{assetId:another,tag:after.find(item=>item.id===another)!.tag}]}),/photos changed/);

});
