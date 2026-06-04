import * as React from 'react';

import { cn } from '@/lib/utils';

export function Progress({
  className,
  indicatorClassName,
  value = 0,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  indicatorClassName?: string;
  value?: number;
}) {
  return (
    <div
      className={cn(
        'relative h-2 w-full overflow-hidden rounded-full bg-slate-900 ring-1 ring-slate-800',
        className
      )}
      {...props}
    >
      <div
        className={cn(
          'h-full rounded-full bg-gradient-to-r from-sky-500 via-cyan-400 to-indigo-400 transition-all',
          indicatorClassName
        )}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
