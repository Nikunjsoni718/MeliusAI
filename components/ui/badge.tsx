import * as React from 'react';

import { cn } from '@/lib/utils';

type BadgeVariant = 'default' | 'outline' | 'accent' | 'creative';

const badgeStyles: Record<BadgeVariant, string> = {
  default: 'bg-slate-900 text-slate-200 ring-1 ring-slate-800',
  outline: 'border border-slate-800 bg-transparent text-slate-300',
  accent: 'bg-sky-500/15 text-sky-300 ring-1 ring-inset ring-sky-500/30',
  creative: 'bg-fuchsia-500/15 text-fuchsia-200 ring-1 ring-inset ring-fuchsia-500/30',
};

export function Badge({
  className,
  variant = 'default',
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium tracking-wide',
        badgeStyles[variant],
        className
      )}
      {...props}
    />
  );
}
