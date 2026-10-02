import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PullRefresh({
  onRefresh,
  busy,
  children,
}: {
  onRefresh: () => Promise<void> | void;
  busy?: boolean;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const pullRef = useRef(0);
  const armed = useRef(false);
  const running = useRef(false);
  const refresh = useRef(onRefresh);
  refresh.current = onRefresh;
  const [pull, setPull] = useState(0);

  useEffect(() => {
    const el = root.current;
    if (!el) return;

    const atTop = () => {
      const node = document.scrollingElement || document.documentElement;
      return Math.max(window.scrollY || 0, node.scrollTop || 0) <= 10;
    };

    const onStart = (e: TouchEvent) => {
      if (!atTop()) {
        armed.current = false;
        return;
      }
      armed.current = true;
      startY.current = e.touches[0]?.clientY ?? 0;
      pullRef.current = 0;
    };

    const onMove = (e: TouchEvent) => {
      if (!armed.current) return;
      const y = e.touches[0]?.clientY ?? 0;
      const dy = y - startY.current;
      if (dy > 6 && atTop()) {
        if (e.cancelable) e.preventDefault();
        const next = Math.min(92, dy * 0.62);
        pullRef.current = next;
        setPull(next);
      } else if (dy < -8) {
        armed.current = false;
        pullRef.current = 0;
        setPull(0);
      }
    };

    const onEnd = () => {
      const go = armed.current && pullRef.current > 32 && !running.current;
      armed.current = false;
      pullRef.current = 0;
      setPull(0);
      if (!go) return;
      running.current = true;
      Promise.resolve(refresh.current()).finally(() => {
        running.current = false;
      });
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  return (
    <div ref={root} className="touch-pan-y overscroll-y-contain">
      <div
        className={cn(
          "flex items-center justify-center overflow-hidden text-subtle transition-[height] duration-200",
          busy || pull > 8 ? "h-10" : "h-0",
        )}
        aria-hidden
      >
        <LoaderCircle className={cn("size-4", (busy || pull > 32) && "animate-spin")} />
      </div>
      {children}
    </div>
  );
}
