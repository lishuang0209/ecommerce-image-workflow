import {useState} from 'react';
import {useTranslations} from '@/core/workspace-lib/shims/next-intl';
import type {CanvasCard} from '@/core/beatcanvas/canvas-types';
import {resolveSceneMainAdoption} from '@/core/demo/scene-main-adoption';
export function EcommerceSceneMainControl({scene,cards,onAdopt,disabled}:{scene:CanvasCard;cards:Record<string,CanvasCard>;onAdopt?:(sceneId:string,assetId:string)=>Promise<void>;disabled:boolean}){
 const t=useTranslations('AppShell.studio.ecommerce');
 const state=resolveSceneMainAdoption(scene,cards);
 const [chosen,setChosen]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 if(!state)return null;
 const selected=state.images.find(image=>image.assetId===(chosen||state.selectedAssetId));
 const adopted=state.ready&&selected?.assetId===state.adoptedAssetId;
 async function adopt(){if(!selected||!onAdopt)return;setBusy(true);setError('');try{await onAdopt(scene.id,selected.assetId);}catch(cause){setError(cause instanceof Error?cause.message:t('failed'));}finally{setBusy(false);}}
 return <div className="mx-3.5 mt-3 space-y-2 rounded-lg border border-white/15 bg-white/[0.03] p-3" aria-label={t('sceneMainTitle')}>
  <div className="flex items-center gap-3">{selected&&<img src={selected.url} alt={t('sceneMainTitle')} className="h-14 w-14 rounded bg-white object-contain"/>}<div className="min-w-0 flex-1 space-y-1"><p className="text-xs font-medium">{adopted?t('sceneMainReady'):t('sceneMainTitle')}</p><p className="text-xs leading-5 text-[var(--beat-text-3)]">{state.images.length?t('sceneMainHint'):t('sceneMainMissing')}</p></div>
   {!adopted&&selected&&<button type="button" disabled={busy||disabled||!onAdopt} className="min-h-10 shrink-0 rounded bg-[var(--beat-accent)] px-3 text-xs text-black disabled:opacity-40" onClick={()=>void adopt()}>{busy?t('busy'):t('adoptThisMain')}</button>}
  </div>
  {state.images.length>1&&<label className="block text-xs">{t('chooseMain')}<select disabled={busy||disabled} className="mt-1 min-h-9 w-full rounded border border-white/15 bg-[var(--beat-surface)] px-2 text-xs" value={selected?.assetId||''} onChange={event=>{setChosen(event.target.value);setError('');}}>{state.images.map((image,index)=><option key={image.assetId} value={image.assetId}>{t('version')} {index+1}{image.connected?' · '+t('connectedMain'):''}</option>)}</select></label>}
  {error&&<p role="alert" className="text-xs text-red-300">{error}</p>}
 </div>;
}
