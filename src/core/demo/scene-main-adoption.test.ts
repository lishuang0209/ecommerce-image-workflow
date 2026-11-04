import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTextCard} from '@/core/beatcanvas/text-nodes';
import type {CanvasCard} from '@/core/beatcanvas/canvas-types';
import {resolveSceneMainAdoption} from './scene-main-adoption';
const prefix='sku-1234567890abcdef';
const asset=(id:string,assetId:string,refs:string[]=[])=>({...buildTextCard({id,name:id}),kind:'asset',type:'image',status:'succeeded',assetId,url:'/media/'+assetId,referenceCardIds:refs}) as CanvasCard;
const scene={...buildTextCard({id:prefix+'-scene-office-image',name:'Office'}),kind:'generation',type:'image',referenceCardIds:['connected']} as CanvasCard;
test('connected main is offered beside the scene and is not silently adopted',()=>{
 const image=asset('connected','main-1',[prefix+'-main-image']);
 const state=resolveSceneMainAdoption(scene,{connected:image})!;
 assert.equal(state.images.length,1);assert.equal(state.selectedAssetId,'main-1');assert.equal(state.ready,false);
 assert.equal(state.images[0].connected,true);
});
test('scene adoption recognizes a fixed version only when its canonical placement is connected',()=>{
 const adopted=asset(prefix+'-adopted-main','main-1',[prefix+'-main-image']);
 assert.equal(resolveSceneMainAdoption(scene,{[adopted.id]:adopted})?.ready,false);
 assert.equal(resolveSceneMainAdoption({...scene,referenceCardIds:[adopted.id]},{[adopted.id]:adopted})?.ready,true);
});
test('foreign SKU, failed media and raw photos are not offered as listing candidates',()=>{
 const own=asset('own','main-1',[prefix+'-main-image']);
 const foreign=asset('foreign','main-2',['sku-abcdef1234567890-main-image']);
 const raw=asset('raw','raw-1');
 const failed={...asset('failed','main-3',[prefix+'-main-image']),status:'failed'} as CanvasCard;
 const state=resolveSceneMainAdoption(scene,{own,foreign,raw,failed})!;
 assert.deepEqual(state.images.map(item=>item.assetId),['main-1']);
 assert.equal(resolveSceneMainAdoption({...scene,id:prefix+'-main-image'},{}),null);
});
test('duplicate placements of the same asset remain one version and preserve connected priority',()=>{
 const other=asset('other','main-2',[prefix+'-main-image']);
 const connected=asset('connected','main-1',[prefix+'-main-image']);
 const duplicate=asset('duplicate','main-1',[prefix+'-main-image']);
 const state=resolveSceneMainAdoption(scene,{other,connected,duplicate})!;
 assert.equal(state.images.length,2);assert.equal(state.selectedAssetId,'main-1');
});
