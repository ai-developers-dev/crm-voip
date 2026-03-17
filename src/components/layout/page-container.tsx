import { cn } from "@/lib/utils";

interface PageContainerProps {
  variant?: "scroll" | "full" | "settings";
  children: React.ReactNode;
  className?: string;
}

export function PageContainer({ variant = "scroll", children, className }: PageContainerProps) {
  const variants = {
    scroll: "page-scroll",
    full: "page-full",
    settings: "page-settings",
  };

  return (
    <div className={cn(variants[variant], className)}>
      {children}
    </div>
  );
}
