// Shared brand primitives so the landing page and the app itself render as
// one continuous product instead of a marketing site bolted onto a generic
// dashboard.

export function LogoMark() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0">
      <rect width="32" height="32" fill="black" />
      <rect x="4" y="4" width="10" height="10" fill="white" />
      <rect x="18" y="18" width="10" height="10" fill="white" />
    </svg>
  );
}

export function SheenLink({
  href,
  className,
  sheenClassName,
  children,
}: {
  href: string;
  className: string;
  sheenClassName: string;
  children: React.ReactNode;
}) {
  return (
    <a href={href} className={`group relative overflow-hidden transition-transform hover:scale-[1.02] ${className}`}>
      <span className="relative z-10">{children}</span>
      <span
        className={`pointer-events-none absolute inset-0 -translate-x-full skew-x-[-15deg] transition-transform duration-700 ease-out group-hover:translate-x-[220%] ${sheenClassName}`}
      />
    </a>
  );
}

export function SheenButton({
  className,
  sheenClassName,
  children,
  ...rest
}: {
  className: string;
  sheenClassName: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`group relative overflow-hidden transition-transform hover:scale-[1.02] disabled:pointer-events-none disabled:opacity-40 ${className}`}
      {...rest}
    >
      <span className="relative z-10">{children}</span>
      <span
        className={`pointer-events-none absolute inset-0 -translate-x-full skew-x-[-15deg] transition-transform duration-700 ease-out group-hover:translate-x-[220%] ${sheenClassName}`}
      />
    </button>
  );
}
