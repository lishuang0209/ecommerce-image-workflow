import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/demo')({
  beforeLoad: ({ location }) => {
    throw redirect({ href: `${location.pathname.replace(/\/demo\/?$/, '/canvas')}${location.searchStr}` });
  },
  component: () => null,
});
