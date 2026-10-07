import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "h-12 w-full rounded-[10px] bg-elevated/80 px-4 text-base text-fg shadow-[var(--shadow-border)]",
          "placeholder:text-subtle",
          "outline-none transition-[box-shadow] duration-150",
          "focus-visible:shadow-[var(--shadow-border-hover)] focus-visible:ring-1 focus-visible:ring-ring/70",
          className,
        )}
        {...props}
      />
    );
  },
);
