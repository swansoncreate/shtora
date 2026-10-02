import "@/lib/process-shim";
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { AppQueryProvider } from "@/components/query-provider";
import { Toaster } from "sonner";
import appCss from "../styles.css?url";

const APP_NAME = "Штора";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: APP_NAME },
      { name: "description", content: "Смотрите Instagram по нику: посты, сторис и хайлайты." },
      { name: "theme-color", content: "#0e0d0c" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=Manrope:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  component: () => (
    <html lang="ru" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="bg-bg text-fg">
        <PreviewHostBridge />
        <AuthProvider>
          <AppQueryProvider>
            <Outlet />
            <Toaster
              theme="dark"
              position="bottom-center"
              toastOptions={{
                style: {
                  background: "#1f1d1b",
                  color: "#f4efe6",
                  border: "1px solid rgba(244,239,230,0.12)",
                },
              }}
            />
          </AppQueryProvider>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
