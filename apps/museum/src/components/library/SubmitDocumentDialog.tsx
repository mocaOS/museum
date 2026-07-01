"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useWallet } from "@/hooks/useWallet";
import { useAuthSession } from "@/hooks/useAuthSession";

const ACCEPT = ".pdf,.txt,.md,.docx,.xlsx";
const ALLOWED_EXT = [".pdf", ".txt", ".md", ".docx", ".xlsx"];
const MAX_BYTES = 50 * 1024 * 1024;

const CloseIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

const UploadIcon = () => (
  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" x2="12" y1="3" y2="15" />
  </svg>
);

const CheckIcon = () => (
  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

type Phase = "idle" | "signing" | "uploading" | "done";

export function SubmitDocumentDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { isConnected } = useWallet();
  const { isAuthenticated, signIn } = useAuthSession();
  const [mounted, setMounted] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setMounted(true), []);

  // Reset when the dialog is (re)opened.
  useEffect(() => {
    if (open) {
      setFile(null);
      setTitle("");
      setPhase("idle");
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase !== "uploading" && phase !== "signing") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, phase]);

  if (!open || !mounted) return null;

  const busy = phase === "signing" || phase === "uploading";

  const pickFile = (f: File | null) => {
    setError(null);
    if (!f) return;
    if (!ALLOWED_EXT.includes(extOf(f.name))) {
      setError(`Unsupported type. Allowed: ${ALLOWED_EXT.join(", ")}`);
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("File too large (max 50 MB)");
      return;
    }
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
  };

  const submit = async () => {
    if (!file) {
      setError("Choose a file first");
      return;
    }
    setError(null);
    try {
      if (!isAuthenticated) {
        setPhase("signing");
        await signIn();
      }
      setPhase("uploading");
      const form = new FormData();
      form.append("file", file, file.name);
      if (title.trim()) form.append("title", title.trim());
      const res = await fetch("/api/library/submissions", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Submission failed (${res.status})`);
      }
      setPhase("done");
    } catch (err) {
      setPhase("idle");
      setError(err instanceof Error ? err.message : "Submission failed");
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Submit a document">
      <button
        type="button"
        aria-label="Close"
        onClick={() => !busy && onClose()}
        className="absolute inset-0 cursor-default"
        style={{ background: "oklch(0 0 0 / 0.6)" }}
      />

      <div
        className="relative flex w-full max-w-[520px] flex-col rounded-[var(--radius-xl)] border p-6"
        style={{
          background: "var(--popover)",
          borderColor: "var(--border)",
          boxShadow: "var(--shadow-xl)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
        }}
      >
        <div className="mb-1 flex items-start justify-between">
          <h2 className="text-lg" style={{ color: "var(--fg1)", letterSpacing: "-0.015em" }}>
            Submit a document
          </h2>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-[var(--radius)] transition-colors hover:bg-[var(--muted)]"
            style={{ color: "var(--fg2)" }}
          >
            <CloseIcon />
          </button>
        </div>
        <p className="mb-5 text-sm" style={{ color: "var(--fg2)" }}>
          Contribute to the MOCA Library. Submissions are reviewed by the museum
          before joining the Collective knowledge base.
        </p>

        {phase === "done" ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <span style={{ color: "var(--accent)" }}>
              <CheckIcon />
            </span>
            <p className="text-sm" style={{ color: "var(--fg1)" }}>
              Submitted for review. Thank you — an admin will approve it into the
              Library.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 rounded-[var(--radius)] border px-4 py-2 text-sm transition-colors hover:bg-[var(--muted)]"
              style={{ borderColor: "var(--border)", color: "var(--fg1)" }}
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Dropzone / file picker */}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                pickFile(e.dataTransfer.files?.[0] ?? null);
              }}
              className="flex flex-col items-center gap-2 rounded-[var(--radius)] border border-dashed px-4 py-8 text-center transition-colors hover:bg-[var(--muted)]"
              style={{ borderColor: "var(--border)", color: "var(--fg2)" }}
            >
              <UploadIcon />
              {file ? (
                <span className="text-sm" style={{ color: "var(--fg1)" }}>
                  {file.name}{" "}
                  <span style={{ color: "var(--fg3)" }}>
                    ({(file.size / 1024 / 1024).toFixed(1)} MB)
                  </span>
                </span>
              ) : (
                <>
                  <span className="text-sm" style={{ color: "var(--fg1)" }}>
                    Drop a file or click to choose
                  </span>
                  <span className="text-[11px]" style={{ color: "var(--fg3)" }}>
                    PDF, TXT, MD, DOCX, XLSX · max 50 MB
                  </span>
                </>
              )}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />

            {/* Title */}
            <label className="mt-4 mb-1 block text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--fg2)" }}>
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Document title"
              maxLength={200}
              className="w-full rounded-[var(--radius)] border bg-transparent px-3 py-2 text-sm outline-none"
              style={{ borderColor: "var(--border)", color: "var(--fg1)" }}
            />

            {error && (
              <p className="mt-3 text-sm" style={{ color: "var(--destructive)" }}>
                {error}
              </p>
            )}

            {!isConnected && (
              <p className="mt-3 text-sm" style={{ color: "var(--fg2)" }}>
                Connect a wallet to submit.
              </p>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-[var(--radius)] border px-4 py-2 text-sm transition-colors hover:bg-[var(--muted)] disabled:opacity-50"
                style={{ borderColor: "var(--border)", color: "var(--fg1)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={busy || !file || !isConnected}
                className="rounded-[var(--radius)] px-4 py-2 text-sm font-medium transition-transform active:scale-[0.98] disabled:opacity-50"
                style={{ background: "var(--accent)", color: "oklch(0.2 0 0)" }}
              >
                {phase === "signing"
                  ? "Sign in wallet…"
                  : phase === "uploading"
                    ? "Submitting…"
                    : isAuthenticated
                      ? "Submit"
                      : "Sign in & submit"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
