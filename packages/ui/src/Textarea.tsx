import {
  forwardRef,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { Field } from "./Field";
import { cx } from "./utils";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  resize?: "none" | "vertical" | "both";
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ resize = "vertical", className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cx(
        "textarea min-h-28 w-full leading-7",
        resize === "none" && "resize-none",
        resize === "vertical" && "resize-y",
        className,
      )}
      {...props}
    />
  );
  },
);

export interface TextareaFieldProps extends TextareaProps {
  label: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  fieldClassName?: string;
}

export function TextareaField({ label, help, error, required, fieldClassName, ...props }: TextareaFieldProps) {
  return (
    <Field label={label} help={help} error={error} required={required} className={fieldClassName}>
      <Textarea required={required} {...props} />
    </Field>
  );
}
