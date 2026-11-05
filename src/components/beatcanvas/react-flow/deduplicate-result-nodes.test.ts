import assert from 'node:assert/strict';
import test from 'node:test';
import {buildTextCard} from '@/core/beatcanvas/text-nodes';
import type {CanvasCard} from '@/core/beatcanvas/canvas-types';
import type {BeatCanvasFlowNode,BeatCanvasFlowEdge} from './beatcanvas-react-flow-types';
import {deduplicateResultNodes} from './deduplicate-result-nodes';

test('merges identical result and adoption displays without replacing older adopted versions',()=>{
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
 assert.deepEqual(result.nodes.map(node=>node.id),['gen','old']);
 assert.deepEqual(result.edges.map(edge=>[edge.source,edge.target]),[['gen','scene']]);
 assert.equal(cards['sku-adopted-main'].assetId,'new');
 cards['sku-adopted-main']={...cards['sku-adopted-main'],assetId:'old',url:'/old'};
 assert.ok(deduplicateResultNodes(nodes,edges,cards).nodes.some(node=>node.id==='sku-adopted-main'));
});
