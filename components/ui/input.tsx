import * as React from 'react';

import { cn } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = 'text', ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          'flex h-12 w-full rounded-2xl border border-slate-800/80 bg-slate-950/80 px-4 text-sm text-slate-100 shadow-[0_0_0_1px_rgba(15,23,42,0.4)] outline-none transition placeholder:text-slate-500 focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/20',
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';
