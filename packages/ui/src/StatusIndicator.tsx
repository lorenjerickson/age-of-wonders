import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./utils";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "error";
export interface StatusIndicatorProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
  label: ReactNode;
  pulse?: boolean;
}

const statusClasses: Record<StatusTone, string> = {
  neutral: "status-neutral",
  info: "status-info",
  success: "status-success",
  warning: "status-warning",
  error: "status-error",
};

export function StatusIndicator({ tone = "neutral", label, pulse = false, className, ...props }: StatusIndicatorProps) {
  return (
    <span className={cx("aow-status", className)} {...props}>
      <span className={cx("status", statusClasses[tone], pulse && "animate-pulse")} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: StatusTone;
  title?: ReactNode;
}

const alertClasses: Record<StatusTone, string> = {
  neutral: "",
  info: "alert-info",
  success: "alert-success",
  warning: "alert-warning",
  error: "alert-error",
};

export function Alert({ tone = "neutral", title, children, className, role, ...props }: AlertProps) {
  return (
    <div className={cx("alert", alertClasses[tone], className)} role={role ?? (tone === "error" ? "alert" : "status")} {...props}>
      <div>
        {title && <p className="font-semibold">{title}</p>}
        <div className="text-sm">{children}</div>
      </div>
    </div>
  );
}
