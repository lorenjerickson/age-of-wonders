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
  compact = false,
}: {
  payload: unknown;
  name: string;
  compact?: boolean;
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
      className={compact ? "grid gap-4" : "grid gap-4 sm:grid-cols-3"}
    >
      {creatureImageViews.map(([key, label]) => (
        <figure
          key={key}
          className={
            compact ? "rounded-box border border-base-300 p-3" : undefined
          }
        >
          <MediaImage
            image={images[key]}
            name={`${name} · ${label}`}
            className={compact ? "float-left mr-3 w-16" : undefined}
          />
          <figcaption className="mt-2 text-sm text-base-content/65">
            {label}
          </figcaption>
          <div className={compact ? "clear-both pt-3" : undefined}>
            {renderControls?.(key, label, Boolean(images[key]))}
          </div>
        </figure>
      ))}
    </section>
  );
}
