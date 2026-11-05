import {EcommerceSelect} from './ecommerce-select';
import { useState } from 'react';
import type { CanvasCard } from '@/core/beatcanvas/canvas-types';
import { apiJsonPost } from '@/lib/api-client';
import { useTranslations } from '@/core/workspace-lib/shims/next-intl';
import { sceneDescriptionForTask,ecommerceTaskPattern,isEcommerceTaskPromptReady } from '@/core/demo/ecommerce-contract';
import { runTasksInOrder } from '@/core/demo/serial-tasks';

export function EcommerceWorkflowPanel({projectId,cards,flush,runTask,activeSku,onSkuChange,onSavedSnapshot,materialSkus=[],onLocatePrompt}:{onLocatePrompt?:(id:string)=>void;materialSkus?:string[];onSavedSnapshot:(document:import('@/core/projects/project-snapshot').ProjectSnapshotDocument,version:number)=>void;activeSku:string;onSkuChange:(sku:string)=>void;projectId:string;cards:Record<string,CanvasCard>;flush:()=>Promise<void>;runTask:(id:string)=>Promise<boolean>}){
 const t=useTranslations('AppShell.studio.ecommerce');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [takes,setTakes]=useState<Record<string,string>>({});
 const [selected,setSelected]=useState<string[]>([]),[mainBatch,setMainBatch]=useState<string[]>([]),[progress,setProgress]=useState('');
 const [sceneDraft,setSceneDraft]=useState<{sku:string;id:string;text:string}|null>(null);
 const [stop,setStop]=useState<{requested:boolean;batch:boolean}|null>(null);
 const facts=Object.values(cards).filter(card=>card.kind==='text'&&/^sku-[a-f0-9]{16}-facts$/.test(card.id));
 const existingSkus=facts.map(card=>({prefix:card.id.replace(/-facts$/,''),sku:card.name.split(' · ').slice(0,-1).join(' · ')}));
 const skus=[...existingSkus,...materialSkus.filter(sku=>!existingSkus.some(item=>item.sku===sku)).map(sku=>({prefix:'',sku}))];
 const currentSku=skus.find(item=>item.sku===activeSku)||skus[skus.length-1];
 const tasks=Object.values(cards).filter(card=>card.kind==='generation'&&ecommerceTaskPattern.test(card.id)&&card.id.startsWith(`${currentSku?.prefix}-`));
 const adopted=skus.filter(item=>cards[`${item.prefix}-adopted-main`]?.assetId);
 const mainRows=skus.map(item=>({...item,task:item.prefix?cards[`${item.prefix}-main-image`]:undefined})).map(item=>({...item,ready:!!item.task&&item.task.kind==='generation'&&isEcommerceTaskPromptReady(item.task,cards)}));
 const batchIds=mainBatch.filter(id=>mainRows.some(row=>row.ready&&row.task?.id===id));
 async function action(sku:string,action:'workflow'|'adopt'|'master'|'scene',extra:Record<string,string|boolean>={}){
  setBusy(true);setError('');setNotice('');
  try{await flush();const saved=await apiJsonPost<{document:import('@/core/projects/project-snapshot').ProjectSnapshotDocument;version:number}>('/api/demo/ecommerce-materials',{projectId,sku,action,...extra});onSavedSnapshot(saved.document,saved.version);setNotice(action==='scene'?t('sceneSaved'):action==='master'?t('masterMarked'):action==='adopt'?t('adoptedNotice'):t('workflowCreated'));return true;}
    catch(cause){setError(cause instanceof Error?cause.message:t('failed'));return false;}finally{setBusy(false);}
 }
 // Copies each scene's detailed prompt; the server swaps the source colour for this SKU's colour.
 function sceneSources(item:{sku:string;prefix:string}){
  return Object.values(cards).filter(card=>card.kind==='generation'&&ecommerceTaskPattern.test(card.id)&&card.id.startsWith(`${item.prefix}-scene-`)).map(card=>({promptId:card.id.replace(/-image$/,'-prompt'),label:sceneDescriptionForTask(card.id,cards)||(card.name.startsWith(item.sku+' · ')?card.name.slice(item.sku.length+3):card.name)})).filter(scene=>scene.label);
 }
 async function copyScenes(sku:string,scenes:{promptId:string;label:string}[]){
  for(const scene of scenes)if(!await action(sku,'scene',{sceneDescription:scene.label,copyPromptFrom:scene.promptId}))return;
  setNotice(t('scenesCopied',{count:scenes.length}));
 }
 // Reusing another SKU's composition marks its adopted main as the master first, so the user never has to.
 async function reuseComposition(sku:string,from:{sku:string;prefix:string}){
  const assetId=cards[`${from.prefix}-adopted-main`]?.assetId;if(!assetId)return;
  if(cards[`${from.prefix}-composition-master`]?.assetId!==assetId&&!await action(from.sku,'master',{assetId}))return;
  if(await action(sku,'workflow',{masterSku:from.sku,masterAssetId:assetId}))setNotice(t('compositionReused',{sku:from.sku}));
 }
 // `only` runs the given tasks (which may span SKUs); without it the checked scene tasks run in order.
 async function execute(only?:string[],batch=false){
  const ids=(only??selected).filter(id=>cards[id]?.kind==='generation'&&ecommerceTaskPattern.test(id));if(!ids.length)return;
  if(ids.some(id=>!isEcommerceTaskPromptReady(cards[id],cards))){setError(t('completePromptFirst'));return;}
  // Main images first, then scene variants. Adoption is deliberately a human checkpoint.
  ids.sort((a,b)=>Number(!a.endsWith('-main-image'))-Number(!b.endsWith('-main-image')));
  const control={requested:false,batch};setStop(control);setBusy(true);setError('');setNotice('');
  try{const result=await runTasksInOrder(ids,runTask,()=>control.requested,(current,total)=>setProgress(`${current}/${total}`));
   const done=ids.slice(0,result.completed);
   setSelected(current=>current.filter(id=>!done.includes(id)));setMainBatch(current=>current.filter(id=>!done.includes(id)));
   if(result.failedId)throw new Error(t('stoppedOnFailure'));setNotice(result.stopped?t('stopped'):t('finished'));
  }catch(cause){setError(cause instanceof Error?cause.message:t('failed'));}finally{setBusy(false);setStop(null);setProgress('');}
 }
 const input='min-h-10 w-full rounded border border-white/15 bg-[var(--beat-surface)] px-2 text-xs';
 return <div className="space-y-4">
  {!skus.length&&<p className="text-xs">{t('importFirst')}</p>}
  {(mainRows.filter(row=>row.ready).length>1||!!stop?.batch)&&<section aria-label={t('batchMainTitle')} className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
   <div className="flex items-center justify-between text-xs"><h3>{t('batchMainTitle')}</h3><span className="text-[var(--beat-text-3)]">{batchIds.length}/{mainRows.filter(row=>row.ready).length}</span></div>
   <p className="text-[11px] leading-5 text-[var(--beat-text-3)]">{t('batchMainHint')}</p>
   {mainRows.filter(row=>row.ready).map(row=>{const results=Object.values(cards).filter(card=>card.kind==='output'&&card.status==='succeeded'&&card.assetId&&card.sourceConfigCardId===row.task?.id).length;const pinned=!!cards[`${row.prefix}-adopted-main`]?.assetId;const processing=row.task?.status==='pending'||row.task?.status==='processing';
    return <div key={row.sku} className={'flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs '+(row.ready?'hover:bg-white/[0.03]':'opacity-50')}>
     <input type="checkbox" aria-label={row.sku} disabled={busy||!row.ready} checked={row.ready&&mainBatch.includes(row.task!.id)} onChange={event=>{const id=row.task!.id;setMainBatch(current=>event.target.checked?[...new Set([...current,id])]:current.filter(other=>other!==id));}}/>
     <span className="min-w-0 flex-1 truncate">{row.sku}</span>
     <span className="shrink-0 text-[11px] text-[var(--beat-text-3)]">{!row.task?t('needsWorkflowShort'):!row.ready?t('promptNeedsReview'):processing?t('taskRunningShort'):pinned?t('adoptedShort'):results?`${results} ${t('resultCount')}`:t('awaitingGeneration')}</span>
     {row.sku!==currentSku?.sku&&<button type="button" disabled={busy} className="min-h-9 shrink-0 px-1 text-[11px] text-orange-400 disabled:opacity-40" onClick={()=>{onSkuChange(row.sku);setSelected([]);setError('');setNotice('');}}>{t('viewSku')} →</button>}
    </div>;})}
   <button type="button" disabled={busy||!batchIds.length} className="min-h-10 w-full rounded-lg bg-[var(--beat-accent)] px-3 text-xs text-black disabled:opacity-40" onClick={()=>void execute(batchIds,true)}>{stop?.batch?t('taskRunningShort')+' '+progress:t('batchMainRun')+' · '+batchIds.length}</button>
   {stop?.batch&&<button type="button" className="min-h-10 w-full text-xs" onClick={()=>{stop.requested=true;setNotice(t('stopAfterCurrent'));}}>{t('stop')}</button>}
  </section>}
  {currentSku&&<label className="block text-xs">{t('currentWorkflowSku')}<EcommerceSelect className={input} disabled={busy} value={currentSku.sku} onChange={event=>{onSkuChange(event.target.value);setSelected([]);setError('');setNotice('');}}>{skus.map(item=><option key={item.sku} value={item.sku}>{item.sku}</option>)}</EcommerceSelect></label>}
  {skus.filter(item=>item.sku===currentSku?.sku).map(item=>{
   const candidates=Object.values(cards).filter(card=>card.kind==='output'&&card.status==='succeeded'&&card.assetId&&card.sourceConfigCardId===`${item.prefix}-main-image`);
   const reusable=adopted.filter(other=>other.sku!==item.sku);
   const applied=cards[`${item.prefix}-master-reference`];
   const appliedSku=skus.find(other=>applied?.referenceCardIds.some(id=>id.startsWith(`${other.prefix}-composition-master-`)))?.sku||'';
   const hasWorkflow=tasks.some(task=>task.id===`${item.prefix}-main-image`);
   const workflowComplete=['main'].every(task=>cards[`${item.prefix}-${task}-image`]?.kind==='generation'&&cards[`${item.prefix}-${task}-prompt`]?.kind==='text');
   const pin=cards[`${item.prefix}-adopted-main`];
   const choice=(candidates.some(card=>card.assetId===takes[item.sku])?takes[item.sku]:candidates.some(card=>card.assetId===pin?.assetId)?pin?.assetId:candidates[candidates.length-1]?.assetId)||'';
   const chosen=candidates.find(card=>card.assetId===choice);
   const alreadyAdopted=!!choice&&pin?.assetId===choice;
   const mainTask=tasks.find(task=>task.id===`${item.prefix}-main-image`);
   const mainPromptReady=!!mainTask&&isEcommerceTaskPromptReady(mainTask,cards);
   const sceneTasks=tasks.filter(task=>task.id.includes('-scene-'));
   const completedScenes=sceneTasks.filter(task=>!!task.url).length;
   const ownLabels=sceneSources(item).map(scene=>scene.label);
   const sceneCopies=skus.filter(other=>other.prefix&&other.sku!==item.sku).map(other=>({sku:other.sku,scenes:sceneSources(other).filter(scene=>!ownLabels.includes(scene.label))})).filter(source=>source.scenes.length>0);
   return <section key={item.sku} className="space-y-3">
    <ol aria-label={t('workflowSteps')} className="grid grid-cols-3 gap-1 rounded-lg bg-white/[0.04] p-2 text-[11px]">{[t('stepMain'),t('stepAdopt'),t('stepScenes')].map((label,index)=><li key={label} className={'flex items-center gap-1.5 py-1 '+((index===0&&candidates.length>0)||(index===1&&!!pin?.assetId)||(index===2&&sceneTasks.length>0&&completedScenes===sceneTasks.length)?'text-green-300':'text-[var(--beat-text-3)]')}><span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-current">{index+1}</span>{label}</li>)}</ol>
    {!workflowComplete?<button type="button" disabled={busy} className="min-h-11 w-full rounded-lg border border-white/20 text-xs disabled:opacity-40" onClick={()=>void action(item.sku,'workflow')}>{t(hasWorkflow?'ensureWorkflow':'createWorkflowOnly')}</button>:<p className="text-[11px] text-[var(--beat-text-3)]">✓ {t('workflowReady')}</p>}
    {workflowComplete&&<section aria-label={t('simpleComposition')} className="space-y-2 rounded-lg bg-white/[0.03] p-3">
     <div className="flex items-center justify-between gap-2 text-xs"><h3>{t('simpleComposition')}</h3><span className="max-w-[65%] truncate text-[var(--beat-text-3)]">{applied&&appliedSku?t('compositionReusedShort',{sku:appliedSku}):t('independentShort')}</span></div>
     {reusable.length>0?<>
      <p className="text-[11px] leading-5 text-[var(--beat-text-3)]">{t('reuseCompositionHint')}</p>
      {reusable.map(other=>{const url=cards[`${other.prefix}-adopted-main`]?.url;const current=appliedSku===other.sku&&applied?.assetId===cards[`${other.prefix}-adopted-main`]?.assetId;
       return <button key={other.prefix} type="button" disabled={busy||current} aria-pressed={current} className={'flex min-h-14 w-full items-center gap-3 rounded-lg border p-2 text-left text-xs disabled:cursor-default '+(current?'border-orange-400':'border-white/15 hover:bg-white/5')} onClick={()=>void reuseComposition(item.sku,other)}>{url&&<img src={url} alt={other.sku} className="size-10 shrink-0 rounded bg-white object-contain"/>}<span className="min-w-0 flex-1">{t('reuseCompositionOf',{sku:other.sku})}</span>{current&&<span className="text-green-300">✓</span>}</button>;})}
      <button type="button" disabled={busy||!applied} aria-pressed={!applied} className={'min-h-10 w-full rounded-lg border px-2 text-left text-xs disabled:cursor-default '+(!applied?'border-orange-400':'border-white/15 hover:bg-white/5')} onClick={()=>void action(item.sku,'workflow',{clearMaster:true})}>{t('independentComposition')}{!applied&&<span className="float-right text-green-300">✓</span>}</button>
     </>:<p className="text-xs leading-5 text-[var(--beat-text-3)]">{t('noReusableMain')}</p>}
    </section>}
    <section aria-label={t('mainTaskTitle')} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
     <div className="flex items-center justify-between text-xs"><h3>{t('mainTaskTitle')}</h3><span className={pin?.assetId?'text-green-300':'text-[var(--beat-text-3)]'}>{t(!mainPromptReady?'promptNeedsReview':pin?.assetId?'adoptedShort':candidates.length?'awaitingAdoption':'awaitingGeneration')}</span></div>
     <div className="flex items-center gap-3">
      {chosen?.url?<a href={chosen.url} target="_blank" rel="noreferrer" aria-label={t('viewImage')} className="shrink-0"><img src={chosen.url} alt={item.sku+' '+t('mainPreview')} className="size-24 rounded-lg bg-white/5 object-contain"/></a>:<div className="flex size-20 shrink-0 items-center justify-center rounded-lg bg-white/5 text-2xl text-white/20">▧</div>}
      <div className="min-w-0 flex-1 space-y-1"><p className="text-xs text-[var(--beat-text-3)]">1:1 · {candidates.length} {t('resultCount')}</p>
       {mainTask&&<button type="button" disabled={busy||!mainPromptReady} className="min-h-10 rounded-lg border border-white/20 px-3 text-xs hover:bg-white/5 disabled:opacity-40" onClick={()=>void execute([mainTask.id])}>{t(candidates.length?'regenerateOne':'generateOne')}</button>}
       {!mainPromptReady&&<button type="button" className="min-h-10 text-xs text-orange-400" onClick={()=>onLocatePrompt?.(`${item.prefix}-main-prompt`)}>{t('completePromptAction')} →</button>}
       {chosen&&!alreadyAdopted&&<button type="button" disabled={busy||!choice} className="min-h-10 rounded-lg bg-[var(--beat-accent)] px-3 text-xs text-black disabled:opacity-40" onClick={()=>void action(item.sku,'adopt',{assetId:choice})}>{t('adoptThisMain')}</button>}
       {alreadyAdopted&&<p className="text-[11px] text-green-300">✓ {t('readyForScenes')}</p>}
      </div>
     </div>
     {candidates.length>1&&<details><summary className="min-h-10 cursor-pointer py-3 text-xs text-[var(--beat-text-3)]">{t('switchMainVersion')} · {candidates.length} ▾</summary><div className="grid grid-cols-3 gap-2">{candidates.map((card,index)=><button key={card.id} type="button" disabled={busy} aria-pressed={choice===card.assetId} className={'overflow-hidden rounded-lg border text-xs '+(choice===card.assetId?'border-orange-400':'border-white/10')} onClick={()=>setTakes(current=>({...current,[item.sku]:card.assetId!}))}><img src={card.url||''} alt={t('version')+' '+(index+1)} className="aspect-square w-full object-contain"/><span className="block py-1">{t('version')} {index+1}{pin?.assetId===card.assetId?' ✓':''}</span></button>)}</div></details>}
     {applied?.url&&chosen?.url&&<details><summary className="min-h-10 cursor-pointer py-3 text-xs text-[var(--beat-text-3)]">{t('compareComposition')} ▾</summary><div className="grid grid-cols-2 gap-2">{[{url:applied.url,label:t('compositionPreview')},{url:chosen.url,label:t('currentResult')}].map(figure=><figure key={figure.label}><img src={figure.url} alt={figure.label} className="aspect-square w-full rounded object-contain"/><figcaption className="text-xs">{figure.label}</figcaption></figure>)}</div><p className="mt-2 text-xs leading-5 text-[var(--beat-text-3)]">{t('compareBeforeAdopt')}</p></details>}
     {pin?.url&&choice!==pin.assetId&&<p className="text-xs text-amber-300">{t('previousMainStillUsed')}</p>}
    </section>
    {sceneTasks.length>0&&<section aria-label={t('sceneTaskTitle')} className="space-y-2"><div className="flex items-center justify-between px-1 text-xs"><h3>{t('sceneTaskTitle')}</h3><span className="text-[var(--beat-text-3)]">{completedScenes}/{sceneTasks.length}</span></div>
     {sceneTasks.map(task=>{const promptReady=isEcommerceTaskPromptReady(task,cards);const blocked=!pin?.assetId||!promptReady;const processing=task.status==='pending'||task.status==='processing';return <div key={task.id} className={'flex min-h-20 items-center gap-3 rounded-xl border border-white/10 p-3 '+(blocked?'opacity-50':'hover:bg-white/[0.03]')}><input type="checkbox" aria-label={task.name} disabled={busy||blocked} checked={!blocked&&selected.includes(task.id)} onChange={event=>setSelected(current=>event.target.checked?[...new Set([...current,task.id])]:current.filter(id=>id!==task.id))}/>{task.url?<img src={task.url} alt={task.name} className="size-12 rounded bg-white/5 object-contain"/>:<span className="flex size-12 items-center justify-center rounded bg-white/5 text-xl text-white/20">▧</span>}<span className="min-w-0 flex-1"><span className="block truncate text-xs" title={sceneDescriptionForTask(task.id,cards)}>{task.name.startsWith(item.sku+' · ')?task.name.slice(item.sku.length+3):task.name}</span><span className="mt-1 block text-[11px] text-[var(--beat-text-3)]">4:5 · {t(!pin?.assetId?'waitForMainShort':!promptReady?'promptNeedsReview':processing?'taskRunningShort':task.status==='failed'?'taskFailedShort':task.url?'taskHasResultShort':'awaitingGeneration')}</span>{!promptReady&&<button type="button" className="min-h-9 text-xs text-orange-400" onClick={()=>onLocatePrompt?.(task.id.replace(/-image$/,'-prompt'))}>{t('completePromptAction')} →</button>}{cards[task.id.replace(/-image$/,'-brief')]?<button type="button" disabled={busy} className="ml-2 min-h-9 text-xs text-[var(--beat-text-3)] hover:text-white" onClick={()=>setSceneDraft({sku:item.sku,id:task.id,text:sceneDescriptionForTask(task.id,cards)})}>{t('editScene')}</button>:<button type="button" disabled={busy} className="ml-2 min-h-9 text-xs text-[var(--beat-text-3)] hover:text-white" onClick={()=>onLocatePrompt?.(task.id.replace(/-image$/,'-prompt'))}>{t('editScenePrompt')}</button>}</span><button type="button" disabled={busy||blocked} className="min-h-10 shrink-0 rounded-lg border border-white/20 px-3 text-xs hover:bg-white/5 disabled:opacity-40" onClick={()=>void execute([task.id])}>{t(task.url?'regenerateOne':'generateOne')}</button></div>;})}
    </section>}

    {workflowComplete&&sceneDraft?.sku!==item.sku&&sceneCopies.map(source=><button key={source.sku} type="button" disabled={busy} title={source.scenes.map(scene=>scene.label).join('、')} className="min-h-10 w-full rounded-lg border border-white/20 px-3 text-xs hover:bg-white/5 disabled:opacity-40" onClick={()=>void copyScenes(item.sku,source.scenes)}>{t('copyScenesFrom',{sku:source.sku,count:source.scenes.length})}</button>)}
    {sceneDraft?.sku===item.sku?<div className="space-y-2 rounded-xl bg-white/[0.03] p-3">
     <label className="block text-xs">{t('sceneDescriptionLabel')}<textarea autoFocus className={input+' mt-2 min-h-24 py-2'} maxLength={800} value={sceneDraft.text} onChange={event=>setSceneDraft({...sceneDraft,text:event.target.value})} placeholder={t('sceneDescriptionExample')}/></label>
     <p className="text-[11px] leading-5 text-[var(--beat-text-3)]">{t(sceneDraft.id?'sceneEditHint':'sceneAddHint')}</p>
     <div className="flex gap-2"><button type="button" disabled={busy||!sceneDraft.text.trim()} className="min-h-10 flex-1 rounded-lg bg-[var(--beat-accent)] px-3 text-xs text-black disabled:opacity-40" onClick={()=>{const draft=sceneDraft;void action(item.sku,'scene',{sceneDescription:draft.text,...(draft.id?{taskId:draft.id}:{})}).then(saved=>{if(saved){setSceneDraft(null);setSelected(current=>current.filter(id=>id!==draft.id));}});}}>{t('saveScene')}</button><button type="button" disabled={busy} className="min-h-10 px-3 text-xs" onClick={()=>setSceneDraft(null)}>{t('cancelEdit')}</button></div>
    </div>:<button type="button" disabled={busy} className="min-h-10 w-full rounded-lg border border-dashed border-white/20 text-xs text-[var(--beat-text-2)] hover:bg-white/5" onClick={()=>setSceneDraft({sku:item.sku,id:'',text:''})}>＋ {t('addScene')}</button>}

   </section>;
  })}
  {adopted.length>1&&<details className="space-y-2 pt-3"><summary className="cursor-pointer text-xs">{t('compareTitle')}</summary><p className="text-xs leading-6 text-[var(--beat-text-3)]">{t('compareHint')}</p><div className="grid grid-cols-2 gap-2">{adopted.map(item=><figure key={item.prefix}><img src={cards[`${item.prefix}-adopted-main`].url!} alt={item.sku} className="aspect-square w-full rounded bg-white object-contain"/><figcaption className="mt-1 text-xs">{item.sku}</figcaption></figure>)}</div></details>}
  {notice&&<p role="status" className="text-xs leading-6 text-green-300">{notice}</p>}
  {error&&<p role="alert" className="text-xs leading-6 text-red-300">{error}</p>}
  {tasks.some(task=>task.id.includes('-scene-'))&&<div className="sticky -bottom-4 z-10 space-y-2 bg-[var(--beat-surface)] py-3">
   <p className="text-[11px] text-[var(--beat-text-3)]">{t('paidSelectionShort')} · {selected.filter(id=>tasks.some(task=>task.id===id&&isEcommerceTaskPromptReady(task,cards)&&(task.id.endsWith('-main-image')||cards[task.id.replace(/-scene.*$/,'-adopted-main')]?.assetId))).length} {t('paidTasks')}</p>
   <button type="button" disabled={busy||!selected.some(id=>tasks.some(task=>task.id===id&&isEcommerceTaskPromptReady(task,cards)&&(task.id.endsWith('-main-image')||cards[task.id.replace(/-scene.*$/,'-adopted-main')]?.assetId)))} className="min-h-11 w-full rounded-lg bg-[var(--beat-accent)] px-3 text-sm text-black disabled:opacity-40" onClick={()=>void execute()}>{stop&&!stop.batch?t('taskRunningShort')+' '+progress:t('generateSelectedShort')+' · '+selected.filter(id=>tasks.some(task=>task.id===id&&isEcommerceTaskPromptReady(task,cards)&&(task.id.endsWith('-main-image')||cards[task.id.replace(/-scene.*$/,'-adopted-main')]?.assetId))).length}</button>
   {stop&&!stop.batch&&<button type="button" className="min-h-10 w-full text-xs" onClick={()=>{stop.requested=true;setNotice(t('stopAfterCurrent'));}}>{t('stop')}</button>}
  </div>}
  <details className="text-xs text-[var(--beat-text-3)]"><summary className="min-h-10 cursor-pointer py-3">{t('workflowHelpShort')}</summary><p className="leading-6">{t('workflowHint')}</p><p className="leading-6">{t('runHint')}</p></details>

 </div>;
}
