import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LocationPresentationSummary } from "./LocationPresentationSummary";
it("does not add empty optional presentation content", () => {
  expect(
    renderToStaticMarkup(
      <LocationPresentationSummary
        weather={undefined}
        audiovisualEffects={undefined}
      />,
    ),
  ).toBe("");
});
it("shows authored weather and named media settings without internal identifiers", () => {
  const html = renderToStaticMarkup(
    <LocationPresentationSummary
      weather={{
        condition: "Sea fog",
        temperatureCelsius: 9,
        wind: { speedKph: 12, directionDegrees: 225 },
      }}
      audiovisualEffects={[
        {
          id: "opaque-effect",
          assetId: "opaque-media",
          kind: "audio",
          name: "Harbor waves",
          enabled: true,
          loop: true,
          volume: 0.35,
        },
      ]}
    />,
  );
  expect(html).toContain("Sea fog");
  expect(html).toContain("9 °C");
  expect(html).toContain("Harbor waves");
  expect(html).toContain("Volume 0.35");
  expect(html).not.toContain("opaque-effect");
  expect(html).not.toContain("opaque-media");
});
it("masks imported opaque names and safely handles malformed collections", () => {
  const html = renderToStaticMarkup(
    <LocationPresentationSummary
      weather={{ condition: "550e8400-e29b-41d4-a716-446655440000" }}
      audiovisualEffects={[
        {
          id: "effect-id",
          assetId: "media-id",
          kind: "visual",
          name: "effect-id",
          enabled: false,
          loop: false,
        },
      ]}
    />,
  );
  expect(html).toContain("Weather configured");
  expect(html).toContain("Effect 1");
  expect(html).not.toContain("effect-id");
  expect(html).not.toContain("550e8400");
  expect(() =>
    renderToStaticMarkup(
      <LocationPresentationSummary
        weather={{ condition: "Rain" }}
        audiovisualEffects={{ unsupported: true }}
      />,
    ),
  ).not.toThrow();
});
