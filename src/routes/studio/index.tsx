import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/studio/')({
  beforeLoad: ({ location }) => {
    throw redirect({ href: `${location.pathname.replace(/\/studio\/?$/, '/canvas')}${location.searchStr}` });
  },
  component: () => null,
});
