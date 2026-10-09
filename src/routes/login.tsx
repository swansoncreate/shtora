import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ password }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string; ok?: boolean };
      if (!response.ok || !result.ok) {
        setError(result.error || "Не удалось войти.");
        return;
      }
      await navigate({ to: "/", replace: true });
    } catch {
      setError("Сервер недоступен. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#0e0d0c] px-5 py-10 text-[#f4efe6]">
      <section className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#1b1917] p-7 shadow-2xl">
        <div className="mb-7 text-center">
          <div className="mb-3 text-xs uppercase tracking-[0.35em] text-white/45">SHTORA</div>
          <h1 className="text-3xl font-semibold">С возвращением</h1>
          <p className="mt-2 text-sm text-white/60">Войдите, чтобы открыть ленту и переписки.</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm text-white/75" htmlFor="password">Пароль приложения</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoFocus
            className="w-full rounded-xl border border-white/15 bg-black/25 px-4 py-3 text-base outline-none transition focus:border-white/40"
          />
          {error ? <p role="alert" className="rounded-xl bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</p> : null}
          <button
            type="submit"
            disabled={busy || !password}
            className="w-full rounded-xl bg-[#f4efe6] px-4 py-3 font-semibold text-[#171513] transition hover:bg-white disabled:cursor-wait disabled:opacity-50"
          >
            {busy ? "Проверяем…" : "Войти"}
          </button>
        </form>
        <p className="mt-5 text-center text-xs leading-relaxed text-white/35">Доступ защищён. Секреты и пароль не передаются в клиентский код.</p>
      </section>
    </main>
  );
}
