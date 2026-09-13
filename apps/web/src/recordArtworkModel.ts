const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const creatureImageViews = [
  ["portrait", "Portrait"],
  ["overheadToken", "Overhead token"],
  ["paperDollToken", "Side-view token"],
] as const;

export function creatureImageReferences(payload: unknown) {
  const record = object(payload);
  const canonical = object(object(object(record.components).art).images);
  const legacy = object(record.images);
  const preserved = object(
    object(object(record.extensions)["aow:legacy-creature"]).payload,
  );
  const archived = object(preserved.images);
  return Object.fromEntries(
    creatureImageViews.map(([key]) => [
      key,
      canonical[key] ?? legacy[key] ?? archived[key],
    ]),
  );
}

export function hasImageReference(image: unknown): boolean {
  const assetId = object(image).assetId;
  return typeof assetId === "string" && assetId.trim().length > 0;
}

export function recordThumbnail(payload: unknown): unknown {
  const record = object(payload);
  const images = creatureImageReferences(record);
  return [record.image, ...creatureImageViews.map(([key]) => images[key])].find(
    hasImageReference,
  );
}
