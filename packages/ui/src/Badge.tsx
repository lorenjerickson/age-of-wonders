import type { HTMLAttributes } from "react";
import { cx } from "./utils";

export type BadgeTone = "neutral" | "primary" | "secondary" | "accent" | "info" | "success" | "warning" | "error";
export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  outline?: boolean;
  size?: "sm" | "md" | "lg";
}

const toneClasses: Record<BadgeTone, string> = {
  neutral: "badge-neutral",
  primary: "badge-primary",
  secondary: "badge-secondary",
  accent: "badge-accent",
  info: "badge-info",
  success: "badge-success",
  warning: "badge-warning",
  error: "badge-error",
};

export function Badge({ tone, outline = false, size = "md", className, ...props }: BadgeProps) {
  return (
    <span
      className={cx(
        "badge",
        tone && toneClasses[tone],
        outline && "badge-outline",
        size === "sm" && "badge-sm",
        size === "lg" && "badge-lg",
        className,
      )}
      {...props}
    />
  );
}

export function Chip(props: BadgeProps) {
  return <Badge outline {...props} />;
}
