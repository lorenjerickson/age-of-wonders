import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import { cx } from "./utils";

export interface FieldProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  label: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }>;
}

export function Field({ label, help, error, required, children, className, ...props }: FieldProps) {
  const generatedId = useId();
  const onlyChild = Children.only(children);
  const id = onlyChild.props.id ?? `field-${generatedId}`;
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [onlyChild.props["aria-describedby"], helpId, errorId]
    .filter(Boolean)
    .join(" ") || undefined;

  return (
    <div className={cx("aow-field", className)} {...props}>
      <label className="aow-field__label" htmlFor={id}>
        {label}
        {required && <span className="aow-field__required" aria-hidden="true"> *</span>}
      </label>
      {isValidElement(onlyChild)
        ? cloneElement(onlyChild, {
            id,
            "aria-describedby": describedBy,
            "aria-invalid": Boolean(error) || undefined,
          })
        : onlyChild}
      {help && !error && <p id={helpId} className="aow-field__help">{help}</p>}
      {error && <p id={errorId} className="aow-field__error" role="alert">{error}</p>}
    </div>
  );
}

export const FormField = Field;

export function FieldLabel({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cx("aow-field__label", className)} {...props} />;
}

export function HelpText({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cx("aow-field__help", className)} {...props} />;
}

export function FieldError({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cx("aow-field__error", className)} role="alert" {...props} />;
}
