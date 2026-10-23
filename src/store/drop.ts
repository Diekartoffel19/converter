import { useEffect } from "react";
import { create } from "zustand";

type Handler = (paths: string[]) => void;

/** Files dragged in from Explorer go to whichever page registered the latest handler. */
export const useDrop = create<{ handler: Handler | null; hovering: boolean }>()(() => ({ handler: null, hovering: false }));

export function useFileDrop(handler: Handler) {
  useEffect(() => {
    useDrop.setState({ handler });
    return () => {
      if (useDrop.getState().handler === handler) useDrop.setState({ handler: null });
    };
  }, [handler]);
}
