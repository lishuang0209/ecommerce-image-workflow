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
 await linkProjectAsset({projectId:project.id,assetId:raw,role:'reference'});
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
 assert.equal((await snapshot()).snapshot.cards.filter(card=>card.kind==='generation').length,1);
 await bind(black,{action:'scene',taskId:bp+'-scene-office-image',sceneDescription:'简洁的梳妆台，柔和自然光'});
 await bind(black,{action:'scene',taskId:bp+'-scene-abcdef0123456789-image',sceneDescription:'城市街头，柔和侧光'});
 await assert.rejects(()=>bind(black,{action:'adopt',assetId:raw}),/Only a saved/);
 const main=await asset(black,true);
 await assert.rejects(()=>bind(black,{action:'master',assetId:main}),/Adopt/);
 await bind(black,{action:'adopt',assetId:main});
 await assert.rejects(()=>bind(white,{action:'workflow',masterSku:black}),/Mark/);
 await bind(black,{action:'master',assetId:main});
 let state=await snapshot();
 const pin=state.snapshot.cards.find(card=>card.id===bp+'-adopted-main');assert.equal(pin?.assetId,main);
 for(const scene of state.snapshot.cards.filter(card=>card.kind==='generation'&&card.id.startsWith(bp+'-scene-'))){assert.ok(scene.referenceCardIds.includes(bp+'-adopted-main'));assert.ok(!scene.referenceCardIds.includes('sku-asset-'+raw));}
 const id=randomUUID();
 const result=await persistBeatDesignCommand({projectId:project.id,origin:'ui',commandId:id,idempotencyKey:id,expectedRevision:state.snapshotVersion,command:{type:'canvas.apply',operations:[{type:'upsert_text',cardId:bp+'-facts',textContent:'User facts remain authoritative.'},{type:'upsert_card',card:{...state.snapshot.cards.find(card=>card.id===bp+'-main-image')!,prompt:'Revised main settings'}}]}});assert.ok(result.ok);
 await bind(black);await bind(black,{action:'workflow'});await bind(white,{action:'workflow',masterSku:black});
 await bind(white,{action:'scene',taskId:wp+'-scene-1111222233334444-image',sceneDescription:'浅色摄影台'});
 await bind(white,{action:'scene',taskId:wp+'-scene-aaaabbbbccccdddd-image',sceneDescription:'节日礼盒旁'});
 state=await snapshot();
 assert.equal(state.snapshot.cards.find(card=>card.id===bp+'-facts')?.textContent,'User facts remain authoritative.');
 assert.equal(state.snapshot.cards.find(card=>card.id===bp+'-adopted-main')?.assetId,main);
 assert.equal(state.snapshot.cards.find(card=>card.id===wp+'-master-reference')?.assetId,main);
 assert.ok(state.snapshot.cards.find(card=>card.id===wp+'-main-image')?.referenceCardIds.includes(wp+'-master-reference'));
 assert.equal(state.snapshot.cards.filter(card=>card.kind==='generation').length,6);
 // Marking a new master must not change an already applied concrete reference.
 const nextMain=await asset(black,true);
 await bind(black,{action:'adopt',assetId:nextMain});
 await bind(black,{action:'master',assetId:nextMain});
 state=await snapshot();
 assert.equal(state.snapshot.cards.find(card=>card.id===wp+'-master-reference')?.assetId,main);
 assert.ok(state.snapshot.cards.some(card=>card.id===bp+'-composition-master-'+main&&card.assetId===main));
 await assert.rejects(()=>bind(white,{action:'workflow',masterSku:black,masterAssetId:main}),/changed/);
 await bind(white,{action:'workflow',clearMaster:true});
 state=await snapshot();
 assert.ok(!state.snapshot.cards.some(card=>card.id===wp+'-master-reference'));
 assert.ok(!state.snapshot.cards.find(card=>card.id===wp+'-main-image')?.referenceCardIds.includes(wp+'-master-reference'));
 await bind(white,{action:'workflow',masterSku:black,masterAssetId:nextMain});
 assert.equal((await snapshot()).snapshot.cards.find(card=>card.id===wp+'-master-reference')?.assetId,nextMain);
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

 // Legacy library-only SKU must create its own nodes, never fall back to another SKU.
 const legacy='Legacy library SKU';const legacyRaw=await asset(legacy);
 await bind(legacy,{action:'workflow'});
 const legacyPrefix=skuNodePrefix(legacy),legacyState=await snapshot();
 assert.ok(legacyState.snapshot.cards.some(card=>card.id===legacyPrefix+'-facts'));
 assert.ok(legacyState.snapshot.cards.find(card=>card.id===legacyPrefix+'-main-image')?.referenceCardIds.includes('sku-asset-'+legacyRaw));

 const sceneId=wp+'-scene-1111222233334444-image';
 const adoptedWhite=await asset(white,true);await bind(white,{action:'adopt',assetId:adoptedWhite});
 await bind(white,{action:'scene',taskId:sceneId,sceneDescription:'口红放在梳妆台上，不使用森林背景'});
 const editedScene=await snapshot();
 assert.ok(editedScene.snapshot.cards.find(card=>card.id===sceneId)?.referenceCardIds.includes(wp+'-adopted-main'));
 // A new scene is ONE text node: the user's description is the prompt itself, no separate brief node.
 const scenePrompt=editedScene.snapshot.cards.find(card=>card.id===sceneId.replace(/-image$/,'-prompt'));
 assert.equal(scenePrompt?.textContent,'口红放在梳妆台上，不使用森林背景');
 assert.deepEqual(scenePrompt?.referenceCardIds,[wp+'-facts']);
 assert.ok(!editedScene.snapshot.cards.some(card=>card.id.endsWith('-brief')));
 assert.ok(editedScene.snapshot.cards.find(card=>card.id===sceneId)?.referenceCardIds.includes(sceneId.replace(/-image$/,'-prompt')));
 assert.equal(editedScene.snapshot.cards.filter(card=>card.id===sceneId).length,1);
 // A 4:5 scene gets a 4:5 node frame so its result is shown uncropped.
 assert.deepEqual([editedScene.snapshot.frames[sceneId]?.w,editedScene.snapshot.frames[sceneId]?.h],[400,500]);
 // A scene that already has a separate brief node keeps the two-node structure and its prompt review reset.
 const legacySceneId=wp+'-scene-9999888877776666-image',legacyBriefId=legacySceneId.replace(/-image$/,'-brief');
 await bind(white,{action:'scene',taskId:legacySceneId,sceneDescription:'旧场景描述'});
 let legacySnapshot=await snapshot();
 const legacyCommand=randomUUID();
 const legacyResult=await persistBeatDesignCommand({projectId:project.id,origin:'ui',commandId:legacyCommand,idempotencyKey:legacyCommand,expectedRevision:legacySnapshot.snapshotVersion,command:{type:'canvas.apply',operations:[{type:'upsert_text',cardId:legacyBriefId,name:'brief',textContent:'旧场景描述',frame:{x:0,y:0,w:300,h:200}}]}});assert.ok(legacyResult.ok);
 await bind(white,{action:'scene',taskId:legacySceneId,sceneDescription:'旧场景改写'});
 legacySnapshot=await snapshot();
 assert.equal(legacySnapshot.snapshot.cards.find(card=>card.id===legacyBriefId)?.textContent,'旧场景改写');
 assert.deepEqual(legacySnapshot.snapshot.cards.find(card=>card.id===legacySceneId.replace(/-image$/,'-prompt'))?.referenceCardIds,[wp+'-facts',legacyBriefId]);
 await assert.rejects(()=>bind(white,{action:'scene',taskId:bp+'-scene-office-image',sceneDescription:'Invalid target'}),/belong/);
 await assert.rejects(()=>bind(white,{action:'scene',sceneDescription:' '}),/Enter/);

});
