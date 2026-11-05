import assert from 'node:assert/strict';
import test from 'node:test';
import {buildTextCard} from '@/core/beatcanvas/text-nodes';
import type {CanvasCard} from '@/core/beatcanvas/canvas-types';
import type {BeatCanvasFlowNode,BeatCanvasFlowEdge} from './beatcanvas-react-flow-types';
import {deduplicateResultNodes,foldedCardsToDelete} from './deduplicate-result-nodes';

test('all historical take placements fold without changing pinned assets or inputs',()=>{
 const cards={
  gen:{...buildTextCard({id:'gen',name:'Main'}),kind:'generation',type:'image'},
  result:{...buildTextCard({id:'result',name:'Result'}),kind:'output',type:'image',status:'succeeded',assetId:'new',url:'/new',sourceConfigCardId:'gen'},
  'sku-adopted-main':{...buildTextCard({id:'sku-adopted-main',name:'Adopted'}),kind:'asset',type:'image',assetId:'new',url:'/new'},
  'result:result':{...buildTextCard({id:'result:result',name:'Visible result'}),kind:'asset',type:'image',assetId:'new',url:'/new'},
  old:{...buildTextCard({id:'old',name:'Old'}),kind:'output',type:'image',status:'succeeded',assetId:'old',url:'/old',sourceConfigCardId:'gen'},
 } as Record<string,CanvasCard>;
 const nodes=Object.keys(cards).map(id=>({id,position:{x:0,y:0},data:{meta:{},props:{w:100,h:100,...(id==='gen'?{latestOutputUrl:'/new'}:{})}}})) as BeatCanvasFlowNode[];
 const edges=[{id:'a',source:'gen',target:'result'},{id:'b',source:'sku-adopted-main',target:'scene'}] as BeatCanvasFlowEdge[];
 const result=deduplicateResultNodes(nodes,edges,cards);
 assert.deepEqual(result.nodes.map(node=>node.id),['gen']);
 assert.deepEqual(result.edges.map(edge=>[edge.source,edge.target]),[['gen','scene']]);
 assert.equal(cards['sku-adopted-main'].assetId,'new');
 cards['sku-adopted-main']={...cards['sku-adopted-main'],assetId:'old',url:'/old'};
 const scene={...buildTextCard({id:'scene',name:'Scene'}),kind:'generation',type:'image',referenceCardIds:['sku-adopted-main'] } as CanvasCard;
 cards.scene=scene;
 const before=JSON.stringify(cards);
 assert.deepEqual(deduplicateResultNodes(nodes,edges,cards).nodes.map(node=>node.id),['gen']);
 assert.equal(cards['sku-adopted-main'].assetId,'old');
 assert.deepEqual(cards.scene.referenceCardIds,['sku-adopted-main']);
 assert.equal(JSON.stringify(cards),before);
 assert.ok(deduplicateResultNodes(nodes.filter(node=>node.id!=='gen'),edges,cards).nodes.some(node=>node.id==='sku-adopted-main'));
 // Changing the displayed take cannot bring standalone history cards back.
 nodes[0].data.props={w:100,h:100,cardMediaType:'image',label:'Main',status:'succeeded',latestOutputUrl:'/old'};
 assert.deepEqual(deduplicateResultNodes(nodes,edges,cards).nodes.map(node=>node.id),['gen']);
});

test('deleting a host also deletes its folded cards, but keeps another SKU reusing that composition',()=>{
 const white='sku-aaaa',black='sku-bbbb';
 const image=(id:string,assetId:string)=>({...buildTextCard({id,name:id}),kind:'asset',type:'image',assetId,url:'/'+assetId});
 const cards={
  [white+'-main-image']:{...buildTextCard({id:white+'-main-image',name:'White'}),kind:'generation',type:'image'},
  out:{...buildTextCard({id:'out',name:'Out'}),kind:'output',type:'image',status:'succeeded',assetId:'w',url:'/w',sourceConfigCardId:white+'-main-image'},
  'result:out':image('result:out','w'),
  [white+'-adopted-main']:image(white+'-adopted-main','w'),
  [white+'-composition-master']:image(white+'-composition-master','w'),
  [black+'-main-image']:{...buildTextCard({id:black+'-main-image',name:'Black'}),kind:'generation',type:'image'},
  [black+'-master-reference']:image(black+'-master-reference','w'),
 } as Record<string,CanvasCard>;
 const nodes=Object.keys(cards).map(id=>({id}));
 assert.deepEqual(foldedCardsToDelete(new Set([white+'-main-image']),nodes,cards).sort(),['out','result:out',white+'-adopted-main',white+'-composition-master'].sort());
 assert.ok(foldedCardsToDelete(new Set([white+'-main-image',black+'-main-image']),nodes,cards).includes(black+'-master-reference'));
});

test('SKU facts and templates stay off the canvas but are deleted with their SKU main image',()=>{
 const sku='sku-0123456789abcdef';
 const text=(id:string)=>({...buildTextCard({id,name:id}),kind:'text'});
 const cards={[sku+'-facts']:text(sku+'-facts'),[sku+'-composition-template']:text(sku+'-composition-template'),[sku+'-main-prompt']:text(sku+'-main-prompt'),[sku+'-main-image']:{...buildTextCard({id:sku+'-main-image',name:'Main'}),kind:'generation',type:'image'}} as Record<string,CanvasCard>;
 const nodes=Object.keys(cards).map(id=>({id,position:{x:0,y:0},data:{meta:{},props:{w:100,h:100}}})) as BeatCanvasFlowNode[];
 const edges=[{id:'a',source:sku+'-facts',target:sku+'-main-prompt'},{id:'b',source:sku+'-main-prompt',target:sku+'-main-image'}] as BeatCanvasFlowEdge[];
 const shown=deduplicateResultNodes(nodes,edges,cards);
 assert.deepEqual(shown.nodes.map(node=>node.id).sort(),[sku+'-main-image',sku+'-main-prompt'].sort());
 assert.deepEqual(shown.edges.map(edge=>edge.id),['b']);
 assert.deepEqual(foldedCardsToDelete(new Set([sku+'-main-image']),nodes,cards).sort(),[sku+'-composition-template',sku+'-facts'].sort());
 assert.deepEqual(foldedCardsToDelete(new Set([sku+'-main-prompt']),nodes,cards),[]);
});
