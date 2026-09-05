import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { Field } from "./Field";
import { cx } from "./utils";

export interface FileInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  controlSize?: "sm" | "md" | "lg";
}

export const FileInput = forwardRef<HTMLInputElement, FileInputProps>(
  function FileInput({ controlSize = "md", className, ...props }, ref) {
  return (
    <input
      ref={ref}
      type="file"
      className={cx(
        "file-input w-full",
        controlSize === "sm" && "file-input-sm",
        controlSize === "lg" && "file-input-lg",
        className,
      )}
      {...props}
    />
  );
  },
);

export interface FileInputFieldProps extends FileInputProps {
  label: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  fieldClassName?: string;
}

export function FileInputField({ label, help, error, required, fieldClassName, ...props }: FileInputFieldProps) {
  return (
    <Field label={label} help={help} error={error} required={required} className={fieldClassName}>
      <FileInput required={required} {...props} />
    </Field>
  );
}
