import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FamilyGate, type FamilyCtx } from "@/components/family/FamilyGate";
import { CenterState } from "@/components/family/AppShell";
import { MediaView } from "@/components/family/MediaView";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { formatDay, useMembers, useSignedUrls } from "@/lib/family";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/gallery")({
  head: () => ({ meta: [{ title: "Галерея — Семейный круг" }, { name: "description", content: "Все фото и видео вашей семьи." }, { property: "og:title", content: "Семейная галерея" }, { property: "og:description", content: "Все фото и видео вашей семьи." }] }),
  component: () => <FamilyGate title="Галерея">{(ctx) => <Gallery ctx={ctx} />}</FamilyGate>,
});

type Item = { id: string; user_id: string; media_path: string; media_type: string | null; created_at: string; body: string | null };

function Thumb({ item, url, loading, error }: { item: Item; url?: string; loading: boolean; error: boolean }) {
  if (loading) return <div className="flex size-full items-center justify-center bg-muted"><Loader2 className="animate-spin text-muted-foreground" aria-hidden /></div>;
  if (error || !url) return <div className="flex size-full items-center justify-center bg-muted p-2 text-center text-xs text-muted-foreground">Файл недоступен</div>;
  return item.media_type === "video" ? (
    <><video src={url + "#t=0.1"} preload="metadata" muted playsInline className="size-full object-cover" /><Play className="absolute inset-0 m-auto size-10 rounded-full bg-foreground/50 p-2 text-background" aria-hidden /></>
  ) : <img src={url} alt="" loading="lazy" className="size-full object-cover" />;
}

function Gallery({ ctx }: { ctx: FamilyCtx }) {
  const [filter, setFilter] = useState<"all" | "image" | "video">("all");
  const [open, setOpen] = useState<Item | null>(null);
  const members = useMembers(ctx.familyId);
  const q = useQuery({
    queryKey: ["gallery", ctx.familyId, filter],
    queryFn: async () => {
      let r = supabase.from("messages").select("id, user_id, media_path, media_type, created_at, body").eq("family_id", ctx.familyId).not("media_path", "is", null).order("created_at", { ascending: false }).limit(300);
      if (filter !== "all") r = r.eq("media_type", filter);
      const { data, error } = await r;
      if (error) throw error;
      return data as Item[];
    },
  });
  const signed = useSignedUrls("family-media", q.data?.map((item) => item.media_path));
  const name = (id: string) => members.data?.find((m) => m.user_id === id)?.profiles?.display_name ?? "Участник";
  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <div className="mb-4 flex gap-2" role="group" aria-label="Фильтр">
        {([["all", "Все"], ["image", "Фото"], ["video", "Видео"]] as const).map(([k, l]) => (
          <Button key={k} variant={filter === k ? "default" : "outline"} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</Button>
        ))}
      </div>
      {q.isLoading ? <div className="flex justify-center py-20"><Loader2 className="size-8 animate-spin text-primary" aria-label="Загрузка" /></div>
        : q.isError ? <CenterState emoji="⚠️" title="Не удалось загрузить галерею"><Button onClick={() => q.refetch()}>Повторить</Button></CenterState>
        : !q.data?.length ? <CenterState emoji="📷" title="Пока нет фото и видео" text="Отправьте снимок в семейный чат — он появится здесь."><Button asChild variant="hero"><Link to="/chat">Перейти в чат</Link></Button></CenterState>
        : (
          <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5">
            {q.data.map((it) => (
              <li key={it.id}>
                <button onClick={() => setOpen(it)} className={cn("relative block aspect-square w-full overflow-hidden rounded-xl bg-muted focus-visible:ring-4 focus-visible:ring-ring")} aria-label={`${it.media_type === "video" ? "Видео" : "Фото"} от ${name(it.user_id)}, ${formatDay(it.created_at)}`}>
                  <Thumb item={it} url={signed.data?.get(it.media_path)} loading={signed.isLoading} error={signed.isError} />
                </button>
              </li>
            ))}
          </ul>
        )}
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-3xl">
          {open && (<>
            <DialogTitle>{name(open.user_id)} · {formatDay(open.created_at)}</DialogTitle>
            <MediaView path={open.media_path} type={open.media_type} className="max-h-[70vh] object-contain" />
            {open.body && <p className="text-muted-foreground">{open.body}</p>}
          </>)}
        </DialogContent>
      </Dialog>
    </div>
  );
}
