import { createFileRoute } from '@tanstack/react-router';

import { CreateCanvasForm } from '@/components/app/create-canvas-form';
import { getLocale } from '@/core/workspace-lib/shims/next-intl-server';

const validateProjectIntent = (search: Record<string, unknown>) => ({
  target: (search.target as string) || undefined,
  model: (search.model as string) || undefined,
  prompt: (search.prompt as string) || undefined,
});

export const Route = createFileRoute('/canvas/')({
  validateSearch: validateProjectIntent,
  loader: () => ({ locale: getLocale() }),
  component: CanvasRouteComponent,
});

function CanvasRouteComponent() {
  const { locale } = Route.useLoaderData();
  const { prompt, target, model } = Route.useSearch();
  return (
    <CreateCanvasForm
      locale={locale}
      initialName={(prompt ?? '').trim().slice(0, 100)}
      entry={{ prompt, target, model }}
    />
  );
}
