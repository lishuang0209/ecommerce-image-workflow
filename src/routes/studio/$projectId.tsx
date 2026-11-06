import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/studio/$projectId')({
  ssr: 'data-only',
  validateSearch: (search: Record<string, unknown>) => ({
    target: (search.target as string) || undefined,
    model: (search.model as string) || undefined,
    prompt: (search.prompt as string) || undefined,
  }),
  beforeLoad: ({ location }) => {
    throw redirect({ href: `${location.pathname.replace('/studio/', '/canvas/')}${location.searchStr}` });
  },
  component: () => null,
});
