import type {CanvasCard} from '@/core/beatcanvas/canvas-types';
import type {BeatCanvasFlowNode,BeatCanvasFlowEdge} from './beatcanvas-react-flow-types';

/** All take placements fold into their source node, independent of selected version.
 * Presentation only: never removes persisted cards or rewrites asset references. */
/** SKU facts and composition templates are edited in the library and workflow panels, not on the canvas. */
export const panelOnlyCard=(id:string)=>/^sku-[0-9a-f]{16}-(?:facts|composition-template)$/.test(id);

/** Maps each folded card id to the visible node it is drawn inside. */
export function foldedResultAliases(nodes:{id:string}[],cards:Record<string,CanvasCard>|undefined){
 const aliases=new Map<string,string>();
 if(!cards)return aliases;
 const shown=new Map<string,string>();
 for(const node of nodes){
  const card=cards[node.id];
  if(card?.kind!=='generation'||card.generationMode==='analysis')continue;
  for(const output of Object.values(cards)){
   if(output.kind==='output'&&output.status==='succeeded'&&output.assetId&&output.sourceConfigCardId===card.id){
    aliases.set(output.id,card.id);shown.set(output.assetId,card.id);
   }
  }
 }
 for(const node of nodes){
  const card=cards[node.id];
  if(card?.kind==='asset'&&(/-adopted-main$|-master-reference$|-composition-master(?:-[a-f0-9-]+)?$/.test(card.id)||card.id.startsWith('result:'))&&card.assetId){
   const target=shown.get(card.assetId);
   if(target)aliases.set(card.id,target);
  }
 }
 return aliases;
}

/** Folded cards are invisible, so deleting their host must delete them too, or they resurface.
 * A SKU's folded cards only go when that SKU's own nodes are deleted, so another SKU's reuse survives. */
export function foldedCardsToDelete(deleting:Set<string>,nodes:{id:string}[],cards:Record<string,CanvasCard>|undefined){
 const extra:string[]=[];
 for(const node of nodes){const sku=/^(sku-[0-9a-f]+)-/.exec(node.id)?.[1];if(sku&&panelOnlyCard(node.id)&&!deleting.has(node.id)&&deleting.has(`${sku}-main-image`))extra.push(node.id);}
 for(const [id,target]of foldedResultAliases(nodes,cards)){
  if(deleting.has(id))continue;
  const sku=/^(sku-[0-9a-f]+)-/.exec(id)?.[1];
  if(sku?(deleting.has(`${sku}-main-image`)||(deleting.has(target)&&target.startsWith(sku+'-'))):deleting.has(target))extra.push(id);
 }
 return extra;
}

export function deduplicateResultNodes(nodes:BeatCanvasFlowNode[],edges:BeatCanvasFlowEdge[],cards:Record<string,CanvasCard>|undefined){
 if(!cards)return {nodes,edges};
 const aliases=foldedResultAliases(nodes,cards);
 const seen=new Set<string>();
 return {nodes:nodes.filter(node=>!aliases.has(node.id)&&!panelOnlyCard(node.id)),edges:edges.flatMap(edge=>{
  if(panelOnlyCard(edge.source)||panelOnlyCard(edge.target))return [];
  const source=aliases.get(edge.source)||edge.source,target=aliases.get(edge.target)||edge.target;
  const key=JSON.stringify([source,target]);
  if(source===target||seen.has(key))return [];
  seen.add(key);
  return [{...edge,source,target,...(source!==edge.source||target!==edge.target?{deletable:false}:{})}];
 })};
}
