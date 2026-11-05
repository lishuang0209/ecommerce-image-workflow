import type {ComponentProps} from 'react';
import {ChevronDown} from 'lucide-react';
import {cn} from '@/lib/utils';

/** Native selection behavior with the workspace's 12px control inset. */
export function EcommerceSelect({className,children,...props}:ComponentProps<'select'>){
 return <span className="relative mt-1 block w-full">
  <select {...props} className={cn('peer min-h-10 w-full rounded-lg border border-white/15 bg-[var(--beat-surface)] text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 disabled:cursor-not-allowed disabled:opacity-50',className,'appearance-none pl-3 pr-10')}>{children}</select>
  <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--beat-text-3)] peer-disabled:opacity-50"/>
 </span>;
}
