import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { errText, useUser } from "@/lib/family";

export const Route = createFileRoute("/invite/$code")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Приглашение в семью — Семейный круг" },
      { name: "description", content: "Вас пригласили в закрытый семейный чат." },
      { property: "og:title", content: "Приглашение в Семейный круг" },
      { property: "og:description", content: "Вас пригласили в закрытый семейный чат. Вступление — после одобрения владельца." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InvitePage,
});

function InvitePage() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const user = useUser();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        sessionStorage.setItem("pendingInvite", code);
        navigate({ to: "/auth", replace: true });
      } else setChecked(true);
    });
  }, [code, navigate]);

  const preview = useQuery({
    queryKey: ["invite", code],
    enabled: checked && !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("preview_invite", { _code: code });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  async function join() {
    setBusy(true);
    const { error } = await supabase.rpc("request_join", { _code: code });
    setBusy(false);
    sessionStorage.removeItem("pendingInvite");
    if (error) { toast.error(errText(error)); return; }
    toast.success("Заявка отправлена владельцу семьи");
    navigate({ to: "/chat" });
  }

  const p = preview.data;
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background bg-soft px-4">
      <div className="w-full max-w-md rounded-3xl border bg-card p-8 text-center shadow-soft">
        {!checked || preview.isLoading ? (
          <Loader2 className="mx-auto size-8 animate-spin text-primary" aria-label="Загрузка" />
        ) : preview.isError ? (
          <p className="text-destructive">Не удалось проверить приглашение. {errText(preview.error)}</p>
        ) : !p || !p.valid ? (
          <>
            <div className="text-5xl" aria-hidden>🔗</div>
            <h1 className="mt-4 text-2xl font-semibold">Приглашение недействительно</h1>
            <p className="mt-2 text-muted-foreground">Ссылка устарела или была отозвана. Попросите родственника прислать новую.</p>
            <Button asChild variant="outline" className="mt-6 w-full"><Link to="/chat">Перейти в приложение</Link></Button>
          </>
        ) : (
          <>
            <div className="text-5xl" aria-hidden>💌</div>
            <h1 className="mt-4 text-2xl font-semibold">Вас приглашают в семью «{p.family_name}»</h1>
            <p className="mt-2 text-muted-foreground">Участников: {p.member_count}. После вашей заявки владелец или администратор семьи должен её одобрить.</p>
            <Button variant="hero" size="lg" className="mt-6 w-full" onClick={join} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} Отправить заявку
            </Button>
            <Button asChild variant="ghost" className="mt-2 w-full"><Link to="/chat">Не сейчас</Link></Button>
          </>
        )}
      </div>
    </div>
  );
}
