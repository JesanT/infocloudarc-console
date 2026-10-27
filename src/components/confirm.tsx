import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui";

type Ask = {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  run: () => void;
};

export function useConfirm() {
  const [pending, setPending] = useState<Ask | null>(null);

  function ask(next: Ask) {
    setPending(next);
  }

  const dialog: ReactNode = pending ? (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setPending(null)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="w-full max-w-md rounded-2xl border border-line bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="confirm-title" className="text-base font-medium text-ink">{pending.title}</h3>
        <p className="mt-2 text-sm text-muted">{pending.body}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setPending(null)}>Cancel</Button>
          <Button
            variant={pending.danger ? "danger" : "primary"}
            onClick={() => {
              const run = pending.run;
              setPending(null);
              run();
            }}
          >
            {pending.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  return { ask, dialog };
}
