import * as React from "react";
import { cn } from "@/lib/utils";

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    borderColor?: "default" | "green" | "yellow" | "purple";
  }
>(({ className, borderColor = "default", ...props }, ref) => {
  const borderClasses = {
    default: "border-brand-accent/50 shadow-[0_0_0_4px_rgba(107,141,179,0.12),0_0_15px_rgba(107,141,179,0.18),0_0_25px_rgba(107,141,179,0.12)]",
    green: "border-success/60 shadow-[0_0_0_4px_rgba(16,185,129,0.15),0_0_15px_rgba(16,185,129,0.2),0_0_25px_rgba(34,197,94,0.1)]",
    yellow: "border-warning/60 shadow-[0_0_0_4px_rgba(245,158,11,0.15),0_0_15px_rgba(245,158,11,0.2),0_0_25px_rgba(251,191,36,0.1)]",
    purple: "border-[#A855F7]/60 shadow-[0_0_0_4px_rgba(168,85,247,0.15),0_0_15px_rgba(168,85,247,0.2),0_0_25px_rgba(192,132,252,0.1)]",
  };

  return (
    <div
      ref={ref}
      className={cn(
        "rounded-2xl border-[4px] bg-brand-card shadow-sm",
        borderClasses[borderColor],
        className
      )}
      style={{
        backgroundColor: 'var(--brand-card)',
      }}
      {...props}
    />
  );
});
Card.displayName = "Card";

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-xl font-semibold leading-none tracking-tight text-[#1e3a8a]",
      className
    )}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-black", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
