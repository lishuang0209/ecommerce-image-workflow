import {ImagePlus,FileText} from 'lucide-react';
import {EcommerceSelect} from './ecommerce-select';
import type {RecentAsset} from '@/core/workspace-lib/app/workspace-client-api';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {recentAssetsKeys} from '@/core/workspace-lib/app/workspace-query-keys';
import {EcommerceMaterialLibrary,type SavedEcommerceMaterial} from './ecommerce-material-library';
import {EcommerceWorkflowPanel} from './ecommerce-workflow-panel';
import {groupEcommerceMaterials,type EcommerceProfile} from '@/core/demo/ecommerce-profiles';
import {Suspense,lazy,useEffect,useRef,useState,type ChangeEvent} from 'react';
import type {CanvasCard} from '@/core/beatcanvas/canvas-types';
import {uploadLocalProjectAsset} from '@/core/workspace-lib/app/local-project-asset-client';
import {apiJsonPost,apiJsonGet,apiJsonDelete} from '@/lib/api-client';
import {useTranslations} from '@/core/workspace-lib/shims/next-intl';

const ProjectAssetPicker=lazy(()=>import('./beatcanvas-sidebar-panels').then(mod=>({default:mod.HistoryPanel})));
type Material={id:string;file:File;preview:string;sku:string;role:'product'|'style';shot:''|'front'|'detail'|'scene';uploaded:boolean;bound:boolean;selected:boolean};
export function EcommerceMaterialPanel({projectId,cards,flush,runTask,onCreateNode,onInsertAsset,onSavedSnapshot,onLocateSku,onLocateCard}:{onLocateCard?:(id:string)=>void;onLocateSku?:(sku:string)=>void;onSavedSnapshot:(document:import('@/core/projects/project-snapshot').ProjectSnapshotDocument,version:number)=>void;onCreateNode?:(type:'image'|'text')=>void;onInsertAsset?:(asset:RecentAsset&{mediaType:'image'|'video'|'audio'})=>void;projectId:string;cards:Record<string,CanvasCard>;flush:()=>Promise<void>;runTask:(id:string)=>Promise<boolean>}){
 const t=useTranslations('AppShell.studio.ecommerce');
 const [panel,setPanel]=useState<'library'|'import'|'workflow'|'nodes'|null>(cards['ecommerce-start']?'import':null);
 const library=useQuery({queryKey:['ecommerce-materials',projectId],queryFn:()=>apiJsonGet<{materials:SavedEcommerceMaterial[]}>(`/api/demo/ecommerce-materials?projectId=${encodeURIComponent(projectId)}`),enabled:panel!==null,refetchOnWindowFocus:true});
 const [workflowSku,setWorkflowSku]=useState('');
 const queryClient=useQueryClient();
 async function deleteAssets(body:{assetIds?:string[];sku?:string}){
  if(!window.confirm(body.sku?t('deleteSkuConfirm',{sku:body.sku}):t('deleteAssetsConfirm')))return null;
  await flush();
  type Result={deleted:number;inUse:number;document:import('@/core/projects/project-snapshot').ProjectSnapshotDocument;version:number};
  let result=await apiJsonDelete<Result>('/api/demo/ecommerce-materials',{projectId,...body});
  if(result.inUse){
   if(!window.confirm(t('deleteInUseConfirm',{count:result.inUse})))return null;
   result=await apiJsonDelete<Result>('/api/demo/ecommerce-materials',{projectId,...body,removeFromCanvas:true});
  }
  onSavedSnapshot(result.document,result.version);
  await Promise.all([library.refetch(),queryClient.invalidateQueries({queryKey:recentAssetsKeys.lists(projectId)})]);
  return result.deleted;
 }
 const [importSkuTouched,setImportSkuTouched]=useState(false);
 const [profiles,setProfiles]=useState<Record<string,EcommerceProfile>>({});
 const [sku,setSku]=useState(''),[newSku,setNewSku]=useState(''),[color,setColor]=useState(''),[preserve,setPreserve]=useState(''),[product,setProduct]=useState('');
 const role='product' as const,shot='' as const;
 const [files,setFiles]=useState<Material[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const previews=useRef(new Set<string>());
 useEffect(()=>()=>{for(const url of previews.current)URL.revokeObjectURL(url);},[]);
 const savedGroups=groupEcommerceMaterials(library.data?.materials||[]);
 const currentProductSku=workflowSku||savedGroups.find(group=>Object.values(cards).some(card=>card.kind==='text'&&/^sku-[a-f0-9]{16}-facts$/.test(card.id)&&card.name.split(' · ').slice(0,-1).join(' · ')===group.sku))?.sku||savedGroups[0]?.sku||'';
 useEffect(()=>{if(panel==='import'&&!importSkuTouched&&!sku&&!newSku&&currentProductSku)setSku(currentProductSku);},[panel,importSkuTouched,sku,newSku,currentProductSku]);
 const allProfiles={...profiles,...Object.fromEntries(savedGroups.map(group=>[group.sku,group]))};
 const active=allProfiles[sku];
 function update(id:string,patch:Partial<Material>){setFiles(current=>current.map(item=>item.id===id?{...item,...patch}:item));}
 function remove(id:string){const item=files.find(item=>item.id===id);if(item){URL.revokeObjectURL(item.preview);previews.current.delete(item.preview);}setFiles(current=>current.filter(item=>item.id!==id));}
 async function importFiles(){
  setBusy(true);setError('');setNotice('');
  try{
   const target=sku||newSku.trim();
   if(!target)throw new Error(t('selectSkuFirst'));
   const frozenSku=files.find(item=>item.uploaded)?.sku;
   if(frozenSku&&frozenSku!==target)throw new Error(t('missingSku'));
   if(!sku&&frozenSku!==target&&savedGroups.some(group=>group.sku===target))throw new Error(t('skuExists'));
   const importProfiles=sku?allProfiles:{...allProfiles,[target]:{sku:target,product:product.trim(),color:color.trim(),preserve:preserve.trim(),conflicting:false}};
   if(!sku)setProfiles(current=>({...current,[target]:importProfiles[target]}));
   for(const item of files){if(!item.uploaded)item.sku=target;}
   if(files.some(item=>!importProfiles[item.sku]))throw new Error(t('missingSku'));
   if(files.some(item=>importProfiles[item.sku].conflicting))throw new Error(t('profileConflict'));
   await flush();
   let reused=0;
   for(const item of files){
    const profile=importProfiles[item.sku];
    if(!item.uploaded){const saved=await uploadLocalProjectAsset({projectId,file:item.file,metadata:{ecommerce:{sku:item.sku,...(profile.product?{product:profile.product}:{}),role:item.role,shot:item.shot||undefined,color:profile.color,preserve:profile.preserve}}});if(saved.reused)reused++;item.uploaded=true;update(item.id,{uploaded:true});}
   }
   let allHaveProduct=true;
   for(const name of new Set(files.filter(item=>!item.bound).map(item=>item.sku))){
    const result=await apiJsonPost<{hasProduct:boolean;document:import('@/core/projects/project-snapshot').ProjectSnapshotDocument;version:number}>('/api/demo/ecommerce-materials',{projectId,sku:name});onSavedSnapshot(result.document,result.version);allHaveProduct=allHaveProduct&&result.hasProduct;
    for(const item of files.filter(item=>item.sku===name)){item.bound=true;update(item.id,{bound:true});}
   }
   for(const item of files){URL.revokeObjectURL(item.preview);previews.current.delete(item.preview);}
   setWorkflowSku(target);setSku(target);setNewSku('');setColor('');setPreserve('');setProduct('');setFiles([]);await library.refetch();setNotice((allHaveProduct?t('saved'):t('needsProduct'))+(reused?' '+t('duplicateImportsReused')+' '+reused:''));setPanel('workflow');
  }catch(cause){setError(cause instanceof Error?cause.message:t('failed'));}finally{setBusy(false);}
 }
 function addFiles(incoming:File[]){
  const valid=incoming.filter(file=>file.size>0&&file.size<=10*1024*1024&&['image/png','image/jpeg','image/webp'].includes(file.type));
  setError(valid.length!==incoming.length?t('fileLimit'):'');
  const next=[...files];
  for(const file of valid){if(next.some(item=>item.file.name===file.name&&item.file.size===file.size&&item.file.lastModified===file.lastModified))continue;const preview=URL.createObjectURL(file);previews.current.add(preview);next.push({id:crypto.randomUUID(),file,preview,sku,role,shot,uploaded:false,bound:false,selected:true});}
  setFiles(next);
 }
 function chooseFiles(event:ChangeEvent<HTMLInputElement>){addFiles(Array.from(event.target.files||[]));event.target.value='';}
 const input='min-h-10 w-full rounded border border-white/15 bg-[var(--beat-surface)] px-2 text-xs';
 const importTarget=sku||newSku.trim();
 const partiallySaved=files.some(item=>item.uploaded);
 function choosePanel(value:'library'|'import'|'workflow'|'nodes'){if(value==='import'&&!files.length&&!newSku){setImportSkuTouched(false);setSku(currentProductSku);}setPanel(current=>current===value?null:value);}
 const skuOptions=Object.values(allProfiles).map(profile=><option key={profile.sku} value={profile.sku}>{profile.sku}</option>);
 return <div className="pointer-events-auto absolute left-4 top-4 z-40 w-[440px] max-w-[calc(100%_-_32px)] text-[var(--beat-text-1)]">
  <nav aria-label={t('canvasTools')} className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-white/15 bg-[var(--beat-surface)] p-1 shadow-lg">
   {(['library','import','workflow','nodes']as const).map(value=><button key={value} type="button" aria-expanded={panel===value} aria-controls="ecommerce-tool-panel" className={'min-h-10 rounded-lg px-3 text-xs transition-colors '+(panel===value?'bg-white/10 text-white':'text-[var(--beat-text-2)] hover:bg-white/5')} onClick={()=>choosePanel(value)}>{t(value==='library'?'libraryEntry':value==='import'?'importEntry':value==='nodes'?'addNode':'workflowTab')}</button>)}

  </nav>
  {panel&&<section id="ecommerce-tool-panel" aria-label={t(panel==='library'?'libraryEntry':panel==='import'?'importEntry':panel==='nodes'?'addNode':'workflowTab')} className="mt-2 max-h-[70vh] space-y-3 overflow-auto rounded-xl border border-white/15 bg-[var(--beat-surface)] p-4 shadow-xl">
   <header className="flex items-center justify-between pb-2"><h2 className="text-sm">{t(panel==='library'?'libraryEntry':panel==='import'?'importEntry':panel==='nodes'?'addNode':'workflowTab')}</h2><button type="button" aria-label={t('closeToolPanel')} className="min-h-10 px-2 text-xs text-[var(--beat-text-3)] hover:text-white" onClick={()=>setPanel(null)}>{t('closeToolPanel')} ×</button></header>
   <div hidden={panel==='workflow'||panel==='nodes'}>
    {library.isLoading&&<p role="status" className="text-xs">{t('loadingMaterials')}</p>}
    {library.error&&<p role="alert" className="text-xs text-red-300">{library.error.message}<button type="button" className="min-h-10 px-2 underline" onClick={()=>void library.refetch()}>{t('reloadMaterials')}</button></p>}
    <div hidden={panel!=='library'}>
    {library.data&&<EcommerceMaterialLibrary activeSku={currentProductSku} onSkuChange={setWorkflowSku} onLocateSku={onLocateSku?()=>onLocateSku(currentProductSku):undefined} projectId={projectId} materials={library.data.materials} onSaved={()=>library.refetch()} flush={flush} disabled={busy} onDeleteAssets={deleteAssets} onPlaceMaterial={onInsertAsset?item=>{onInsertAsset({id:item.id,publicUrl:item.url,filename:item.filename,width:null,height:null,createdAt:'',mediaType:'image'});setPanel(null);}:undefined} onPlaceResult={onInsertAsset?asset=>{onInsertAsset({...asset,mediaType:'image'});setPanel(null);}:undefined} renderResults={(sku,onDelete,onOpen)=>onInsertAsset?<Suspense fallback={<p className="text-xs">{t('loadingMaterials')}</p>}><ProjectAssetPicker projectId={projectId} skuFilter={sku||undefined} excludeAssetIds={(library.data?.materials||[]).map(item=>item.id)} onDeleteAsset={asset=>onDelete(asset.id)} onSelectAsset={asset=>{if(asset.mediaType==='image')onOpen(asset);else{onInsertAsset(asset);setPanel(null);}}}/></Suspense>:null}/>}
    <button type="button" className="mt-3 min-h-10 w-full rounded border border-white/20 text-xs" onClick={()=>choosePanel('import')}>{t('importEntry')}</button>
    </div>
    <div hidden={panel!=='import'} className="space-y-3">
     <fieldset disabled={busy} className="space-y-3">
      <div className="rounded-xl border border-dashed border-white/25 bg-white/[0.03] p-4 text-center" onDragOver={event=>{event.preventDefault();event.stopPropagation();}} onDrop={event=>{event.preventDefault();event.stopPropagation();if(!busy)addFiles(Array.from(event.dataTransfer.files));}}>
       <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg focus-within:ring-2 focus-within:ring-orange-400"><span className="text-2xl text-[var(--beat-text-3)]">＋</span><span className="text-sm">{t(files.length?'addMoreImages':'chooseImagesFirst')}</span><input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={chooseFiles}/></label>
       <p className="mt-2 text-[11px] text-[var(--beat-text-3)]">{t('uploadLimitsShort')}</p>
      </div>
      {files.length>0&&<div className="grid grid-cols-2 gap-3">{files.map(item=><div key={item.id} className="relative min-w-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
       <img src={item.preview} alt={item.file.name} className="aspect-square w-full object-contain"/>
       <button type="button" aria-label={t('remove')+' '+item.file.name} className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-black/70 text-white" onClick={()=>remove(item.id)}>×</button>
       <p title={item.file.name} className="truncate px-2 py-2 text-xs">{item.file.name}</p>
       {item.uploaded?<p className="px-2 pb-2 text-[11px] text-green-300">{t('uploadedLocal')}</p>:<details className="px-2 pb-2 text-xs text-[var(--beat-text-3)]"><summary className="min-h-9 cursor-pointer py-2">{t(item.role==='style'?'styleBadge':'importedBadge')} · {t('imageSettingsShort')}</summary>
        <label className="block">{t('role')}<EcommerceSelect className={input} value={item.role} onChange={event=>update(item.id,{role:event.target.value as Material['role']})}>{(['product','style']as const).map(value=><option key={value} value={value}>{t(value==='product'?'importedBadge':'styleBadge')}</option>)}</EcommerceSelect></label>
        <label className="mt-2 block">{t('shot')}<EcommerceSelect className={input} value={item.shot} onChange={event=>update(item.id,{shot:event.target.value as Material['shot']})}><option value="">{t('shotUnspecified')}</option>{(['front','detail','scene']as const).map(value=><option key={value} value={value}>{t('shot_'+value)}</option>)}</EcommerceSelect></label>
       </details>}
      </div>)}</div>}
      <fieldset disabled={partiallySaved} className="space-y-3">
       <label className="block text-xs">{t('chooseSku')}<EcommerceSelect className={input} value={sku} onChange={event=>{setImportSkuTouched(true);setSku(event.target.value);setError('');}}><option value="">{t('newSku')}</option>{skuOptions}</EcommerceSelect></label>
       {!sku?<div className="space-y-3"><label className="block text-xs">{t('productName')}<input className={input} maxLength={100} list="ecommerce-product-names" value={product} onChange={event=>setProduct(event.target.value)} placeholder={t('productNamePlaceholder')}/><datalist id="ecommerce-product-names">{[...new Set(savedGroups.map(group=>group.product).filter(Boolean))].map(name=><option key={name} value={name}/>)}</datalist><span className="mt-1 block text-[11px] text-[var(--beat-text-3)]">{t('productNameHint')}</span></label><label className="block text-xs">{t('shortSkuName')}<input className={input} maxLength={100} value={newSku} onChange={event=>setNewSku(event.target.value)} placeholder={t('skuPlaceholder')}/><span className="mt-1 block text-[11px] text-[var(--beat-text-3)]">{t('skuHelp')}</span></label>
        <details className="rounded-lg bg-white/[0.02] p-3"><summary className="cursor-pointer text-xs text-[var(--beat-text-3)]">{t('optionalProductInfo')}</summary><div className="mt-3 space-y-3"><label className="block text-xs">{t('color')}<input className={input} maxLength={100} value={color} onChange={event=>setColor(event.target.value)} placeholder={t('colorExample')}/></label><label className="block text-xs">{t('preserve')}<textarea className={input+' py-2'} maxLength={1000} value={preserve} placeholder={t('preserveHint')} onChange={event=>setPreserve(event.target.value)}/></label></div></details>
       </div>:active?.conflicting?<p className="text-xs text-amber-300">{t('profileConflictShort')}</p>:<p className="text-[11px] text-[var(--beat-text-3)]">{t('existingInfoReused')}</p>}
      </fieldset>
     </fieldset>
     <div className="sticky -bottom-4 z-10 space-y-2 bg-[var(--beat-surface)] py-3">
      <p className="truncate text-xs text-[var(--beat-text-3)]">{files.length} {t('photoCount')} · {importTarget||t('chooseSkuBeforeImport')}</p>
      <button type="button" disabled={busy||!files.length||!importTarget||!!active?.conflicting} onClick={()=>void importFiles()} className="min-h-11 w-full rounded-lg bg-[var(--beat-accent)] px-3 text-sm font-medium text-black disabled:opacity-40">{busy?t('importingImages'):t('confirmImageImport')+' · '+files.length}</button>
      {notice&&<button type="button" className="min-h-10 w-full text-xs" onClick={()=>setPanel('library')}>{t('viewImportedImages')} →</button>}
     </div>

    </div>
    {notice&&<p role="status" className="text-xs leading-6 text-green-300">{notice}</p>}{error&&<p role="alert" className="text-xs leading-6 text-red-300">{error}</p>}
   </div>
   {panel==='nodes'&&<div className="grid grid-cols-2 gap-3">{(['image','text']as const).map(type=>{const Icon=type==='image'?ImagePlus:FileText;const label=t(type==='image'?'addImageNode':'addTextNode');return <button key={type} type="button" title={label} aria-label={label} disabled={!onCreateNode} className="group flex min-h-28 flex-col items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-4 text-[var(--beat-text-2)] transition-colors duration-150 hover:border-orange-400/40 hover:bg-orange-400/[0.06] hover:text-white active:bg-orange-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--beat-surface)] disabled:cursor-not-allowed disabled:opacity-40" onClick={()=>{onCreateNode?.(type);setPanel(null);}}><span className="flex size-12 items-center justify-center rounded-xl bg-white/5 transition-colors group-hover:bg-orange-400/10 group-hover:text-orange-400"><Icon aria-hidden="true" className="size-6" strokeWidth={1.6}/></span><span className="text-xs font-medium">{label}</span></button>;})}</div>}

   <div hidden={panel!=='workflow'}><EcommerceWorkflowPanel skuProducts={Object.fromEntries(savedGroups.map(group=>[group.sku,group.product||'']))} onLocatePrompt={onLocateCard} onSavedSnapshot={onSavedSnapshot} materialSkus={savedGroups.map(group=>group.sku)} activeSku={currentProductSku} onSkuChange={setWorkflowSku} projectId={projectId} cards={cards} flush={flush} runTask={runTask}/></div>
  </section>}
 </div>;
}
