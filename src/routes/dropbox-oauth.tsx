import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { exchangeDropboxOauth } from "@/lib/dropbox/functions";
import { dropboxRedirectUri } from "@/lib/dropbox/token";
import { patchShtoraSettings } from "@/lib/shtora-settings";

export const Route = createFileRoute("/dropbox-oauth")({
  component: DropboxOauthPage,
});

function DropboxOauthPage() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Подключаем Dropbox…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const err = params.get("error_description") || params.get("error");
    if (err) {
      setMessage(err);
      return;
    }
    if (!code) {
      setMessage("Нет кода от Dropbox.");
      return;
    }
    const appKey = sessionStorage.getItem("shtora-dbx-key") ?? "";
    const appSecret = sessionStorage.getItem("shtora-dbx-secret") ?? "";
    if (!appKey || !appSecret) {
      setMessage("Нет App key/secret. Вернись в настройки и подключи снова.");
      return;
    }
    void exchangeDropboxOauth({
      data: {
        code,
        redirectUri: dropboxRedirectUri(),
        appKey,
        appSecret,
      },
    })
      .then((tokens) => {
        patchShtoraSettings({
          dropboxToken: tokens.accessToken,
          dropboxRefreshToken: tokens.refreshToken,
          dropboxAppKey: appKey,
          dropboxAppSecret: appSecret,
          dropboxTokenExpiresAt: tokens.expiresAt,
        });
        sessionStorage.removeItem("shtora-dbx-key");
        sessionStorage.removeItem("shtora-dbx-secret");
        setMessage("Dropbox подключён навсегда. Возвращаемся…");
        window.setTimeout(() => void navigate({ to: "/" }), 600);
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : "Не удалось подключить Dropbox");
      });
  }, [navigate]);

  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <p className="max-w-sm text-center text-sm text-muted">{message}</p>
    </main>
  );
}
