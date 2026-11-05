import type {RecentAsset} from '@/core/workspace-lib/app/workspace-client-api';
import {useQuery} from '@tanstack/react-query';
import {EcommerceMaterialLibrary,type SavedEcommerceMaterial} from './ecommerce-material-library';
import {EcommerceWorkflowPanel} from './ecommerce-workflow-panel';
import {groupEcommerceMaterials,type EcommerceProfile} from '@/core/demo/ecommerce-profiles';
import {Suspense,lazy,useEffect,useRef,useState,type ChangeEvent} from 'react';
import type {CanvasCard} from '@/core/beatcanvas/canvas-types';
import {uploadLocalProjectAsset} from '@/core/workspace-lib/app/local-project-asset-client';
import {apiJsonPost,apiJsonGet} from '@/lib/api-client';
import {useTranslations} from '@/core/workspace-lib/shims/next-intl';

const ProjectAssetPicker=lazy(()=>import('./beatcanvas-sidebar-panels').then(mod=>({default:mod.HistoryPanel})));
type Material={id:string;file:File;preview:string;sku:string;role:'product'|'style';shot:''|'front'|'detail'|'scene';uploaded:boolean;bound:boolean;selected:boolean};
export function EcommerceMaterialPanel({projectId,cards,flush,runTask,onCreateNode,onInsertAsset}:{onCreateNode?:(type:'image'|'text')=>void;onInsertAsset?:(asset:RecentAsset&{mediaType:'image'|'video'|'audio'})=>void;projectId:string;cards:Record<string,CanvasCard>;flush:()=>Promise<void>;runTask:(id:string)=>Promise<boolean>}){
 const t=useTranslations('AppShell.studio.ecommerce');
 const [panel,setPanel]=useState<'library'|'import'|'workflow'|'nodes'|null>(cards['ecommerce-start']?'import':null);
 const library=useQuery({queryKey:['ecommerce-materials',projectId],queryFn:()=>apiJsonGet<{materials:SavedEcommerceMaterial[]}>(`/api/demo/ecommerce-materials?projectId=${encodeURIComponent(projectId)}`),enabled:panel!==null,refetchOnWindowFocus:true});
 const [workflowSku,setWorkflowSku]=useState('');
 const [profiles,setProfiles]=useState<Record<string,EcommerceProfile>>({});
 const [sku,setSku]=useState(''),[newSku,setNewSku]=useState(''),[color,setColor]=useState(''),[preserve,setPreserve]=useState('');
 const [role,setRole]=useState<'product'|'style'>('product'),[shot,setShot]=useState<''|'front'|'detail'|'scene'>('');
 const [files,setFiles]=useState<Material[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const previews=useRef(new Set<string>());
 useEffect(()=>()=>{for(const url of previews.current)URL.revokeObjectURL(url);},[]);
 const savedGroups=groupEcommerceMaterials(library.data?.materials||[]);
 const allProfiles={...profiles,...Object.fromEntries(savedGroups.map(group=>[group.sku,group]))};
 const active=allProfiles[sku];
 function update(id:string,patch:Partial<Material>){setFiles(current=>current.map(item=>item.id===id?{...item,...patch}:item));}
 function remove(id:string){const item=files.find(item=>item.id===id);if(item){URL.revokeObjectURL(item.preview);previews.current.delete(item.preview);}setFiles(current=>current.filter(item=>item.id!==id));}
 function createSku(){
  const name=newSku.trim();if(!name)return;
  if(allProfiles[name]){setError(t('skuExists'));return;}
  setProfiles(current=>({...current,[name]:{sku:name,color:color.trim(),preserve:preserve.trim(),conflicting:false}}));
  setSku(name);setNewSku('');setColor('');setPreserve('');setError('');
 }
 async function importFiles(){
  setBusy(true);setError('');setNotice('');
  try{
   if(files.some(item=>!allProfiles[item.sku]))throw new Error(t('missingSku'));
   if(files.some(item=>allProfiles[item.sku].conflicting))throw new Error(t('profileConflict'));
   await flush();
   for(const item of files){
    const profile=allProfiles[item.sku];
    if(!item.uploaded){await uploadLocalProjectAsset({projectId,file:item.file,metadata:{ecommerce:{sku:item.sku,role:item.role,shot:item.shot||undefined,color:profile.color,preserve:profile.preserve}}});item.uploaded=true;update(item.id,{uploaded:true});}
   }
   let allHaveProduct=true;
   for(const name of new Set(files.filter(item=>!item.bound).map(item=>item.sku))){
    const result=await apiJsonPost<{hasProduct:boolean}>('/api/demo/ecommerce-materials',{projectId,sku:name});allHaveProduct=allHaveProduct&&result.hasProduct;
    for(const item of files.filter(item=>item.sku===name)){item.bound=true;update(item.id,{bound:true});}
   }
   for(const item of files){URL.revokeObjectURL(item.preview);previews.current.delete(item.preview);}
   setWorkflowSku(files[files.length-1]?.sku||sku);setFiles([]);await library.refetch();setNotice(allHaveProduct?t('saved'):t('needsProduct'));
  }catch(cause){setError(cause instanceof Error?cause.message:t('failed'));}finally{setBusy(false);}
 }
 function addFiles(incoming:File[]){
  if(!active){setError(t('selectSkuFirst'));return;}
  const valid=incoming.filter(file=>file.size>0&&file.size<=10*1024*1024&&['image/png','image/jpeg','image/webp'].includes(file.type));
  setError(valid.length!==incoming.length?t('fileLimit'):'');
  const next=[...files];
  for(const file of valid){if(next.some(item=>item.file.name===file.name&&item.file.size===file.size&&item.file.lastModified===file.lastModified))continue;const preview=URL.createObjectURL(file);previews.current.add(preview);next.push({id:crypto.randomUUID(),file,preview,sku,role,shot,uploaded:false,bound:false,selected:true});}
  setFiles(next);
 }
 function chooseFiles(event:ChangeEvent<HTMLInputElement>){addFiles(Array.from(event.target.files||[]));event.target.value='';}
 const input='min-h-10 w-full rounded border border-white/15 bg-[var(--beat-surface)] px-2 text-xs';
 const skuOptions=Object.values(allProfiles).map(profile=><option key={profile.sku} value={profile.sku}>{profile.sku}</option>);
 return <div className="pointer-events-auto absolute left-4 top-4 z-40 w-[440px] max-w-[calc(100%_-_32px)] text-[var(--beat-text-1)]">
  <nav aria-label={t('canvasTools')} className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-white/15 bg-[var(--beat-surface)] p-1 shadow-lg">
   {(['library','import','workflow','nodes']as const).map(value=><button key={value} type="button" aria-expanded={panel===value} aria-controls="ecommerce-tool-panel" className={'min-h-10 rounded-lg px-3 text-xs transition-colors '+(panel===value?'bg-white/10 text-white':'text-[var(--beat-text-2)] hover:bg-white/5')} onClick={()=>setPanel(current=>current===value?null:value)}>{t(value==='library'?'libraryEntry':value==='import'?'importEntry':value==='nodes'?'addNode':'workflowTab')}</button>)}

  </nav>
  {panel&&<section id="ecommerce-tool-panel" aria-label={t(panel==='library'?'libraryEntry':panel==='import'?'importEntry':panel==='nodes'?'addNode':'workflowTab')} className="mt-2 max-h-[70vh] space-y-3 overflow-auto rounded-xl border border-white/15 bg-[var(--beat-surface)] p-4 shadow-xl">
   <header className="flex items-center justify-between border-b border-white/10 pb-2"><h2 className="text-sm">{t(panel==='library'?'libraryEntry':panel==='import'?'importEntry':panel==='nodes'?'addNode':'workflowTab')}</h2><button type="button" aria-label={t('closeToolPanel')} className="min-h-10 px-2 text-xs text-[var(--beat-text-3)] hover:text-white" onClick={()=>setPanel(null)}>{t('closeToolPanel')} ×</button></header>
   <div hidden={panel==='workflow'||panel==='nodes'}>
    {library.isLoading&&<p role="status" className="text-xs">{t('loadingMaterials')}</p>}
    {library.error&&<p role="alert" className="text-xs text-red-300">{library.error.message}<button type="button" className="min-h-10 px-2 underline" onClick={()=>void library.refetch()}>{t('reloadMaterials')}</button></p>}
    <div hidden={panel!=='library'}>
    {library.data&&<EcommerceMaterialLibrary projectId={projectId} materials={library.data.materials} onSaved={()=>library.refetch()} flush={flush} disabled={busy}/>}
    {panel==='library'&&library.data&&onInsertAsset&&<Suspense fallback={<p className="text-xs">{t('loadingMaterials')}</p>}><ProjectAssetPicker projectId={projectId} excludeAssetIds={(library.data?.materials||[]).map(item=>item.id)} heading={t('otherProjectAssets')} onSelectAsset={asset=>{onInsertAsset(asset);setPanel(null);}}/></Suspense>}
    <button type="button" className="mt-3 min-h-10 w-full rounded border border-white/20 text-xs" onClick={()=>setPanel('import')}>{t('importEntry')}</button>
    </div>
    <div hidden={panel!=='import'} className="space-y-3">
     <fieldset disabled={busy} className="space-y-3">
      <h3 className="text-sm">{t('productStep')}</h3><p className="text-xs leading-6 text-[var(--beat-text-3)]">{t('profileScope')}</p>
      <label className="block text-xs">{t('chooseSku')}<select className={input} value={sku} onChange={event=>setSku(event.target.value)}><option value="">{t('newSku')}</option>{skuOptions}</select></label>
      {!sku?<div className="space-y-2 rounded border border-white/15 p-3">
       <label className="block text-xs">{t('sku')}<input className={input} maxLength={100} value={newSku} onChange={event=>setNewSku(event.target.value)} placeholder={t('skuPlaceholder')}/></label><p className="text-xs text-[var(--beat-text-3)]">{t('skuHelp')}</p>
       <label className="block text-xs">{t('color')}<input className={input} maxLength={100} value={color} onChange={event=>setColor(event.target.value)} placeholder={t('colorExample')}/></label>
       <label className="block text-xs">{t('preserve')}<textarea className={input+' py-2'} maxLength={1000} value={preserve} placeholder={t('preserveHint')} onChange={event=>setPreserve(event.target.value)}/></label>
       <button type="button" disabled={!newSku.trim()} className="min-h-10 rounded border border-white/20 px-3 text-xs disabled:opacity-40" onClick={createSku}>{t('useSku')}</button><p className="text-xs text-[var(--beat-text-3)]">{t('profileWillSave')}</p>
      </div>:active&&<div className="space-y-1 rounded border border-white/15 p-3 text-xs"><p>{t('color')}：{active.color||t('notSet')}</p><p className="whitespace-pre-wrap">{t('preserve')}：{active.preserve||t('notSet')}</p>{profiles[sku]&&!savedGroups.some(group=>group.sku===sku)&&<button type="button" className="min-h-10 underline" onClick={()=>{setNewSku(sku);setColor(active.color);setPreserve(active.preserve);setSku('');setProfiles(current=>{const next={...current};delete next[sku];return next;});}}>{t('editDraftProfile')}</button>}</div>}
      <p className="text-xs leading-6 text-[var(--beat-text-3)]">{t('defaultPhotoHint')}</p>
      <details className="space-y-2 rounded border border-white/15 p-3"><summary className="cursor-pointer text-xs">{t('optionalPhotoSettings')}</summary>
      <label className="block text-xs">{t('role')}<select className={input} value={role} onChange={event=>setRole(event.target.value as typeof role)}>{(['product','style']as const).map(value=><option key={value} value={value}>{t(value)}</option>)}</select></label>
      <label className="block text-xs">{t('shot')}<select className={input} value={shot} onChange={event=>setShot(event.target.value as typeof shot)}><option value="">{t('shotUnspecified')}</option>{(['front','detail','scene']as const).map(value=><option key={value} value={value}>{t('shot_'+value)}</option>)}</select></label>
      <button type="button" className="min-h-10 text-xs underline disabled:opacity-40" disabled={!active||!files.some(item=>item.selected&&!item.uploaded)} onClick={()=>setFiles(current=>current.map(item=>item.selected&&!item.uploaded?{...item,sku,role,shot}:item))}>{t('applyPhotoFields')}</button>
      </details>
      <div className="rounded-lg border border-dashed border-white/25 p-3" onDragOver={event=>{event.preventDefault();event.stopPropagation();}} onDrop={event=>{event.preventDefault();event.stopPropagation();if(!busy)addFiles(Array.from(event.dataTransfer.files));}}><label className="block text-xs">{t('appendFiles')}<input disabled={!active} className="mt-2 block w-full text-xs" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={chooseFiles}/></label><p className="mt-2 text-xs text-[var(--beat-text-3)]">{active?t('dropHint'):t('selectSkuFirst')}</p></div>
      {files.length>0&&<div className="space-y-2"><p className="text-xs">{t('queue')} · {files.length}</p>{files.map(item=><div key={item.id} className="space-y-2 rounded-lg border border-white/15 p-2">
       <div className="flex items-center gap-2"><input type="checkbox" aria-label={t('selectImage')+' '+item.file.name} checked={item.selected} disabled={item.uploaded} onChange={event=>update(item.id,{selected:event.target.checked})}/><img src={item.preview} alt={item.file.name} className="h-14 w-14 rounded object-contain"/><span className="min-w-0 flex-1 break-all text-xs">{item.file.name}{item.uploaded?' · '+t('uploadedLocal'):''}</span><button type="button" className="min-h-10 px-2 text-xs underline" onClick={()=>remove(item.id)}>{t('remove')}</button></div>
       <details className="space-y-2"><summary className="cursor-pointer text-xs text-[var(--beat-text-3)]">{item.sku} · {t(item.role)} · {t('editPhotoSettings')}</summary>
       <label className="block text-xs">{t('chooseSku')}<select className={input} disabled={item.uploaded} value={item.sku} onChange={event=>update(item.id,{sku:event.target.value})}>{skuOptions}</select></label>
       <label className="block text-xs">{t('role')}<select className={input} disabled={item.uploaded} value={item.role} onChange={event=>update(item.id,{role:event.target.value as typeof role})}>{(['product','style']as const).map(value=><option key={value} value={value}>{t(value)}</option>)}</select></label>
       <label className="block text-xs">{t('shot')}<select className={input} disabled={item.uploaded} value={item.shot} onChange={event=>update(item.id,{shot:event.target.value as typeof shot})}><option value="">{t('shotUnspecified')}</option>{(['front','detail','scene']as const).map(value=><option key={value} value={value}>{t('shot_'+value)}</option>)}</select></label>
       </details>
      </div>)}</div>}
     </fieldset>
     <button type="button" disabled={busy||!files.length} onClick={()=>void importFiles()} className="min-h-10 w-full rounded bg-[var(--beat-accent)] px-3 text-xs font-medium text-black disabled:opacity-40">{t('import')} · {files.length}</button>
    </div>
    {notice&&<p role="status" className="text-xs leading-6 text-green-300">{notice}</p>}{error&&<p role="alert" className="text-xs leading-6 text-red-300">{error}</p>}
   </div>
   {panel==='nodes'&&<div className="space-y-2"><p className="text-xs leading-6 text-[var(--beat-text-3)]">{t('addNodeHint')}</p>{(['image','text']as const).map(type=><button key={type} type="button" className="min-h-10 w-full rounded border border-white/20 text-xs" onClick={()=>{onCreateNode?.(type);setPanel(null);}}>{t(type==='image'?'addImageNode':'addTextNode')}</button>)}</div>}
   <div hidden={panel!=='workflow'}><EcommerceWorkflowPanel activeSku={workflowSku} onSkuChange={setWorkflowSku} projectId={projectId} cards={cards} flush={flush} runTask={runTask}/></div>
  </section>}
 </div>;
}
