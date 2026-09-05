import type {
  DialogHTMLAttributes,
  DetailsHTMLAttributes,
  FieldsetHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
} from "react";
import { forwardRef } from "react";
import { cx } from "./utils";

export const Label = forwardRef<
  HTMLLabelElement,
  LabelHTMLAttributes<HTMLLabelElement>
>(function Label({ className, ...props }, ref) {
  return (
    <label
      ref={ref}
      className={cx("aow-label", className)}
      data-slot="label"
      {...props}
    />
  );
});

export const Fieldset = forwardRef<
  HTMLFieldSetElement,
  FieldsetHTMLAttributes<HTMLFieldSetElement>
>(function Fieldset({ className, ...props }, ref) {
  return (
    <fieldset
      ref={ref}
      className={cx("fieldset", className)}
      data-slot="fieldset"
      {...props}
    />
  );
});

export const Legend = forwardRef<
  HTMLLegendElement,
  HTMLAttributes<HTMLLegendElement>
>(function Legend({ className, ...props }, ref) {
  return (
    <legend
      ref={ref}
      className={cx("fieldset-legend", className)}
      data-slot="legend"
      {...props}
    />
  );
});

export const Details = forwardRef<HTMLDetailsElement, DetailsHTMLAttributes<HTMLDetailsElement>>(
  function Details({ className, ...props }, ref) {
    return <details ref={ref} className={className} data-slot="details" {...props} />;
  },
);

export const Summary = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(
  function Summary({ className, ...props }, ref) {
    return (
      <summary ref={ref} className={className} data-slot="summary" {...props} />
    );
  },
);

export const Dialog = forwardRef<
  HTMLDialogElement,
  DialogHTMLAttributes<HTMLDialogElement>
>(function Dialog({ className, ...props }, ref) {
  return (
    <dialog
      ref={ref}
      className={cx("modal", className)}
      data-slot="dialog"
      {...props}
    />
  );
});

export interface RangeProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  tone?: "primary" | "secondary" | "accent" | "info";
  controlSize?: "xs" | "sm" | "md" | "lg";
}

const rangeTones = {
  primary: "range-primary",
  secondary: "range-secondary",
  accent: "range-accent",
  info: "range-info",
};

export function Range({ tone = "primary", controlSize = "md", className, ...props }: RangeProps) {
  return (
    <input
      type="range"
      className={cx(
        "range",
        rangeTones[tone],
        controlSize === "xs" && "range-xs",
        controlSize === "sm" && "range-sm",
        controlSize === "lg" && "range-lg",
        className,
      )}
      data-slot="range"
      {...props}
    />
  );
}

export interface StructuralCheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  slot?: "drawer-toggle" | "modal-toggle" | "collapse-toggle";
}

export function StructuralCheckbox({ slot = "drawer-toggle", className, ...props }: StructuralCheckboxProps) {
  return <input type="checkbox" className={cx(slot, className)} data-slot="structural-checkbox" {...props} />;
}

export interface ControlGroupProps extends HTMLAttributes<HTMLDivElement> {
  label?: ReactNode;
}

export function ControlGroup({ label, className, children, ...props }: ControlGroupProps) {
  return (
    <div className={cx("aow-control-group", className)} role="group" aria-label={typeof label === "string" ? label : undefined} {...props}>
      {label && <span className="aow-control-group__label">{label}</span>}
      {children}
    </div>
  );
}
