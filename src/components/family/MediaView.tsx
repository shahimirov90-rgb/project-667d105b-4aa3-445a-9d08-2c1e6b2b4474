import { Loader2 } from "lucide-react";
import { useSignedUrl } from "@/lib/family";
import { cn } from "@/lib/utils";

export function MediaView({ path, type, className, controls = true, onOpen }: { path: string; type: string | null; className?: string; controls?: boolean; onOpen?: () => void }) {
  const { data: url, isLoading, isError } = useSignedUrl("family-media", path);
  if (isLoading) return <div className={cn("flex aspect-video items-center justify-center rounded-xl bg-muted", className)}><Loader2 className="animate-spin text-muted-foreground" aria-label="Загрузка медиа" /></div>;
  if (isError || !url) return <div className={cn("flex aspect-video items-center justify-center rounded-xl bg-muted p-3 text-sm text-muted-foreground", className)}>Файл недоступен</div>;
  if (type === "video") return <video src={url} controls={controls} preload="metadata" playsInline className={cn("max-h-80 w-full rounded-xl bg-foreground/5", className)} />;
  const img = <img src={url} alt="Фото из семейного чата" loading="lazy" className={cn("max-h-80 w-full rounded-xl object-cover", className)} />;
  return onOpen ? <button type="button" onClick={onOpen} className="block w-full" aria-label="Открыть фото">{img}</button> : img;
}
