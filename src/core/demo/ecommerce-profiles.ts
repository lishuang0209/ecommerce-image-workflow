import type {EcommerceTag} from './ecommerce-contract';
export type EcommerceMaterial={id:string;filename:string;url:string;tag:EcommerceTag};
export type EcommerceProfile={sku:string;color:string;preserve:string;conflicting:boolean};
/** Read legacy per-photo facts without discarding conflicting values. */
export function groupEcommerceMaterials(materials:EcommerceMaterial[]){
 const groups=new Map<string,EcommerceMaterial[]>();
 for(const item of materials)groups.set(item.tag.sku,[...(groups.get(item.tag.sku)||[]),item]);
 return [...groups].map(([sku,images])=>{
  const colors=[...new Set(images.map(item=>item.tag.color?.trim()).filter((value):value is string=>!!value))];
  const preserve=[...new Set(images.map(item=>item.tag.preserve?.trim()).filter((value):value is string=>!!value))];
  return {sku,images,color:colors.join(' / '),preserve:preserve.join('\n'),conflicting:colors.length>1||preserve.length>1};
 });
}
