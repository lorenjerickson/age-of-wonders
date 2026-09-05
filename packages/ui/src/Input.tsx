import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { Field, type FieldProps } from "./Field";
import { cx } from "./utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  controlSize?: "sm" | "md" | "lg";
}

function inputClasses(
  type: InputProps["type"],
  controlSize: NonNullable<InputProps["controlSize"]>,
  className?: string,
) {
  if (type === "hidden") return "";
  if (type === "checkbox") {
    if (/\b(?:drawer|modal|collapse)-toggle\b/.test(className ?? "")) return "";
    if (/\btoggle\b/.test(className ?? "")) {
      return cx(
        controlSize === "sm" && "toggle-sm",
        controlSize === "lg" && "toggle-lg",
      );
    }
    return cx(
      !/\bcheckbox\b/.test(className ?? "") && "checkbox",
      controlSize === "sm" && "checkbox-sm",
      controlSize === "lg" && "checkbox-lg",
    );
  }
  if (type === "radio") return cx("radio", controlSize === "sm" && "radio-sm", controlSize === "lg" && "radio-lg");
  if (type === "range") return cx(!/\brange\b/.test(className ?? "") && "range", controlSize === "sm" && "range-sm", controlSize === "lg" && "range-lg");
  if (type === "file") return cx(!/\bfile-input\b/.test(className ?? "") && "file-input", "w-full", controlSize === "sm" && "file-input-sm", controlSize === "lg" && "file-input-lg");
  return cx(!/\binput\b/.test(className ?? "") && "input", "w-full", controlSize === "sm" && "input-sm", controlSize === "lg" && "input-lg");
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { controlSize = "md", className, type = "text", ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cx(inputClasses(type, controlSize, className), className)}
      data-slot="input"
      {...props}
    />
  );
});

export interface TextInputProps extends InputProps {
  label: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  fieldClassName?: string;
}

export function TextInput({ label, help, error, required, fieldClassName, ...props }: TextInputProps) {
  return (
    <Field label={label} help={help} error={error} required={required} className={fieldClassName}>
      <Input required={required} {...props} />
    </Field>
  );
}

export interface CompactInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  containerClassName?: string;
}

export function CompactInput({
  label,
  help,
  error,
  id: providedId,
  required,
  className,
  containerClassName,
  ...props
}: CompactInputProps) {
  const generatedId = useId();
  const id = providedId ?? `compact-field-${generatedId}`;
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={cx("aow-field", containerClassName)}>
      <label className={cx("input w-full", Boolean(error) && "input-error")} htmlFor={id}>
        <span className="label text-base-content/55">
          {label}{required && <span aria-hidden="true"> *</span>}
        </span>
        <input
          id={id}
          required={required}
          className={cx("grow", className)}
          aria-describedby={errorId ?? helpId}
          aria-invalid={Boolean(error) || undefined}
          {...props}
        />
      </label>
      {help && !error && <p id={helpId} className="aow-field__help">{help}</p>}
      {error && <p id={errorId} className="aow-field__error" role="alert">{error}</p>}
    </div>
  );
}
