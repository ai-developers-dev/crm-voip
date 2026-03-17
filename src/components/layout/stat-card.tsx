import { cn } from "@/lib/utils";

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  caption?: string;
  valueClassName?: string;
  className?: string;
}

export function StatCard({ icon: Icon, label, value, caption, valueClassName, className }: StatCardProps) {
  return (
    <div className={cn("rounded-xl border bg-card p-4", className)}>
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        <Icon className="h-4 w-4" />
        <span className="section-heading">{label}</span>
      </div>
      <p className={cn("stat-value-sm", valueClassName)}>{value}</p>
      {caption && <p className="caption-text mt-0.5">{caption}</p>}
    </div>
  );
}
