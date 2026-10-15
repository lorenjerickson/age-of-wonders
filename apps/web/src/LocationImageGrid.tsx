import { useId } from "react";

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Image-pixel grid; terrain maps own a separate physical coordinate system. */
export function LocationImageGrid({
  image,
  scene,
  map,
}: {
  image: unknown;
  scene: unknown;
  map: unknown;
}) {
  const id = useId();
  const picture = object(image);
  const presentation = object(scene);
  const grid = object(presentation.grid);
  const orientation =
    presentation.orientation ?? picture.orientation ?? "scenic";
  const size = grid.cellSizePixels;
  if (
    orientation === "scenic" ||
    object(map).kind === "isometric" ||
    (grid.kind !== "square" && grid.kind !== "hex") ||
    typeof size !== "number" ||
    !Number.isFinite(size) ||
    size <= 0 ||
    typeof picture.width !== "number" ||
    picture.width <= 0 ||
    typeof picture.height !== "number" ||
    picture.height <= 0
  )
    return null;
  const height = grid.kind === "hex" ? size * Math.sqrt(3) : size;
  return (
    <svg
      aria-hidden="true"
      className="astra-atlas-image-grid"
      viewBox={`0 0 ${picture.width} ${picture.height}`}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <pattern
          id={id}
          width={grid.kind === "hex" ? size * 3 : size}
          height={height}
          patternUnits="userSpaceOnUse"
        >
          <path
            fill="none"
            stroke="#ffffff70"
            strokeWidth="1"
            d={
              grid.kind === "square"
                ? `M ${size} 0 H 0 V ${size}`
                : `M 0 ${height / 2} L ${size / 2} 0 H ${size * 1.5} L ${size * 2} ${height / 2} L ${size * 1.5} ${height} H ${size / 2} Z M ${size * 2} ${height / 2} H ${size * 3}`
            }
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
