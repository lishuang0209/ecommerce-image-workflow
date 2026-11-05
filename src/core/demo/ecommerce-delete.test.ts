import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';

test('library delete asks before touching the canvas, then removes images, their resized copies and canvas cards',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'beatdesign-ecommerce-delete-'));
 process.env.BEATDESIGN_DATA_DIR=directory;
 execFileSync(process.execPath,['node_modules/drizzle-kit/bin.cjs','push','--force'],{env:process.env,stdio:'pipe'});
 const {createCreativeCanvas}=await import('./create-canvas');
 const {deleteEcommerceAssets}=await import('./ecommerce-delete');
 const {loadProjectWithLatestSnapshot}=await import('@/core/projects/projects');
 const {recordUserAsset,linkProjectAsset,listProjectAssets}=await import('@/core/workspace-lib/assets/user-assets');
 const {persistBeatDesignCommand}=await import('@/core/commands/persist');
 const {buildTextCard}=await import('@/core/beatcanvas/text-nodes');
 const project=await createCreativeCanvas({name:'Delete fixture',template:'ecommerce',locale:'en'});
 async function asset(sku:string,source:'upload'|'provider'|'derived',extra:Record<string,unknown>={}){
  const id=randomUUID();
  await recordUserAsset({id,type:'image',source,bucket:'local-project-assets',objectKey:id,publicUrl:`/media/${id}.png`,originProjectId:project.id,metadata:{ecommerce:{sku,role:'product'},...extra}});
  await linkProjectAsset({projectId:project.id,assetId:id,role:source==='upload'?'upload':'generated'});return id;
 }
 const photo=await asset('White','upload'),result=await asset('White','provider'),resized=await asset('White','derived',{resize:{sourceAssetId:result}}),black=await asset('Black','upload');
 const state=await loadProjectWithLatestSnapshot({projectId:project.id});assert.ok(state);
 const card={...buildTextCard({id:'pinned',name:'Pinned'}),kind:'asset',type:'image',assetId:result,url:'/media/x.png'} as const;
 const commandId=randomUUID();
 assert.ok((await persistBeatDesignCommand({projectId:project.id,origin:'ui',commandId,idempotencyKey:commandId,expectedRevision:state.snapshotVersion,command:{type:'canvas.apply',operations:[{type:'upsert_card',card,frame:{x:0,y:0,w:100,h:100}}]}})).ok);
 const ids=async()=>(await listProjectAssets({projectId:project.id})).map((row:{id:string})=>row.id).sort();

 const asked=await deleteEcommerceAssets({projectId:project.id,assetIds:[result]});
 assert.equal(asked.inUse,1);assert.equal(asked.deleted,0);
 assert.equal((await ids()).length,4);

 const done=await deleteEcommerceAssets({projectId:project.id,assetIds:[result],removeFromCanvas:true});
 assert.equal(done.deleted,2);
 assert.ok(!done.document.cards.some(item=>item.id==='pinned'));
 assert.deepEqual(await ids(),[photo,black].sort());

 assert.equal((await deleteEcommerceAssets({projectId:project.id,sku:'White'})).deleted,1);
 assert.deepEqual(await ids(),[black]);
 await assert.rejects(()=>deleteEcommerceAssets({projectId:project.id,assetIds:[randomUUID()]}),/Only ecommerce images/);
});
