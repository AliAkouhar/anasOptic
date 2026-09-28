"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { toast } from "sonner";
import { isRepoError } from "@/data/repositories";
import { useFormat } from "@/data/hooks";

interface SuccessOptions {
  description?: string;
  /** Non-destructive actions offer "Annuler" (undo). */
  undo?: () => boolean;
  action?: { label: string; onClick: () => void };
  duration?: number;
}

/** Toasts for every action: success (+ undo), and translated repository errors. */
export function useFeedback() {
  const t = useTranslations();
  const f = useFormat();
  return useMemo(() => {
    const errorMessage = (e: unknown): string => {
      if (isRepoError(e)) {
        const d = e.details ?? {};
        return t(`errors.${e.code}`, {
          reste: f.money(Number(d.reste ?? 0)),
          available: String(d.available ?? 0),
          name: String(d.name ?? ""),
        });
      }
      console.error(e);
      return t("errors.generic");
    };
    return {
      errorMessage,
      success(message: string, opts: SuccessOptions = {}) {
        const { undo } = opts;
        toast.success(message, {
          description: opts.description,
          duration: opts.duration ?? (undo ? 6000 : 4000),
          action: undo
            ? {
                label: t("common.undo"),
                onClick: () => {
                  if (undo()) toast(t("common.undone"));
                  else toast.error(t("errors.undo_failed"));
                },
              }
            : opts.action,
        });
      },
      error(e: unknown) {
        toast.error(errorMessage(e));
      },
    };
  }, [t, f]);
}
