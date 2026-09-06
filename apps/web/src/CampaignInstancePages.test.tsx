import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AsyncErrorSummary } from "./CampaignInstancePages";

describe("Campaign Instance async error summary", () => {
  it("is focusable and announced as one atomic alert", () => {
    const html = renderToStaticMarkup(
      <AsyncErrorSummary error="The invitation was not created." />,
    );

    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-atomic="true"');
    expect(html).toContain("There was a problem");
    expect(html).toContain("The invitation was not created.");
  });

  it("does not leave an empty announcement target", () => {
    expect(renderToStaticMarkup(<AsyncErrorSummary error="" />)).toBe("");
  });
});
