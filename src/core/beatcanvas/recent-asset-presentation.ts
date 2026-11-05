import type {RecentAsset} from '@/core/workspace-lib/app/workspace-client-api';

/** Keep exact copies out of the picker; collapse task takes only in compact view. */
export function presentRecentAssets(assets:RecentAsset[],showVersions=false){
 const ids=new Set<string>(),content=new Set<string>(),tasks=new Set<string>();
 return assets.filter(asset=>{
  if(ids.has(asset.id))return false;ids.add(asset.id);
  const metadata=asset.metadata as {sourceCardId?:unknown;ecommerce?:{sku?:unknown;role?:unknown}}|null;
  const sku=metadata?.ecommerce?.sku||'',role=metadata?.ecommerce?.role||'';
  const contentKey=JSON.stringify([asset.sha256||asset.publicUrl,sku,role]);
  if(content.has(contentKey))return false;content.add(contentKey);
  const source=metadata?.sourceCardId;
  if(!showVersions&&typeof source==='string'&&source){
   if(tasks.has(source))return false;tasks.add(source);
  }
  return true;
 });
}
