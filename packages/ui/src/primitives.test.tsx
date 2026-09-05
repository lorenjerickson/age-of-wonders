import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "./Button";
import { Field } from "./Field";
import { CompactInput, Input } from "./Input";
import { ActionCard, ActionSurface } from "./Layout";
import { richTextPlainText, sanitizeRichText } from "./RichTextEditor";
import { StatusIndicator } from "./StatusIndicator";

describe("UI primitive contracts", () => {
  it("renders an interactive card as card-styled button without btn chrome", () => {
    const markup = renderToStaticMarkup(
      <ActionCard className="bg-base-100">Open location</ActionCard>,
    );

    expect(markup).toMatch(/^<button[^>]*class="[^"]*\bcard\b[^"]*"/);
    expect(markup).not.toMatch(/class="[^"]*\bbtn\b/);
    expect(markup).toContain('type="button"');
  });

  it("renders a chrome-free action surface as a native button", () => {
    const markup = renderToStaticMarkup(
      <ActionSurface className="absolute inset-0">Choose map point</ActionSurface>,
    );

    expect(markup).toMatch(/^<button/);
    expect(markup).toContain('type="button"');
    expect(markup).toContain('class="absolute inset-0"');
    expect(markup).not.toMatch(/class="[^"]*\b(?:btn|card)\b/);
  });

  it("does not add a semantic button tone unless requested", () => {
    const markup = renderToStaticMarkup(
      <Button className="btn-primary">Save</Button>,
    );

    expect(markup).toContain("btn-primary");
    expect(markup).not.toContain("btn-neutral");
  });

  it("maps generic input types without conflicting control classes", () => {
    expect(renderToStaticMarkup(<Input type="checkbox" />)).toContain(
      'class="checkbox"',
    );
    expect(
      renderToStaticMarkup(<Input type="checkbox" className="toggle" />),
    ).toContain('class="toggle"');
    expect(
      renderToStaticMarkup(
        <Input type="checkbox" className="drawer-toggle" />,
      ),
    ).toContain('class="drawer-toggle"');
    expect(renderToStaticMarkup(<Input type="hidden" name="state" />)).not.toContain(
      "input w-full",
    );
  });

  it("connects a field label and help text to its control", () => {
    const markup = renderToStaticMarkup(
      <Field label="Campaign name" help="Visible to players">
        <Input />
      </Field>,
    );

    expect(markup).toMatch(/<label[^>]+for="([^"]+)"/);
    expect(markup).toMatch(/<input[^>]+aria-describedby="[^"]+-help"/);
    expect(markup.indexOf("<label")).toBeLessThan(markup.indexOf("<input"));
    expect(markup.indexOf("<input")).toBeLessThan(markup.indexOf("-help"));
  });

  it("renders compact fields with the label inside the control boundary", () => {
    const markup = renderToStaticMarkup(
      <CompactInput label="Scale" help="Percentage" />,
    );

    expect(markup).toMatch(/<label[^>]+class="input w-full"[^>]*>/);
    expect(markup).toContain('<span class="label text-base-content/55">Scale</span>');
    expect(markup.indexOf("Scale")).toBeLessThan(markup.indexOf("<input"));
  });

  it("keeps status meaning in visible text", () => {
    const markup = renderToStaticMarkup(
      <StatusIndicator tone="success" label="Saved" />,
    );

    expect(markup).toContain("status-success");
    expect(markup).toContain("Saved");
  });

  it("makes loading buttons non-submit, disabled, and busy by default", () => {
    const markup = renderToStaticMarkup(<Button loading>Saving</Button>);

    expect(markup).toContain('type="button"');
    expect(markup).toContain("disabled");
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("loading-spinner");
  });

  it("provides a server-safe rich text plain-text fallback", () => {
    expect(richTextPlainText("<h2>Secret</h2><p>Clue</p>")).toBe(
      "Secret Clue",
    );
    expect(sanitizeRichText("<p>Trusted at the browser boundary</p>")).toBe(
      "<p>Trusted at the browser boundary</p>",
    );
  });
});
