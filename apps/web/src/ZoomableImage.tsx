import { useEffect, useRef, useState } from "react";
import { Button, Dialog } from "@aow/ui";

export function ZoomableImage({
  src,
  alt,
  className,
  onError,
}: {
  src: string;
  alt: string;
  className?: string;
  onError?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  return (
    <>
      <Button
        type="button"
        tone="ghost"
        className="block h-auto w-full cursor-zoom-in rounded-none border-0 p-0 focus-visible:outline-2 focus-visible:outline-primary"
        aria-label={`View ${alt || "image"} full screen`}
        onClick={() => {
          setZoom(1);
          setOpen(true);
        }}
      >
        <img src={src} alt={alt} className={className} onError={onError} />
      </Button>
      <Dialog
        ref={dialog}
        aria-label={`${alt || "Image"} · full-screen viewer`}
        className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-base-100 p-0 text-base-content"
        onClose={() => setOpen(false)}
      >
        {open && (
          <div className="flex h-full flex-col">
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-base-300 p-3">
              <p className="mr-auto min-w-0 flex-1 truncate font-medium">
                {alt || "Image"}
              </p>
              <Button
                type="button"
                aria-label="Zoom out"
                disabled={zoom <= 1}
                onClick={() => setZoom((value) => Math.max(1, value - 0.5))}
              >
                −
              </Button>
              <output aria-live="polite" className="min-w-12 text-center">
                {Math.round(zoom * 100)}%
              </output>
              <Button
                type="button"
                aria-label="Zoom in"
                disabled={zoom >= 4}
                onClick={() => setZoom((value) => Math.min(4, value + 0.5))}
              >
                +
              </Button>
              <Button type="button" onClick={() => setZoom(1)}>
                Fit
              </Button>
              <Button type="button" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
            <div
              className="min-h-0 flex-1 overflow-auto"
              tabIndex={0}
              aria-label="Image pan area"
            >
              <div
                style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}
              >
                <img
                  src={src}
                  alt={alt}
                  className="h-full w-full object-contain"
                />
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
