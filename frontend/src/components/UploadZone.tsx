import { useCallback, useRef, useState } from "react";
import { FileUp, Upload } from "lucide-react";
import { cn } from "../design-system/util";
import { Button, Kbd } from "../design-system/primitives";

interface UploadZoneProps {
  onFileUpload: (file: File) => void;
  variant?: "full" | "compact";
}

const ACCEPTED_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
  "text/markdown",
  "application/epub+zip",
  "text/csv",
]);

const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".doc", ".txt", ".md", ".epub", ".csv"];

function isAccepted(file: File): boolean {
  if (ACCEPTED_TYPES.has(file.type)) return true;
  return ACCEPTED_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext));
}

export default function UploadZone({
  onFileUpload,
  variant = "full",
}: UploadZoneProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file && isAccepted(file)) onFileUpload(file);
    },
    [onFileUpload],
  );

  const onSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileUpload(file);
      e.target.value = "";
    }
  };

  if (variant === "compact") {
    return (
      <>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS.join(",")}
          onChange={onSelect}
          hidden
        />
        <Button
          variant="secondary"
          size="sm"
          leadingIcon={<Upload size={13} strokeWidth={1.5} />}
          onClick={() => inputRef.current?.click()}
          className="w-full justify-center"
        >
          Upload paper
        </Button>
      </>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "group flex cursor-pointer flex-col items-center justify-center rounded-md",
        "border border-dashed px-5 py-8 text-center",
        "transition-colors duration-base ease-smooth",
        dragging
          ? "border-accent bg-accent-soft"
          : "border-border-strong hover:border-fg-subtle hover:bg-bg-hover",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS.join(",")}
        onChange={onSelect}
        hidden
      />
      <div
        className={cn(
          "mb-3 flex h-9 w-9 items-center justify-center rounded-md border",
          dragging
            ? "border-accent/40 bg-accent-soft text-accent"
            : "border-border bg-bg-raised text-fg-muted",
        )}
      >
        <FileUp size={16} strokeWidth={1.5} />
      </div>
      <p className="text-sm font-medium text-fg">Drop a paper here</p>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-caps text-fg-subtle">
        pdf · docx · txt · md · epub
      </p>
      <p className="mt-3 text-xs text-fg-muted">
        or click to browse
      </p>
    </div>
  );
}
