import * as React from "react";

import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "outline";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    href?: string;
  };

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-sky-500 text-slate-950 shadow-[0_0_0_1px_rgba(14,165,233,0.35),0_0_40px_rgba(0,112,243,0.25)] hover:bg-sky-400",
  secondary:
    "border border-slate-800 bg-slate-900/80 text-slate-100 hover:border-sky-500/40 hover:bg-slate-900",
  ghost: "text-slate-300 hover:bg-slate-900 hover:text-white",
  outline:
    "border border-slate-800 bg-transparent text-slate-100 hover:border-sky-500/40 hover:bg-slate-900/60",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-12 px-6 text-base",
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  href,
  type,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(
    "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:pointer-events-none disabled:opacity-50",
    variantStyles[variant],
    sizeStyles[size],
    className
  );

  if (href) {
    return (
      <a className={classes} href={href} {...props}>
        {children}
      </a>
    );
  }

  return (
    <button className={classes} type={type ?? "button"} {...props}>
      {children}
    </button>
  );
}
