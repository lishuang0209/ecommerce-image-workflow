import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { apiJsonPost } from '@/lib/api-client';
import type { DemoPlan } from '@/core/demo/workflow-plan';
import { m } from '@/paraglide/messages.js';

export function DemoImageRunner({ plan, configured, onReload }: { plan: DemoPlan; configured: boolean; onReload: () => Promise<void> }) {
  const steps = plan.steps || [];
  const [stepId, setStepId] = useState(steps[0]?.id || '');
  const [referenceId, setReferenceId] = useState('');
  const [prompt, setPrompt] = useState(steps[0]?.prompt || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<{ requestId: string; stepId: string; referenceId: string; prompt: string } | null>(null);
  async function generate() {
    const submission = pending || { requestId: crypto.randomUUID(), stepId, referenceId, prompt };
    setBusy(true); setError(''); setPending(submission);
    try {
      await apiJsonPost('/api/demo/plans', { action: 'generate', id: plan.id, ...submission });
      setPending(null);
      await onReload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Request failed'); }
    finally { setBusy(false); }
  }
  return <section className="mb-6 rounded-xl border border-white/15 p-5">
    <h3 className="font-medium">{m['demo.runTitle']()}</h3>
    <p className="my-3 text-xs leading-6 text-white/50">{m['demo.runHint']()}</p>
    <fieldset disabled={busy || !!pending} className="grid gap-4 md:grid-cols-2">
      <label className="text-sm">{m['demo.runStep']()}<select className="mt-2 block min-h-11 w-full rounded-lg border border-white/20 bg-[#171717] p-2" value={stepId} onChange={event => { const step = steps.find(item => item.id === event.target.value); setStepId(event.target.value); setPrompt(step?.prompt || ''); }}>{steps.map(step => <option key={step.id} value={step.id}>{step.title}</option>)}</select></label>
      <label className="text-sm">{m['demo.runReference']()}<select className="mt-2 block min-h-11 w-full rounded-lg border border-white/20 bg-[#171717] p-2" value={referenceId} onChange={event => setReferenceId(event.target.value)}><option value="">{m['demo.runSelect']()}</option>{plan.assets.map(asset => <option key={asset.id} value={asset.id}>{asset.subject} / {asset.filename}</option>)}</select></label>
      {plan.assets.find(asset => asset.id === referenceId) && <img className="h-32 w-32 rounded-lg object-contain bg-white" src={plan.assets.find(asset => asset.id === referenceId)!.url} alt={m['demo.runReference']()} />}
      <label className="text-sm md:col-span-2">{m['demo.runPrompt']()}<Textarea className="mt-2" value={prompt} rows={5} maxLength={12000} onChange={event => setPrompt(event.target.value)} /></label>
    </fieldset>
    <Button className="mt-4 min-h-11" disabled={busy || !configured || !referenceId || !stepId || !prompt.trim()} onClick={() => void generate()}>{busy ? m['demo.runBusy']() : pending ? m['demo.runRecover']() : m['demo.runGenerate']()}</Button>
    {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
    <div aria-live="polite" className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[...(plan.runs || [])].reverse().map(run => <article key={run.id} className="rounded-lg border border-white/10 p-3"><p className="text-sm">{steps.find(step => step.id === run.stepId)?.title}</p><p className="my-2 text-xs text-white/60">{run.status === 'succeeded' ? m['demo.runSuccess']() : run.status === 'failed' ? m['demo.runFailed']() : m['demo.runUnknown']()}</p>{run.error && <p className="text-xs text-red-300">{run.error}</p>}{run.url && <><img className="mt-2 w-full rounded-lg" src={run.url} alt={m['demo.runSuccess']()} /><a className="mt-3 inline-block text-sm underline" href={run.url} download>{m['demo.runDownload']()}</a></>}</article>)}</div>
  </section>;
}
