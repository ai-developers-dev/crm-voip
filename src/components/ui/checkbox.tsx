"use client"

import * as React from "react"
import { CheckIcon } from "lucide-react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer size-6 shrink-0 rounded-full border-2 border-purple-300 bg-white shadow-xs transition-all outline-none",
        "focus-visible:ring-[3px] focus-visible:ring-purple-300/30",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        "data-[state=checked]:border-purple-500 data-[state=checked]:bg-white data-[state=checked]:text-muted-foreground",
        "dark:bg-zinc-950 dark:border-purple-500/50 dark:data-[state=checked]:border-purple-400 dark:data-[state=checked]:bg-zinc-950 dark:data-[state=checked]:text-muted-foreground",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        <CheckIcon className="size-4 stroke-[2.5]" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
