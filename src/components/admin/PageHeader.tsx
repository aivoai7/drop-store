export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-black uppercase tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-xs text-neutral-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
