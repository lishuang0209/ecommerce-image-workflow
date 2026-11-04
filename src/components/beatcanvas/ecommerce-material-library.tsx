import {useState} from 'react';
import {useTranslations} from '@/core/workspace-lib/shims/next-intl';
import {apiJsonPatch} from '@/lib/api-client';
import type {EcommerceTag} from '@/core/demo/ecommerce-contract';
import {groupEcommerceMaterials,type EcommerceMaterial} from '@/core/demo/ecommerce-profiles';
export type SavedEcommerceMaterial=EcommerceMaterial;

export function EcommerceMaterialLibrary({projectId,materials,onSaved,flush,disabled}:{projectId:string;materials:SavedEcommerceMaterial[];onSaved:()=>Promise<unknown>;flush:()=>Promise<void>;disabled:boolean}){
 const t=useTranslations('AppShell.studio.ecommerce');
 const [editing,setEditing]=useState<string|null>(null),[draft,setDraft]=useState<EcommerceTag|null>(null),[originalTag,setOriginalTag]=useState<EcommerceTag|null>(null);
 const [profile,setProfile]=useState<{sku:string;color:string;preserve:string;expected:{assetId:string;tag:EcommerceTag}[]}|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const input='min-h-10 w-full rounded border border-white/15 bg-[var(--beat-surface)] px-2 text-xs';
 async function save(body:Record<string,unknown>){
  setBusy(true);setError('');setNotice('');
  try{await flush();await apiJsonPatch('/api/demo/ecommerce-materials',{projectId,...body});setEditing(null);setDraft(null);setProfile(null);await onSaved();setNotice(t('tagsSaved'));}
  catch(cause){setError(cause instanceof Error?cause.message:t('failed'));}finally{setBusy(false);}
 }
 return <section aria-label={t('libraryTitle')} className="space-y-3">
  <h3 className="text-sm">{t('libraryTitle')} · {materials.length}</h3>
  <p className="text-xs leading-6 text-[var(--beat-text-3)]">{t('groupedHint')}</p>
  {materials.length===0&&<p className="text-xs text-[var(--beat-text-3)]">{t('libraryEmpty')}</p>}
  {groupEcommerceMaterials(materials).map(group=><section key={group.sku} className="space-y-3 rounded-lg border border-white/15 p-3">
   <h4 className="text-sm">{group.sku} · {group.images.length} {t('photoCount')}</h4>
   {profile?.sku===group.sku?<fieldset disabled={busy||disabled} className="space-y-2">
    <p className="text-xs text-[var(--beat-text-3)]">{t('profileScope')}</p>
    <label className="block text-xs">{t('color')}<input className={input} maxLength={100} value={profile.color} onChange={event=>setProfile({...profile,color:event.target.value})}/></label>
    <label className="block text-xs">{t('preserve')}<textarea className={input+' py-2'} maxLength={1000} value={profile.preserve} onChange={event=>setProfile({...profile,preserve:event.target.value})}/></label>
    <button type="button" className="min-h-10 rounded bg-[var(--beat-accent)] px-3 text-xs text-black" onClick={()=>void save(profile)}>{t('saveProfile')}</button><button type="button" className="min-h-10 px-3 text-xs underline" onClick={()=>setProfile(null)}>{t('cancelEdit')}</button>
   </fieldset>:<div className="space-y-1 text-xs"><p>{t('color')}：{group.color||t('notSet')}</p><p className="whitespace-pre-wrap break-words">{t('preserve')}：{group.preserve||t('notSet')}</p>{group.conflicting&&<p className="text-amber-300">{t('profileConflict')}</p>}<button type="button" disabled={busy||disabled} className="min-h-10 underline disabled:opacity-40" onClick={()=>{setProfile({sku:group.sku,color:group.color,preserve:group.preserve,expected:group.images.map(item=>({assetId:item.id,tag:{...item.tag}}))});setEditing(null);setError('');}}>{t('editProfile')}</button></div>}
   {group.images.map(item=><article key={item.id} className="border-t border-white/10 pt-2">
    <div className="flex gap-3"><a href={item.url} target="_blank" rel="noreferrer" aria-label={t('viewImage')+' '+item.filename}><img src={item.url} alt={item.filename} className="h-16 w-16 rounded object-contain" loading="lazy"/></a><div className="min-w-0 flex-1 text-xs"><p className="break-all">{item.filename}</p><p className="mt-1">{t(item.tag.role==='style'?'style':'product')} · {item.tag.shot?t('shot_'+item.tag.shot):t('notSet')}</p><button type="button" disabled={busy||disabled||!!profile} className="min-h-10 underline disabled:opacity-40" onClick={()=>{setEditing(item.id);setDraft({...item.tag});setOriginalTag({...item.tag});setError('');}}>{t('editPhoto')}</button></div></div>
    {editing===item.id&&draft&&originalTag&&<fieldset disabled={busy||disabled} className="mt-2 space-y-2">
     <label className="block text-xs">{t('role')}<select className={input} value={draft.role==='style'?'style':'product'} onChange={event=>setDraft({...draft,role:event.target.value as EcommerceTag['role']})}>{(['product','style']as const).map(role=><option key={role} value={role}>{t(role)}</option>)}</select></label>
     <label className="block text-xs">{t('shot')}<select className={input} value={draft.shot||''} onChange={event=>setDraft({...draft,shot:event.target.value as EcommerceTag['shot']||undefined})}><option value="">{t('notSet')}</option>{(['front','detail','scene']as const).map(shot=><option key={shot} value={shot}>{t('shot_'+shot)}</option>)}</select></label>
     <button type="button" className="min-h-10 rounded bg-[var(--beat-accent)] px-3 text-xs text-black" onClick={()=>void save({assetId:item.id,tag:draft,expectedTag:originalTag})}>{t('saveTags')}</button><button type="button" className="min-h-10 px-3 text-xs underline" onClick={()=>setEditing(null)}>{t('cancelEdit')}</button>
    </fieldset>}
   </article>)}
  </section>)}
  {notice&&<p role="status" className="text-xs leading-6 text-green-300">{notice}</p>}
  {error&&<p role="alert" className="text-xs leading-6 text-red-300">{error}</p>}
 </section>;
}
