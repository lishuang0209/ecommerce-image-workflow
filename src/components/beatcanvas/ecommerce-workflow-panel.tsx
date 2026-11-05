import { useState } from 'react';
import type { CanvasCard } from '@/core/beatcanvas/canvas-types';
import { apiJsonPost } from '@/lib/api-client';
import { useTranslations } from '@/core/workspace-lib/shims/next-intl';
import { ecommerceTaskPattern } from '@/core/demo/ecommerce-contract';
import { runTasksInOrder } from '@/core/demo/serial-tasks';

export function EcommerceWorkflowPanel({projectId,cards,flush,runTask,activeSku,onSkuChange}:{activeSku:string;onSkuChange:(sku:string)=>void;projectId:string;cards:Record<string,CanvasCard>;flush:()=>Promise<void>;runTask:(id:string)=>Promise<boolean>}){
 const t=useTranslations('AppShell.studio.ecommerce');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [master,setMaster]=useState<Record<string,string>>({}),[takes,setTakes]=useState<Record<string,string>>({});
 const [selected,setSelected]=useState<string[]>([]),[progress,setProgress]=useState('');
 const [stop,setStop]=useState<{requested:boolean}|null>(null);
 const facts=Object.values(cards).filter(card=>card.kind==='text'&&/^sku-[a-f0-9]{16}-facts$/.test(card.id));
 const skus=facts.map(card=>({prefix:card.id.replace(/-facts$/,''),sku:card.name.split(' · ').slice(0,-1).join(' · ')}));
 const currentSku=skus.find(item=>item.sku===activeSku)||skus[skus.length-1];
 const tasks=Object.values(cards).filter(card=>card.kind==='generation'&&ecommerceTaskPattern.test(card.id)&&card.id.startsWith(`${currentSku?.prefix}-`));
 const adopted=skus.filter(item=>cards[`${item.prefix}-adopted-main`]?.assetId);
 async function action(sku:string,action:'workflow'|'adopt',extra:Record<string,string>={}){
  setBusy(true);setError('');setNotice('');
  try{await flush();await apiJsonPost('/api/demo/ecommerce-materials',{projectId,sku,action,...extra});setNotice(action==='adopt'?t('adoptedNotice'):t('workflowCreated'));}
  catch(cause){setError(cause instanceof Error?cause.message:t('failed'));}finally{setBusy(false);}
 }
 async function execute(){
  const ids=selected.filter(id=>tasks.some(task=>task.id===id));if(!ids.length)return;
  // Main images first, then scene variants. Adoption is deliberately a human checkpoint.
  ids.sort((a,b)=>Number(!a.endsWith('-main-image'))-Number(!b.endsWith('-main-image')));
  const control={requested:false};setStop(control);setBusy(true);setError('');setNotice('');
  try{const result=await runTasksInOrder(ids,runTask,()=>control.requested,(current,total)=>setProgress(`${current}/${total}`));
   setSelected(current=>current.filter(id=>!ids.slice(0,result.completed).includes(id)));
   if(result.failedId)throw new Error(t('stoppedOnFailure'));setNotice(result.stopped?t('stopped'):t('finished'));
  }catch(cause){setError(cause instanceof Error?cause.message:t('failed'));}finally{setBusy(false);setStop(null);setProgress('');}
 }
 const input='min-h-10 w-full rounded border border-white/15 bg-[var(--beat-surface)] px-2 text-xs';
 return <div className="space-y-4">
  <p className="text-xs leading-6 text-[var(--beat-text-3)]">{t('workflowHint')}</p>
  {!skus.length&&<p className="text-xs">{t('importFirst')}</p>}
  {currentSku&&<label className="block text-xs">{t('currentWorkflowSku')}<select className={input} disabled={busy} value={currentSku.sku} onChange={event=>{onSkuChange(event.target.value);setSelected([]);setError('');setNotice('');}}>{skus.map(item=><option key={item.prefix} value={item.sku}>{item.sku}</option>)}</select></label>}
  {skus.filter(item=>item.prefix===currentSku?.prefix).map(item=>{
   const candidates=Object.values(cards).filter(card=>card.kind==='output'&&card.status==='succeeded'&&card.assetId&&card.sourceConfigCardId===`${item.prefix}-main-image`);
   const availableMasters=adopted.filter(other=>other.sku!==item.sku);
   const selectedMaster=availableMasters.some(other=>other.sku===master[item.prefix])?master[item.prefix]:'';
   const hasWorkflow=tasks.some(task=>task.id===`${item.prefix}-main-image`);
   const workflowComplete=['main','scene-office','scene-outdoor'].every(task=>cards[`${item.prefix}-${task}-image`]?.kind==='generation'&&cards[`${item.prefix}-${task}-prompt`]?.kind==='text');
   const pin=cards[`${item.prefix}-adopted-main`];
   const choice=(candidates.some(card=>card.assetId===takes[item.prefix])?takes[item.prefix]:candidates.some(card=>card.assetId===pin?.assetId)?pin?.assetId:candidates[candidates.length-1]?.assetId)||'';
   const chosen=candidates.find(card=>card.assetId===choice);
   const alreadyAdopted=!!choice&&pin?.assetId===choice;
   return <section key={item.prefix} className="space-y-2 rounded-lg border border-white/15 p-3">
    <h3 className="text-sm">{item.sku}</h3>
    {availableMasters.length>0?<details className="space-y-2"><summary className="cursor-pointer text-xs">{t('optionalComposition')}</summary><p className="text-xs leading-6 text-[var(--beat-text-3)]">{t('sameProductHint')}</p><label className="block text-xs">{t('referenceOtherSku')}<select disabled={busy} className={input} value={selectedMaster} onChange={event=>setMaster(current=>({...current,[item.prefix]:event.target.value}))}><option value="">{t('independentComposition')}</option>{availableMasters.map(other=><option key={other.prefix} value={other.sku}>{other.sku}</option>)}</select></label><p className="text-xs leading-6 text-[var(--beat-text-3)]">{t('masterScopeHint')}</p></details>:<p className="text-xs leading-6 text-[var(--beat-text-3)]">{t('noAvailableMaster')}</p>}
    <button type="button" disabled={busy||(!selectedMaster&&workflowComplete)} className="min-h-10 w-full rounded border border-white/20 px-2 text-xs disabled:opacity-50" onClick={()=>void action(item.sku,'workflow',selectedMaster?{masterSku:selectedMaster}:{})}>{t(selectedMaster?'applyComposition':workflowComplete?'workflowReady':hasWorkflow?'ensureWorkflow':'createWorkflowOnly')}</button>
    {candidates.length>0&&<div className="space-y-2 border-t border-white/10 pt-3">
     {candidates.length>1?<label className="block text-xs">{t('chooseMain')}<select disabled={busy} className={input} value={choice} onChange={event=>setTakes(current=>({...current,[item.prefix]:event.target.value}))}>{candidates.map((card,index)=><option key={card.id} value={card.assetId!}>{t('version')} {index+1} · {card.aspectRatio}</option>)}</select></label>:<p className="text-xs">{t('singleMainReady')}</p>}
     {chosen?.url&&<img src={chosen.url} alt={item.sku+' '+t('mainPreview')} className="max-h-40 w-full rounded object-contain"/>}
     <p className="text-xs text-[var(--beat-text-3)]">{t('imageRatio')}：{chosen?.aspectRatio||'1:1'}</p>
     <button type="button" disabled={busy||!choice||alreadyAdopted} className="min-h-10 w-full rounded bg-[var(--beat-accent)] px-2 text-xs text-black disabled:opacity-50" onClick={()=>void action(item.sku,'adopt',{assetId:choice})}>{t(alreadyAdopted?'mainInUse':'adoptThisMain')}</button>
     <p className={'text-xs leading-6 '+(alreadyAdopted?'text-green-300':'text-[var(--beat-text-3)]')}>{t(alreadyAdopted?'mainInUseHint':'adoptThisMainHint')}</p>
    </div>}
    {pin?.url&&choice!==pin.assetId&&<div className="space-y-1"><p className="text-xs text-green-300">{t('adoptedMain')}</p><img src={pin.url} alt={item.sku+' '+t('adoptedMain')} className="max-h-40 w-full rounded object-contain"/></div>}

   </section>;
  })}
  {adopted.length>1&&<details className="space-y-2 border-t border-white/15 pt-3"><summary className="cursor-pointer text-xs">{t('compareTitle')}</summary><p className="text-xs leading-6 text-[var(--beat-text-3)]">{t('compareHint')}</p><div className="grid grid-cols-2 gap-2">{adopted.map(item=><figure key={item.prefix}><img src={cards[`${item.prefix}-adopted-main`].url!} alt={item.sku} className="aspect-square w-full rounded bg-white object-contain"/><figcaption className="mt-1 text-xs">{item.sku}</figcaption></figure>)}</div></details>}
  {notice&&<p role="status" className="text-xs leading-6 text-green-300">{notice}</p>}
  {error&&<p role="alert" className="text-xs leading-6 text-red-300">{error}</p>}
  {tasks.length>0&&<section className="space-y-3 border-t border-white/15 pt-3"><h3 className="text-sm">{t('runTitle')}</h3><p className="text-xs leading-6 text-[var(--beat-text-3)]">{t('runHint')}</p>
   {tasks.map(task=>{const match=ecommerceTaskPattern.exec(task.id)!;const blocked=match[2]!=='main'&&!cards[`${match[1]}-adopted-main`]?.assetId;return <label key={task.id} className="flex min-h-10 items-center gap-2 text-xs"><input type="checkbox" disabled={busy||blocked} checked={!blocked&&selected.includes(task.id)} onChange={event=>setSelected(current=>event.target.checked?[...current,task.id]:current.filter(id=>id!==task.id))}/><span>{task.name}{blocked?' · '+t('waitingMain'):''}</span></label>;})}
   <button type="button" disabled={busy||!selected.some(id=>tasks.some(task=>task.id===id))} className="min-h-10 w-full rounded border border-white/20 px-3 text-xs disabled:opacity-40" onClick={()=>void execute()}>{t('runSelected')} · {selected.filter(id=>tasks.some(task=>task.id===id)).length} {t('paidTasks')}</button>
   {stop&&<button type="button" className="min-h-10 text-xs underline" onClick={()=>{stop.requested=true;setNotice(t('stopAfterCurrent'));}}>{t('stop')} · {progress}</button>}
  </section>}
 </div>;
}
