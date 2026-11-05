import type {CanvasCard} from '@/core/beatcanvas/canvas-types';
import type {BeatCanvasFlowNode,BeatCanvasFlowEdge,GenerationCardNodeProps} from './beatcanvas-react-flow-types';

/** Presentation only: never removes persisted cards or rewrites asset references. */
export function deduplicateResultNodes(nodes:BeatCanvasFlowNode[],edges:BeatCanvasFlowEdge[],cards:Record<string,CanvasCard>|undefined){
 if(!cards)return {nodes,edges};
 const aliases=new Map<string,string>();
 const shown=new Map<string,string>();
 for(const node of nodes){
  const card=cards[node.id];
  const url=(node.data.props as GenerationCardNodeProps).latestOutputUrl;
  if(card?.kind!=='generation'||!url||card.generationMode==='analysis')continue;
  for(const output of Object.values(cards)){
   if(output.kind==='output'&&output.status==='succeeded'&&output.assetId&&output.sourceConfigCardId===card.id&&output.url===url){
    aliases.set(output.id,card.id);shown.set(output.assetId,card.id);
   }
  }
 }
 for(const node of nodes){
  const card=cards[node.id];
  if(card?.kind==='asset'&&(/-adopted-main$/.test(card.id)||card.id.startsWith('result:'))&&card.assetId){
   const target=shown.get(card.assetId);
   if(target)aliases.set(card.id,target);
  }
 }
 const seen=new Set<string>();
 return {nodes:nodes.filter(node=>!aliases.has(node.id)),edges:edges.flatMap(edge=>{
  const source=aliases.get(edge.source)||edge.source,target=aliases.get(edge.target)||edge.target;
  const key=JSON.stringify([source,target]);
  if(source===target||seen.has(key))return [];
  seen.add(key);
  return [{...edge,source,target,...(source!==edge.source||target!==edge.target?{deletable:false}:{})}];
 })};
}
