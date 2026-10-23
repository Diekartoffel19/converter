import { create } from "zustand";
import { uid } from "../lib/format";

export type ToastKind = "success" | "error" | "info";
export interface Toast {
  id: string;
  message: string;
  kind: ToastKind;
  action?: { label: string; run: () => void };
}

export const useToasts = create<{ toasts: Toast[]; dismiss: (id: string) => void }>()((set) => ({
  toasts: [],
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function toast(message: string, kind: ToastKind = "info", action?: Toast["action"]) {
  const id = uid();
  useToasts.setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, message, kind, action }] }));
  setTimeout(() => useToasts.getState().dismiss(id), kind === "error" || action ? 6000 : 3500);
}
