import {EcommerceSelect} from './ecommerce-select';
import {useState,type ReactNode} from 'react';
import {useTranslations} from '@/core/workspace-lib/shims/next-intl';
import {apiJsonPatch} from '@/lib/api-client';
import type {EcommerceTag} from '@/core/demo/ecommerce-contract';
import type {RecentAsset} from '@/core/workspace-lib/app/workspace-client-api';
import {uniqueContentMaterials,groupEcommerceMaterials,type EcommerceMaterial} from '@/core/demo/ecommerce-profiles';
export type SavedEcommerceMaterial=EcommerceMaterial;

export const skuLabel=(group:{sku:string;product?:string})=>group.product?`${group.product} · ${group.sku}`:group.sku;

export function EcommerceMaterialLibrary({projectId,materials,onSaved,flush,disabled,renderResults,onPlaceMaterial,activeSku,onSkuChange,onLocateSku,onDeleteAssets,onPlaceResult}:{onPlaceResult?:(asset:RecentAsset)=>void;onDeleteAssets?:(body:{assetIds?:string[];sku?:string})=>Promise<number|null>;activeSku:string;onSkuChange:(sku:string)=>void;onLocateSku?:()=>void;projectId:string;materials:SavedEcommerceMaterial[];onSaved:()=>Promise<unknown>;flush:()=>Promise<void>;disabled:boolean;renderResults?:(sku:string,onDelete:(assetId:string)=>void,onOpen:(asset:RecentAsset)=>void)=>ReactNode;onPlaceMaterial?:(material:SavedEcommerceMaterial)=>void}){
 const t=useTranslations('AppShell.studio.ecommerce');
 const [tab,setTab]=useState<'references'|'results'>('references');
 const [detailId,setDetailId]=useState<string|null>(null),[showProfile,setShowProfile]=useState(false),[showDuplicates,setShowDuplicates]=useState(false);
 const [draft,setDraft]=useState<EcommerceTag|null>(null),[originalTag,setOriginalTag]=useState<EcommerceTag|null>(null);
 const [profile,setProfile]=useState<{sku:string;product:string;color:string;preserve:string;expected:{assetId:string;tag:EcommerceTag}[]}|null>(null);
 const [result,setResult]=useState<RecentAsset|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const groups=groupEcommerceMaterials(materials);
 const group=groups.find(item=>item.sku===activeSku)||groups[0];
 const images=group?uniqueContentMaterials(group.images):[];
 const detail=group?.images.find(item=>item.id===detailId);
 const input='min-h-10 w-full rounded border border-white/15 bg-[var(--beat-surface)] px-2 text-xs';
 function openDetail(item:SavedEcommerceMaterial){setDetailId(item.id);setDraft({...item.tag});setOriginalTag({...item.tag});setError('');}
 function openProfile(){if(!group)return;setShowProfile(true);setProfile({sku:group.sku,product:group.product||'',color:group.color,preserve:group.preserve,expected:group.images.map(item=>({assetId:item.id,tag:{...item.tag}}))});setError('');}
 async function save(body:Record<string,unknown>){
  setBusy(true);setError('');setNotice('');
  try{await flush();await apiJsonPatch('/api/demo/ecommerce-materials',{projectId,...body});await onSaved();setDetailId(null);setProfile(null);setShowProfile(false);setNotice(t('tagsSaved'));}
  catch(cause){setError(cause instanceof Error?cause.message:t('failed'));}finally{setBusy(false);}
 }
 async function remove(body:{assetIds?:string[];sku?:string}){
  if(!onDeleteAssets)return;
  setBusy(true);setError('');setNotice('');
  try{const deleted=await onDeleteAssets(body);if(deleted!==null){setDetailId(null);setResult(null);setShowProfile(false);setNotice(t('assetsDeleted',{count:deleted}));}}
  catch(cause){setError(cause instanceof Error?cause.message:t('failed'));}finally{setBusy(false);}
 }
 return <section aria-label={t('libraryTitle')} className="space-y-3">
  {group&&<label className="block text-xs text-[var(--beat-text-3)]">{t('currentWorkflowSku')}<EcommerceSelect disabled={busy} className={input} value={group.sku} onChange={event=>{onSkuChange(event.target.value);setDetailId(null);setProfile(null);setShowProfile(false);setShowDuplicates(false);setError('');setNotice('');}}>{groups.map(item=><option key={item.sku} value={item.sku}>{skuLabel(item)}</option>)}</EcommerceSelect></label>}
  {onLocateSku&&<button type="button" className="min-h-10 text-xs text-[var(--beat-text-3)] hover:text-white" onClick={onLocateSku}>{t('locateSkuWorkflow')} →</button>}
  <div role="tablist" aria-label={t('libraryViews')} className="grid grid-cols-2 rounded-lg bg-white/5 p-1">{(['references','results']as const).map(value=><button key={value} type="button" role="tab" id={'material-tab-'+value} aria-controls="material-view" aria-selected={tab===value} className={'min-h-10 rounded-md text-xs '+(tab===value?'bg-white/10 text-white':'text-[var(--beat-text-3)]')} onClick={()=>{setTab(value);setDetailId(null);setResult(null);setShowProfile(false);}}>{t(value==='references'?'referenceMaterials':'generatedResults')}</button>)}</div>
  <div id="material-view" role="tabpanel" aria-labelledby={'material-tab-'+tab}>
  {tab==='results'?(result?<div className="space-y-3">
   <button type="button" className="min-h-10 text-xs" onClick={()=>setResult(null)}>← {t('backToResults')}</button>
   <img src={result.publicUrl} alt={result.filename||''} className="max-h-64 w-full rounded-lg bg-white/5 object-contain"/>
   {result.filename&&<p className="break-all text-xs">{result.filename}</p>}
   {onPlaceResult&&<button type="button" disabled={busy||disabled} className="min-h-10 w-full rounded bg-[var(--beat-accent)] text-xs text-black disabled:opacity-40" onClick={()=>onPlaceResult(result)}>{t('placeOnCanvas')}</button>}
   <a href={result.publicUrl} download={result.filename||undefined} className="flex min-h-10 w-full items-center justify-center rounded border border-white/20 text-xs">{t('resizeDownload')}</a>
  </div>:renderResults?.(group?.sku||'',assetId=>void remove({assetIds:[assetId]}),setResult)):!group?<p className="py-6 text-center text-xs text-[var(--beat-text-3)]">{t('libraryEmpty')}</p>:detail?<div className="space-y-3">
   <button type="button" className="min-h-10 text-xs" onClick={()=>setDetailId(null)}>← {t('backToMaterials')}</button>
   <img src={detail.url} alt={detail.filename} className="max-h-64 w-full rounded-lg bg-white/5 object-contain"/>
   <p className="break-all text-xs">{detail.filename}</p>
   {onPlaceMaterial&&<button type="button" disabled={busy||disabled} className="min-h-10 w-full rounded bg-[var(--beat-accent)] text-xs text-black disabled:opacity-40" onClick={()=>onPlaceMaterial(detail)}>{t('placeOnCanvas')}</button>}
   <details className="rounded-lg bg-white/[0.02] p-3"><summary className="cursor-pointer text-xs">{t('imageDetails')}</summary>
    {draft&&originalTag&&<fieldset disabled={busy||disabled} className="mt-3 space-y-3">
     <label className="block text-xs">{t('role')}<EcommerceSelect className={input} value={draft.role==='style'?'style':'product'} onChange={event=>setDraft({...draft,role:event.target.value as EcommerceTag['role']})}>{(['product','style']as const).map(role=><option key={role} value={role}>{t(role)}</option>)}</EcommerceSelect></label>
     <label className="block text-xs">{t('shot')}<EcommerceSelect className={input} value={draft.shot||''} onChange={event=>setDraft({...draft,shot:event.target.value as EcommerceTag['shot']||undefined})}><option value="">{t('shotUnspecified')}</option>{(['front','detail','scene']as const).map(shot=><option key={shot} value={shot}>{t('shot_'+shot)}</option>)}</EcommerceSelect></label>
     <button type="button" className="min-h-10 w-full rounded border border-white/20 text-xs" onClick={()=>void save({assetId:detail.id,tag:draft,expectedTag:originalTag})}>{t('saveTags')}</button>
    </fieldset>}
   </details>
  </div>:<div className="space-y-3">
   <div className="flex items-center justify-between gap-2 text-xs"><span className="text-[var(--beat-text-3)]">{images.length} {t('photoCount')}{!group.product||!group.color||!group.preserve?' · '+t('profileIncomplete'):''}</span><button type="button" className="min-h-10 rounded px-2 hover:bg-white/5" disabled={busy||disabled} onClick={openProfile}>{t('productInfo')} ⚙</button></div>
   {group.conflicting&&<button type="button" disabled={busy||disabled} className="min-h-10 w-full rounded-lg bg-amber-500/10 px-3 text-left text-xs text-amber-300" onClick={openProfile}>{t('profileConflictShort')} →</button>}
   {showProfile&&profile&&<fieldset disabled={busy||disabled} className="space-y-3 rounded-lg border border-white/15 p-3">
    <label className="block text-xs">{t('productName')}<input className={input} maxLength={100} value={profile.product} placeholder={t('productNamePlaceholder')} onChange={event=>setProfile({...profile,product:event.target.value})}/><span className="mt-1 block text-[11px] text-[var(--beat-text-3)]">{t('productNameHint')}</span></label>
    <label className="block text-xs">{t('color')}<input className={input} maxLength={100} value={profile.color} onChange={event=>setProfile({...profile,color:event.target.value})}/></label>
    <label className="block text-xs">{t('preserve')}<textarea className={input+' py-2'} maxLength={1000} value={profile.preserve} onChange={event=>setProfile({...profile,preserve:event.target.value})}/></label>
    <button type="button" className="min-h-10 rounded bg-[var(--beat-accent)] px-3 text-xs text-black" onClick={()=>void save(profile)}>{t('saveProfile')}</button><button type="button" className="min-h-10 px-3 text-xs" onClick={()=>setShowProfile(false)}>{t('cancelEdit')}</button>
   </fieldset>}
   <div className="grid grid-cols-2 gap-3">{(showDuplicates?group.images:images).map(item=><div key={item.id} className="relative min-w-0"><button type="button" title={item.filename} aria-label={t('imageDetails')+' '+item.filename} className="w-full min-w-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] text-left transition-colors hover:border-white/30 focus-visible:ring-2 focus-visible:ring-orange-400" onClick={()=>openDetail(item)}>
    <div className="relative aspect-square bg-white/[0.03]"><img src={item.url} alt={item.filename} className="h-full w-full object-contain" loading="lazy"/><span className="absolute bottom-2 left-2 rounded bg-black/75 px-2 py-1 text-[10px] text-white">{t(item.tag.role==='style'?'styleBadge':'productBadge')}</span></div>
    <p className="truncate px-2 py-2 text-xs">{item.filename.replace(/\.[^.]+$/,'')}</p>
   </button>{onDeleteAssets&&<button type="button" disabled={busy||disabled} aria-label={t('deleteAsset')+' '+item.filename} title={t('deleteAsset')} className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-black/75 text-xs text-white hover:bg-red-500 disabled:opacity-40" onClick={()=>void remove({assetIds:[item.id]})}>×</button>}</div>)}</div>
   {group.images.length>images.length&&<details className="text-xs text-[var(--beat-text-3)]"><summary className="min-h-10 cursor-pointer py-3">{t('moreMaterialOptions')}</summary><button type="button" className="min-h-10 underline" onClick={()=>setShowDuplicates(value=>!value)}>{t(showDuplicates?'hideDuplicateMaterials':'showDuplicateMaterials')} · {group.images.length-images.length}</button></details>}
   {onDeleteAssets&&<button type="button" disabled={busy||disabled} className="min-h-10 w-full text-xs text-red-300/80 hover:text-red-300 disabled:opacity-40" onClick={()=>void remove({sku:group.sku})}>{t('deleteSku',{sku:group.sku})}</button>}
  </div>}
  </div>
  {notice&&<p role="status" className="text-xs leading-6 text-green-300">{notice}</p>}
  {error&&<p role="alert" className="text-xs leading-6 text-red-300">{error}</p>}
 </section>;
}
