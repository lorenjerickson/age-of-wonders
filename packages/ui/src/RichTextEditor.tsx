import { useEffect, useRef } from "react";
import { Badge } from "./Badge";
import { IconButton } from "./Button";
import { FieldLabel, HelpText } from "./Field";
import { cx } from "./utils";

const ALLOWED_RICH_TEXT_ELEMENTS = new Set([
  "P", "DIV", "BR", "STRONG", "B", "EM", "I", "U", "H2", "H3",
  "UL", "OL", "LI", "BLOCKQUOTE", "A",
]);

export function sanitizeRichText(value: string): string {
  if (typeof DOMParser === "undefined") return value;
  const parsed = new DOMParser().parseFromString(value, "text/html");
  for (const element of Array.from(parsed.body.querySelectorAll("*"))) {
    if (!ALLOWED_RICH_TEXT_ELEMENTS.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      continue;
    }
    for (const attribute of Array.from(element.attributes)) {
      if (element.tagName !== "A" || attribute.name !== "href") {
        element.removeAttribute(attribute.name);
      }
    }
    if (element.tagName === "A") {
      const href = element.getAttribute("href") ?? "";
      if (!/^(https?:|mailto:)/i.test(href)) element.removeAttribute("href");
    }
  }
  return parsed.body.innerHTML;
}

export function richTextPlainText(value: string): string {
  if (typeof DOMParser === "undefined") {
    return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
  return (
    new DOMParser()
      .parseFromString(value, "text/html")
      .body.textContent?.replace(/\s+/g, " ")
      .trim() ?? ""
  );
}

export interface RichTextEditorProps {
  label: string;
  help?: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  protectedContent?: boolean;
  className?: string;
  disabled?: boolean;
}

const TOOLBAR = [
  { label: "Bold", icon: "B", command: "bold" },
  { label: "Italic", icon: "I", command: "italic" },
  { label: "Heading", icon: "H2", command: "formatBlock", value: "h2" },
  { label: "Bulleted list", icon: "•", command: "insertUnorderedList" },
  { label: "Numbered list", icon: "1.", command: "insertOrderedList" },
  { label: "Quote", icon: "❝", command: "formatBlock", value: "blockquote" },
] as const;

export function RichTextEditor({
  label,
  help,
  value,
  placeholder = "Start writing…",
  onChange,
  protectedContent = false,
  className,
  disabled = false,
}: RichTextEditorProps) {
  const editor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editor.current || document.activeElement === editor.current) return;
    const sanitized = sanitizeRichText(value);
    if (editor.current.innerHTML !== sanitized) editor.current.innerHTML = sanitized;
  }, [value]);

  function command(name: string, argument?: string) {
    if (disabled) return;
    editor.current?.focus();
    document.execCommand(name, false, argument);
    if (editor.current) onChange(sanitizeRichText(editor.current.innerHTML));
  }

  return (
    <div className={cx("aow-rich-text", className)}>
      <div className="aow-rich-text__heading">
        <div>
          <FieldLabel>{label}</FieldLabel>
          {help && <HelpText>{help}</HelpText>}
        </div>
        {protectedContent && <Badge tone="warning" outline size="sm">GM only</Badge>}
      </div>
      <div className="aow-rich-text__frame">
        <div role="toolbar" aria-label={`${label} formatting`} className="aow-rich-text__toolbar">
          {TOOLBAR.map((item) => (
            <IconButton
              key={item.label}
              type="button"
              tone="ghost"
              size="xs"
              aria-label={item.label}
              title={item.label}
              disabled={disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => command(item.command, "value" in item ? item.value : undefined)}
            >
              <span className={item.command === "italic" ? "italic" : undefined}>{item.icon}</span>
            </IconButton>
          ))}
          <span className="aow-rich-text__divider" aria-hidden="true" />
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => command("removeFormat")}
          >
            Clear style
          </button>
        </div>
        <div className="aow-rich-text__canvas">
          {!richTextPlainText(value) && <span className="aow-rich-text__placeholder">{placeholder}</span>}
          <div
            ref={editor}
            contentEditable={!disabled}
            suppressContentEditableWarning
            role="textbox"
            aria-label={label}
            aria-multiline="true"
            aria-disabled={disabled || undefined}
            className="aow-rich-text__editor"
            onInput={(event) => onChange(event.currentTarget.innerHTML)}
            onBlur={(event) => onChange(sanitizeRichText(event.currentTarget.innerHTML))}
          />
        </div>
      </div>
    </div>
  );
}
