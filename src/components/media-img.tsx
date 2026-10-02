import { useEffect, useMemo, useState, type ImgHTMLAttributes } from "react";
import { peekCachedMedia, rememberMedia } from "@/lib/instagram/media-cache";
import { cn, mediaSrc } from "@/lib/utils";

export function MediaImg({
  src,
  alt,
  className,
  ...rest
}: Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & { src?: string | null }) {
  const proxy = useMemo(() => {
    if (!src) return undefined;
    if (src.startsWith("blob:") || src.startsWith("data:")) return src;
    if (src.startsWith("/")) return mediaSrc(src);
    return mediaSrc(src, { proxy: true });
  }, [src]);

  const [url, setUrl] = useState<string | undefined>(() => (proxy ? peekCachedMedia(proxy) || proxy : undefined));

  useEffect(() => {
    if (!proxy) {
      setUrl(undefined);
      return;
    }
    const peeked = peekCachedMedia(proxy);
    setUrl(peeked || proxy);
    let cancelled = false;
    void rememberMedia(proxy).then((next) => {
      if (cancelled || !next || next === proxy) return;
      setUrl(next);
    });
    return () => {
      cancelled = true;
    };
  }, [proxy]);

  if (!proxy) return <div className={cn("bg-elevated", className)} aria-hidden />;
  return (
    <img
      src={url || proxy}
      alt={alt ?? ""}
      className={cn("bg-elevated object-cover", className)}
      referrerPolicy="no-referrer"
      onError={(e) => {
        const img = e.currentTarget;
        if (proxy && img.src !== proxy && !img.src.startsWith("blob:")) {
          img.src = proxy;
          return;
        }
        img.style.opacity = "0.35";
      }}
      {...rest}
    />
  );
}
