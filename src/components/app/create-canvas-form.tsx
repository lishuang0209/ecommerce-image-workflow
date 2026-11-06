import { useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, Clapperboard, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiJsonPost } from '@/lib/api-client';
import { normalizeLocale } from '@/config/locale';
import { m } from '@/paraglide/messages.js';

const templates = [
  { id: 'ecommerce', icon: ImageIcon },
  { id: 'video', icon: Clapperboard },
] as const;

export type CreateCanvasEntry = {
  prompt?: string;
  target?: string;
  model?: string;
};

export function CreateCanvasForm({
  locale,
  initialName = '',
  entry,
}: {
  locale: string;
  initialName?: string;
  entry?: CreateCanvasEntry;
}) {
  const language = normalizeLocale(locale);
  const prefix = language === 'en' ? '' : `/${language}`;
  const [name, setName] = useState(initialName);
  const [template, setTemplate] = useState<(typeof templates)[number]['id']>('ecommerce');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const project = await apiJsonPost<{ id: string }>('/api/demo/create-canvas', { name, template, locale: language });
      const params = new URLSearchParams();
      if (entry?.prompt?.trim()) params.set('prompt', entry.prompt.trim());
      if (entry?.target?.trim()) params.set('target', entry.target.trim());
      if (entry?.model?.trim()) params.set('model', entry.model.trim());
      const query = params.toString();
      window.location.assign(`${prefix}/canvas/${project.id}${query ? `?${query}` : ''}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create');
      setBusy(false);
    }
  }
  return (
    <main className="h-dvh overflow-y-auto bg-[var(--beat-bg,#08090a)] px-5 py-8 text-[var(--beat-text-1,#f6f6f4)]">
      <div className="mx-auto flex min-h-full w-full max-w-[720px] flex-col justify-center">
        <a className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-1 text-sm text-white/60 transition hover:text-white" href={`${prefix}/projects`}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          {m['demo.projects']({}, { locale: language })}
        </a>
        <section className="mt-4 rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),transparent_22%),#121316] px-5 py-7 shadow-[0_28px_80px_rgba(0,0,0,0.38)] sm:px-8 sm:py-8">
          <h1 className="beat-product-display text-[32px] font-semibold leading-tight tracking-[-0.045em]">{m['demo.title']({}, { locale: language })}</h1>
          <p className="mt-3 max-w-[38rem] text-sm leading-6 text-white/55">{m['demo.createIntro']({}, { locale: language })}</p>
          <form onSubmit={event => void create(event)} className="mt-8 space-y-6">
            <label className="block space-y-2 text-sm font-medium text-white/80">
              {m['demo.name']({}, { locale: language })}
              <Input required maxLength={100} value={name} disabled={busy} onChange={event => setName(event.target.value)} placeholder={m['demo.nameHint']({}, { locale: language })} className="h-11 rounded-xl border-white/15 bg-black/25 px-3 text-sm" />
            </label>
            <fieldset disabled={busy} className="space-y-3">
              <legend className="text-sm font-medium text-white/80">{m['demo.chooseTemplate']({}, { locale: language })}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {templates.map(item => {
                  const selected = template === item.id;
                  const Icon = item.icon;
                  const title = item.id === 'ecommerce' ? m['demo.imageTemplate']({}, { locale: language }) : m['demo.videoTemplate']({}, { locale: language });
                  const hint = item.id === 'ecommerce' ? m['demo.imageTemplateHint']({}, { locale: language }) : m['demo.videoTemplateHint']({}, { locale: language });
                  return (
                    <button key={item.id} type="button" aria-pressed={selected} onClick={() => setTemplate(item.id)} className={`flex min-h-[148px] flex-col rounded-2xl border p-4 text-left transition ${selected ? 'border-[var(--beat-accent)] bg-[rgba(255,122,51,0.10)]' : 'border-white/12 bg-white/[0.025] hover:border-white/28 hover:bg-white/[0.045]'}`}>
                      <span className="flex items-center justify-between gap-3">
                        <span className={`grid size-9 place-items-center rounded-xl ${selected ? 'bg-[var(--beat-accent)] text-black' : 'bg-white/[0.08] text-white/70'}`}><Icon className="size-4" aria-hidden="true" /></span>
                        <span className={`grid size-5 place-items-center rounded-full border ${selected ? 'border-[var(--beat-accent)] bg-[var(--beat-accent)] text-black' : 'border-white/20 text-transparent'}`}><Check className="size-3" aria-hidden="true" /></span>
                      </span>
                      <span className="mt-4 text-sm font-medium">{title}</span>
                      <span className="mt-1.5 text-xs leading-5 text-white/50">{hint}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
            {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}
            <div className="border-t border-white/10 pt-5">
              <Button type="submit" disabled={busy || !name.trim()} className="h-11 w-full rounded-xl bg-[var(--beat-accent)] text-sm font-semibold text-black hover:bg-[var(--beat-accent-hover,#ff8a4d)]">
                <ArrowRight className="size-4" />
                {busy ? m['demo.pending']({}, { locale: language }) : m['demo.enterCanvas']({}, { locale: language })}
              </Button>
              <p className="mt-3 text-xs leading-5 text-white/40">{m['demo.noChargeCreate']({}, { locale: language })}</p>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
