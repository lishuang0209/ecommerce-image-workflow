import type {CanvasCard} from '@/core/beatcanvas/canvas-types';
import {ecommerceTaskPattern} from './ecommerce-contract';
import {parseLocalProjectAssetUrl} from '@/core/projects/local-project-asset-url';

export function resolveSceneMainAdoption(scene:CanvasCard,cards:Record<string,CanvasCard>){
 const match=ecommerceTaskPattern.exec(scene.id);
 if(scene.kind!=='generation'||!match||match[2]==='main')return null;
 const mainId=match[1]+'-main-image',adoptedId=match[1]+'-adopted-main';
 const adopted=cards[adoptedId];
 const candidates=new Map<string,{assetId:string;url:string;cardId:string;connected:boolean}>();
 const add=(card:CanvasCard,connected=false)=>{
  const assetId=card.assetId||(card.url?parseLocalProjectAssetUrl(card.url)?.assetId:null);
  if(card.type!=='image'||card.status!=='succeeded'||!assetId||!card.url)return;
  const previous=candidates.get(assetId);
  candidates.set(assetId,{assetId,url:card.url,cardId:card.id,connected:connected||previous?.connected||false});
 };
 for(const card of Object.values(cards)){
  if(card.kind==='output'&&card.sourceConfigCardId===mainId)add(card,scene.referenceCardIds.includes(card.id));
  if(card.kind==='asset'&&(card.id===adoptedId||card.referenceCardIds.includes(mainId)))add(card,scene.referenceCardIds.includes(card.id));
 }
 // A direct connection to the main generator resolves to its pinned concrete version.
 if(scene.referenceCardIds.includes(mainId)){
  const main=cards[mainId],take=main?.pinnedOutputId?cards[main.pinnedOutputId]:undefined;
  if(take?.kind==='output'&&take.sourceConfigCardId===mainId)add(take,true);
 }
 const images=[...candidates.values()];
 const connected=images.filter(image=>image.connected);
 const selected=connected.length===1?connected[0]:images.find(image=>image.assetId===adopted?.assetId)||images[images.length-1];
 return {images,selectedAssetId:selected?.assetId||'',ready:!!adopted?.assetId&&adopted.kind==='asset'&&adopted.status==='succeeded'&&scene.referenceCardIds.includes(adoptedId),adoptedAssetId:adopted?.assetId||null};
}
