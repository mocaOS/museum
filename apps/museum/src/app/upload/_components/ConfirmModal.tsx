"use client";

import { useState } from "react";
import Modal from "@/components/admin/Modal";
import { Button, ErrorBanner, Input } from "@/components/admin/ui";
import { t } from "@/lib/i18n";

export default function ConfirmModal({
  open,
  title,
  body,
  confirmLabel,
  confirmVariant = "danger",
  confirmPhrase,
  confirmPhraseLabel,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  confirmVariant?: "danger" | "primary";
  confirmPhrase?: string;
  confirmPhraseLabel?: string;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsPhrase = !!confirmPhrase;
  const phraseOk = !needsPhrase || typed === confirmPhrase;

  async function handle() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      setTyped("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <Modal
      open
      onClose={() => {
        if (!busy) {
          setTyped("");
          setError(null);
          onClose();
        }
      }}
      title={title}
      footer={
        <>
          <Button
            variant="ghost"
            type="button"
            onClick={() => {
              if (busy) return;
              setTyped("");
              setError(null);
              onClose();
            }}
          >
            {t("cancel")}
          </Button>
          <Button
            variant={confirmVariant}
            type="button"
            disabled={busy || !phraseOk}
            onClick={handle}
          >
            {busy ? t("deleting") : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="text-[13px]" style={{ color: "var(--fg1)" }}>
          {body}
        </div>
        {needsPhrase && (
          <Input
            label={confirmPhraseLabel}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoFocus
          />
        )}
        <ErrorBanner message={error} />
      </div>
    </Modal>
  );
}
