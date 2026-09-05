import {
  forwardRef,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { Field } from "./Field";
import { cx } from "./utils";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  controlSize?: "sm" | "md" | "lg";
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { controlSize = "md", className, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cx(
        "select w-full",
        controlSize === "sm" && "select-sm",
        controlSize === "lg" && "select-lg",
        className,
      )}
      {...props}
    />
  );
});

export interface SelectFieldProps extends SelectProps {
  label: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  fieldClassName?: string;
}

export function SelectField({ label, help, error, required, fieldClassName, ...props }: SelectFieldProps) {
  return (
    <Field label={label} help={help} error={error} required={required} className={fieldClassName}>
      <Select required={required} {...props} />
    </Field>
  );
}
