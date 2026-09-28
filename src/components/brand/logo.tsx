import { cn } from "@/lib/utils";

/** Simple glasses mark on a rounded tile. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("size-9 shrink-0", className)} aria-hidden="true">
      <rect width="40" height="40" rx="11" className="fill-primary" />
      <g fill="none" className="stroke-primary-foreground" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="13" cy="21.5" r="5.6" />
        <circle cx="27" cy="21.5" r="5.6" />
        <path d="M18.6 20.4c.9-.9 1.9-.9 2.8 0" />
        <path d="M7.4 20 5.6 15.8" />
        <path d="M32.6 20 34.4 15.8" />
      </g>
    </svg>
  );
}

export function BrandName({ name, className }: { name: string; className?: string }) {
  return <span className={cn("font-semibold tracking-[0.14em] text-foreground uppercase", className)}>{name}</span>;
}
