import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
} from "react";
import { forwardRef } from "react";
import { cx } from "./utils";

export type ButtonTone =
  | "primary"
  | "secondary"
  | "accent"
  | "neutral"
  | "ghost"
  | "outline"
  | "danger";
export type ControlSize = "xs" | "sm" | "md" | "lg";

const toneClasses: Record<ButtonTone, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  accent: "btn-accent",
  neutral: "btn-neutral",
  ghost: "btn-ghost",
  outline: "btn-outline",
  danger: "btn-error",
};

const sizeClasses: Record<ControlSize, string> = {
  xs: "btn-xs",
  sm: "btn-sm",
  md: "",
  lg: "btn-lg",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ButtonTone;
  size?: ControlSize;
  loading?: boolean;
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    tone,
    size = "md",
    loading = false,
    fullWidth = false,
    leadingIcon,
    trailingIcon,
    className,
    disabled,
    children,
    type = "button",
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        "btn",
        tone && toneClasses[tone],
        sizeClasses[size],
        fullWidth && "w-full",
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <span className="loading loading-spinner loading-sm" /> : leadingIcon}
      {children}
      {!loading && trailingIcon}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonProps, "leadingIcon" | "trailingIcon"> {
  "aria-label": string;
  shape?: "square" | "circle";
}

export function IconButton({ shape = "square", className, children, ...props }: IconButtonProps) {
  return (
    <Button
      className={cx(shape === "circle" ? "btn-circle" : "btn-square", className)}
      {...props}
    >
      {children}
    </Button>
  );
}

export interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  tone?: ButtonTone;
  size?: ControlSize;
  fullWidth?: boolean;
}

export function ButtonLink({
  tone,
  size = "md",
  fullWidth = false,
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <a
      className={cx(
        "btn",
        tone && toneClasses[tone],
        sizeClasses[size],
        fullWidth && "w-full",
        className,
      )}
      {...props}
    >
      {children}
    </a>
  );
}

export interface ButtonLabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  tone?: ButtonTone;
  size?: ControlSize;
  fullWidth?: boolean;
}

export function ButtonLabel({ tone, size = "md", fullWidth = false, className, ...props }: ButtonLabelProps) {
  return (
    <label
      className={cx("btn cursor-pointer", tone && toneClasses[tone], sizeClasses[size], fullWidth && "w-full", className)}
      data-slot="button-label"
      {...props}
    />
  );
}

export const FileInputTrigger = ButtonLabel;
