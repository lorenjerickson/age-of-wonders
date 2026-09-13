import { useRef, useState } from "react";
import { Alert, Button, Field, Textarea } from "@aow/ui";
import {
  ApiRequestError,
  generateWorldArtwork,
  type ArtworkRole,
  type JsonValue,
} from "./api";
import { MediaImage } from "./MediaImage";

type Image = Record<string, JsonValue>;
export function ArtworkGenerator({
  worldId,
  storageRevision,
  role,
  label,
  name,
  description,
  direction,
  hasImage,
  disabled,
  onApply,
  onBusyChange,
}: {
  worldId: string;
  storageRevision: number;
  role: ArtworkRole;
  label: string;
  name: string;
  description: string;
  direction: string;
  hasImage: boolean;
  disabled: boolean;
  onApply: (image: Image) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{
    image: Image;
    storageRevision: number;
  }>();
  const [error, setError] = useState("");
  const retry = useRef<{ fingerprint: string; key: string } | undefined>(
    undefined,
  );
  async function generate() {
    const input = {
      expectedStorageRevision: storageRevision,
      role,
      name,
      description,
      direction: [direction, notes].filter(Boolean).join("\n\n"),
    };
    const fingerprint = JSON.stringify(input);
    if (retry.current?.fingerprint !== fingerprint)
      retry.current = { fingerprint, key: crypto.randomUUID() };
    setBusy(true);
    onBusyChange(true);
    setError("");
    try {
      setPreview(await generateWorldArtwork(worldId, input, retry.current.key));
      retry.current = undefined;
    } catch (error) {
      setError(
        error instanceof ApiRequestError && error.status === 409
          ? "This World draft changed. Reload before generating artwork."
          : error instanceof ApiRequestError && error.status === 429
            ? "Image generation is temporarily limited. Please try again later."
            : error instanceof ApiRequestError && error.status === 504
              ? "Artwork generation took too long. Please try again; your current image is unchanged."
              : "Artwork could not be generated. Try again; your current image is unchanged.",
      );
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }
  return (
    <div className="mt-3 space-y-3">
      {!open ? (
        <Button
          type="button"
          disabled={disabled || !name.trim()}
          onClick={() => setOpen(true)}
        >
          {hasImage ? "Regenerate" : "Generate"} {label.toLowerCase()}
        </Button>
      ) : (
        <>
          <Field label={`${label} instructions (optional)`}>
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              disabled={busy}
              maxLength={2000}
              className="w-full"
            />
          </Field>
          <p className="text-sm text-base-content/65">
            Generate a preview, then choose whether to use it. Save the editor
            to keep your choice.
          </p>
          {busy && (
            <p role="status" className="text-sm text-base-content/65">
              High-quality artwork can take several minutes. Keep this editor
              open while it generates.
            </p>
          )}
          {preview && (
            <>
              <MediaImage image={preview.image} name={`${label} preview`} />
              {preview.storageRevision !== storageRevision && (
                <Alert>
                  This preview belongs to an older draft. Generate a new
                  preview.
                </Alert>
              )}
              <Button
                type="button"
                disabled={
                  disabled ||
                  busy ||
                  preview.storageRevision !== storageRevision
                }
                onClick={() => {
                  onApply(preview.image);
                  setPreview(undefined);
                  setOpen(false);
                }}
              >
                Use this image
              </Button>
            </>
          )}
          {error && <Alert>{error}</Alert>}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={disabled || busy || !name.trim()}
              onClick={() => void generate()}
            >
              {busy
                ? "Generating…"
                : preview
                  ? "Generate another preview"
                  : "Generate preview"}
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                setPreview(undefined);
                setOpen(false);
                setError("");
              }}
            >
              Discard / close
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
