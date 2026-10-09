import { useEffect, useState, type ReactNode } from "react";
import { useRouterState, Navigate, useNavigate } from "@tanstack/react-router";

export function VpsSessionGate({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [status, setStatus] = useState<"checking" | "allowed" | "login" | "misconfigured">("checking");
  const [vpsProtected, setVpsProtected] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    if (pathname === "/login") {
      setStatus("allowed");
      return () => { active = false; };
    }
    setStatus("checking");
    fetch("/api/session", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("session");
        return response.json() as Promise<{ enabled?: boolean; configured?: boolean; authenticated?: boolean }>;
      })
      .then((result) => {
        if (!active) return;
        setVpsProtected(Boolean(result.enabled));
        if (!result.enabled || result.authenticated) setStatus("allowed");
        else if (!result.configured) setStatus("misconfigured");
        else setStatus("login");
      })
      .catch(() => { if (active) setStatus("misconfigured"); });
    return () => { active = false; };
  }, [pathname]);

  if (status === "allowed") return (
    <>
      {children}
      {vpsProtected && pathname !== "/login" ? (
        <button
          type="button"
          onClick={async () => {
            try { await fetch("/api/session", { method: "DELETE", credentials: "same-origin" }); } finally {
              await navigate({ to: "/login", replace: true });
            }
          }}
          className="fixed right-3 top-3 z-[100] rounded-full border border-white/15 bg-[#171513]/90 px-3 py-2 text-xs text-white/75 shadow-lg backdrop-blur"
        >
          Выйти
        </button>
      ) : null}
    </>
  );
  if (status === "login" && pathname !== "/login") return <Navigate to="/login" />;
  if (status === "checking") {
    return <main className="grid min-h-[100dvh] place-items-center bg-[#0e0d0c] text-sm text-white/60">Проверяем доступ…</main>;
  }
  if (status === "misconfigured") {
    return <main className="grid min-h-[100dvh] place-items-center bg-[#0e0d0c] px-6 text-center text-sm text-white/70"><div className="max-w-md"><p className="mb-2 text-lg text-white">Shtora пока не настроена для входа</p><p>На VPS нужно задать SHTORA_LOGIN_PASSWORD и SHTORA_SESSION_SECRET (не публикуя их в репозитории), затем перезапустить приложение.</p></div></main>;
  }
  return <Navigate to="/login" />;
}
