import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cx } from "./utils";

interface ChoiceProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: ReactNode;
  help?: ReactNode;
  tone?: "primary" | "secondary" | "accent" | "info";
  controlSize?: "xs" | "sm" | "md" | "lg";
  wrapperClassName?: string;
}

const checkboxTones = {
  primary: "checkbox-primary",
  secondary: "checkbox-secondary",
  accent: "checkbox-accent",
  info: "checkbox-info",
};
const toggleTones = {
  primary: "toggle-primary",
  secondary: "toggle-secondary",
  accent: "toggle-accent",
  info: "toggle-info",
};
const radioTones = {
  primary: "radio-primary",
  secondary: "radio-secondary",
  accent: "radio-accent",
  info: "radio-info",
};

function ChoiceLayout({ id, label, help, children, className }: {
  id: string;
  label?: ReactNode;
  help?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  if (!label) return children;
  return (
    <label className={cx("aow-choice", className)} htmlFor={id}>
      {children}
      <span>
        <span className="aow-choice__label">{label}</span>
        {help && <span className="aow-choice__help">{help}</span>}
      </span>
    </label>
  );
}

export function Checkbox({ label, help, tone = "primary", controlSize = "md", id: providedId, className, wrapperClassName, ...props }: ChoiceProps) {
  const generatedId = useId();
  const id = providedId ?? `checkbox-${generatedId}`;
  return (
    <ChoiceLayout id={id} label={label} help={help} className={wrapperClassName}>
      <input id={id} type="checkbox" className={cx("checkbox", checkboxTones[tone], controlSize === "xs" && "checkbox-xs", controlSize === "sm" && "checkbox-sm", controlSize === "lg" && "checkbox-lg", className)} {...props} />
    </ChoiceLayout>
  );
}

export function Toggle({ label, help, tone = "primary", controlSize = "md", id: providedId, className, wrapperClassName, ...props }: ChoiceProps) {
  const generatedId = useId();
  const id = providedId ?? `toggle-${generatedId}`;
  return (
    <ChoiceLayout id={id} label={label} help={help} className={wrapperClassName}>
      <input id={id} type="checkbox" className={cx("toggle", toggleTones[tone], controlSize === "xs" && "toggle-xs", controlSize === "sm" && "toggle-sm", controlSize === "lg" && "toggle-lg", className)} {...props} />
    </ChoiceLayout>
  );
}

export function Radio({ label, help, tone = "primary", controlSize = "md", id: providedId, className, wrapperClassName, ...props }: ChoiceProps) {
  const generatedId = useId();
  const id = providedId ?? `radio-${generatedId}`;
  return (
    <ChoiceLayout id={id} label={label} help={help} className={wrapperClassName}>
      <input id={id} type="radio" className={cx("radio", radioTones[tone], controlSize === "xs" && "radio-xs", controlSize === "sm" && "radio-sm", controlSize === "lg" && "radio-lg", className)} {...props} />
    </ChoiceLayout>
  );
}
