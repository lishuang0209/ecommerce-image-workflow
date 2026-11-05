import assert from 'node:assert/strict';
import test from 'node:test';
import {buildTextCard} from '@/core/beatcanvas/text-nodes';
import type {CanvasCard} from '@/core/beatcanvas/canvas-types';
import type {BeatCanvasFlowNode,BeatCanvasFlowEdge} from './beatcanvas-react-flow-types';
import {deduplicateResultNodes} from './deduplicate-result-nodes';

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
