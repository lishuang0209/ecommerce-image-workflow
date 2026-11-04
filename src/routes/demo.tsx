import { createFileRoute } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiJsonPost } from '@/lib/api-client';
import { getLocale } from '@/core/workspace-lib/shims/next-intl-server';
import { normalizeLocale } from '@/config/locale';
import { m } from '@/paraglide/messages.js';

export const Route = createFileRoute('/demo')({ loader: () => ({ locale: getLocale() }), component: CreateCanvasPage });
function CreateCanvasPage() {
 const language = normalizeLocale(Route.useLoaderData().locale);
 const prefix = language === 'en' ? '' : `/${language}`;
 const [name, setName] = useState('');
 const [template, setTemplate] = useState<'ecommerce' | 'blank'>('ecommerce');
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 async function create(event: FormEvent) { event.preventDefault(); setBusy(true); setError(''); try { const project = await apiJsonPost<{id:string}>('/api/demo/create-canvas', { name, template, locale: language }); window.location.assign(`${prefix}/canvas/${project.id}`); } catch(cause) { setError(cause instanceof Error ? cause.message : 'Unable to create'); setBusy(false); } }
 return <main className="min-h-screen bg-[var(--beat-surface,#08090a)] px-6 py-10 text-[var(--beat-text-1,#f6f6f4)]">
   <div className="mx-auto max-w-2xl"><a className="text-sm text-white/60" href={`${prefix}/projects`}>← {m['demo.projects']({}, { locale: language })}</a>
   <h1 className="mt-12 text-3xl font-semibold">{m['demo.title']({}, { locale: language })}</h1>
   <p className="mt-4 text-sm leading-7 text-white/55">{m['demo.createIntro']({}, { locale: language })}</p>
   <form onSubmit={event => void create(event)} className="mt-8 space-y-6">
     <label className="block space-y-2 text-sm">{m['demo.name']({}, { locale: language })}<Input required maxLength={100} value={name} disabled={busy} onChange={event => setName(event.target.value)} placeholder={m['demo.nameHint']({}, { locale: language })} /></label>
     <fieldset disabled={busy}><legend className="mb-3 text-sm">{m['demo.chooseTemplate']({}, { locale: language })}</legend><div className="grid gap-3 sm:grid-cols-2">{(['ecommerce','blank'] as const).map(value => <button key={value} type="button" aria-pressed={template===value} onClick={() => setTemplate(value)} className={`rounded-xl border p-5 text-left ${template===value?'border-[var(--beat-accent)] bg-white/5':'border-white/15'}`}><span className="text-sm font-medium">{value==='ecommerce'?m['demo.ecommerce']({}, { locale: language }):m['demo.blankTemplate']({}, { locale: language })}</span><p className="mt-2 text-xs leading-6 text-white/50">{value==='ecommerce'?m['demo.ecommerceTemplateHint']({}, { locale: language }):m['demo.blankTemplateHint']({}, { locale: language })}</p></button>)}</div></fieldset>
     {error&&<p role="alert" className="text-sm text-red-300">{error}</p>}
     <Button type="submit" disabled={busy||!name.trim()} className="min-h-11"><ArrowRight className="size-4" />{busy?m['demo.pending']({}, { locale: language }):m['demo.enterCanvas']({}, { locale: language })}</Button>
     <p className="text-xs leading-6 text-white/45">{m['demo.noChargeCreate']({}, { locale: language })}</p>
   </form></div>
 </main>;
}
