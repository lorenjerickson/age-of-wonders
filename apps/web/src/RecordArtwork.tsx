import type { ReactNode } from "react";
import { MediaImage } from "./MediaImage";
import {
  creatureImageReferences,
  creatureImageViews,
  recordThumbnail,
} from "./recordArtworkModel";

export function RecordThumbnail({
  payload,
  name,
  className,
  onlyIfPresent = false,
}: {
  payload: unknown;
  name: string;
  className?: string;
  onlyIfPresent?: boolean;
}) {
  const image = recordThumbnail(payload);
  if (onlyIfPresent && !image) return null;
  return <MediaImage image={image} name={name} className={className} />;
}

export function CreatureArtwork({
  payload,
  name,
  renderControls,
}: {
  payload: unknown;
  name: string;
  renderControls?: (
    role: "portrait" | "overheadToken" | "paperDollToken",
    label: string,
    hasImage: boolean,
  ) => ReactNode;
}) {
  const images = creatureImageReferences(payload);
  return (
    <section
      aria-label="Creature artwork"
      className="grid gap-4 sm:grid-cols-3"
    >
      {creatureImageViews.map(([key, label]) => (
        <figure key={key}>
          <MediaImage image={images[key]} name={`${name} · ${label}`} />
          <figcaption className="mt-2 text-sm text-base-content/65">
            {label}
          </figcaption>
          {renderControls?.(key, label, Boolean(images[key]))}
        </figure>
      ))}
    </section>
  );
}
