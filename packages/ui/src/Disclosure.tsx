import type { DetailsHTMLAttributes, ReactNode } from "react";
import { cx } from "./utils";

export interface DisclosureProps extends DetailsHTMLAttributes<HTMLDetailsElement> {
  summary: ReactNode;
  children: ReactNode;
}

export function Disclosure({ summary, children, className, ...props }: DisclosureProps) {
  return (
    <details className={cx("collapse collapse-arrow border border-base-300 bg-base-200", className)} {...props}>
      <summary className="collapse-title font-semibold">{summary}</summary>
      <div className="collapse-content">{children}</div>
    </details>
  );
}
