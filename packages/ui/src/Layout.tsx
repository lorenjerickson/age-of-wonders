import { forwardRef } from "react";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { Button, type ButtonProps } from "./Button";
import { cx } from "./utils";

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title?: ReactNode;
  actions?: ReactNode;
  as?: "article" | "section" | "div";
}

export function Card({ title, actions, as: Element = "section", className, children, ...props }: CardProps) {
  return (
    <Element className={cx("card border border-base-300 bg-base-200", className)} data-slot="card" {...props}>
      <div className="card-body">
        {(title || actions) && <div className="aow-card__heading">{title && <h2 className="card-title">{title}</h2>}{actions}</div>}
        {children}
      </div>
    </Element>
  );
}

export const Panel = Card;

export type ActionCardProps = ButtonHTMLAttributes<HTMLButtonElement>;

export const ActionCard = forwardRef<HTMLButtonElement, ActionCardProps>(
  function ActionCard({ className, type = "button", ...props }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={cx("card", className)}
        data-slot="action-card"
        {...props}
      />
    );
  },
);

export const CardButton = ActionCard;

export type ActionSurfaceProps = ButtonHTMLAttributes<HTMLButtonElement>;

export const ActionSurface = forwardRef<
  HTMLButtonElement,
  ActionSurfaceProps
>(function ActionSurface({ className, type = "button", ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={className}
      data-slot="action-surface"
      {...props}
    />
  );
});

export function Divider({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("divider", className)} role="separator" {...props} />;
}

export function Spinner({ className, "aria-label": ariaLabel = "Loading", ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cx("loading loading-spinner", className)} aria-label={ariaLabel} role="status" {...props} />;
}

export function FormSection({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cx("aow-form-section", className)} data-slot="form-section" {...props} />;
}

export function Toolbar({ className, "aria-label": ariaLabel, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("aow-toolbar", className)} role="toolbar" aria-label={ariaLabel} {...props} />;
}

export function ToolbarButton(props: ButtonProps) {
  return <Button tone="ghost" size="sm" {...props} />;
}

export interface TabsProps extends HTMLAttributes<HTMLDivElement> {
  boxed?: boolean;
}

export function Tabs({ boxed = false, className, ...props }: TabsProps) {
  return <div className={cx("tabs", boxed && "tabs-box", className)} role="tablist" {...props} />;
}

export interface TabProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "role"> {
  active?: boolean;
}

export function Tab({ active = false, className, children, ...props }: TabProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={cx("tab", active && "tab-active", className)}
      {...props}
    >
      {children}
    </button>
  );
}
