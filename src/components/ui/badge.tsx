import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden backdrop-blur-xl ring-1 ring-purple-300/40 dark:ring-purple-400/20 shadow-[0_2px_8px_rgba(124,58,237,0.08)] dark:shadow-[0_2px_8px_rgba(124,58,237,0.15)]",
  {
    variants: {
      variant: {
        default:
          "bg-purple-50/60 text-purple-700 dark:bg-purple-950/30 dark:text-purple-300",
        secondary:
          "bg-purple-50/60 text-purple-700 dark:bg-purple-950/30 dark:text-purple-300",
        destructive:
          "bg-purple-50/60 text-purple-700 dark:bg-purple-950/30 dark:text-purple-300",
        outline:
          "bg-purple-50/60 text-purple-700 dark:bg-purple-950/30 dark:text-purple-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
