import { useEffect, useState } from "react";
import { getMediaDownloadUrl } from "./api";

export function MediaImage({
  image,
  name,
  className = "",
}: {
  image: unknown;
  name: string;
  className?: string;
}) {
  const reference =
    image && typeof image === "object" && !Array.isArray(image)
      ? (image as Record<string, unknown>)
      : {};
  const assetId =
    typeof reference.assetId === "string" ? reference.assetId : "";
  const altText =
    typeof reference.altText === "string" && reference.altText.trim()
      ? reference.altText
      : name;
  const [preview, setPreview] = useState<{
    assetId: string;
    url?: string;
    failed?: boolean;
  }>({ assetId: "" });

  useEffect(() => {
    let cancelled = false;
    if (assetId) {
      void getMediaDownloadUrl(assetId).then(
        ({ url }) => {
          if (!cancelled) setPreview({ assetId, url });
        },
        () => {
          if (!cancelled) setPreview({ assetId, failed: true });
        },
      );
    }
    return () => {
      cancelled = true;
    };
  }, [assetId]);

  const current = preview.assetId === assetId ? preview : undefined;
  return (
    <div
      className={`flex aspect-square items-center justify-center overflow-hidden rounded-box bg-base-100 ${className}`}
    >
      {current?.url && !current.failed ? (
        <img
          src={current.url}
          alt={altText}
          loading="lazy"
          className="h-full w-full object-contain p-3"
          onError={() => setPreview({ assetId, failed: true })}
        />
      ) : (
        <span className="p-4 text-sm text-base-content/55">
          {!assetId
            ? "No image yet"
            : current?.failed
              ? "Image unavailable"
              : "Loading image…"}
        </span>
      )}
    </div>
  );
}
