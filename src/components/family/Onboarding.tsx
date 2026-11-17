import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errText, useInvalidate } from "@/lib/family";
import { CenterState } from "./AppShell";

export function Onboarding({ userId }: { userId: string }) {
  const invalidate = useInvalidate();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const pending = useQuery({
    queryKey: ["myRequest", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("join_requests").select("id, status, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 15000,
  });

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.rpc("create_family", { _name: name });
    setBusy(false);
    if (error) { toast.error(errText(error)); return; }
    toast.success("Семья создана! Пригласите родных.");
    invalidate("membership");
  }

  function useCode(e: FormEvent) {
    e.preventDefault();
    const c = code.trim().split("/").pop()?.toUpperCase();
    if (c) navigate({ to: "/invite/$code", params: { code: c } });
  }

  async function cancel(id: string) {
    await supabase.rpc("cancel_join_request", { _request: id });
    invalidate("myRequest");
  }

  if (pending.isLoading) return <div className="flex justify-center py-20"><Loader2 className="size-8 animate-spin text-primary" aria-label="Загрузка" /></div>;

  if (pending.data?.status === "pending") {
    return (
      <CenterState emoji="⏳" title="Заявка ждёт одобрения" text="Владелец семьи получит вашу заявку. Как только её одобрят, здесь откроется семейный чат.">
        <Button variant="outline" onClick={() => cancel(pending.data!.id)}>Отменить заявку</Button>
      </CenterState>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:py-12">
      <h2 className="text-center text-3xl font-semibold">Добро пожаловать в Семейный круг!</h2>
      <p className="mt-2 text-center text-muted-foreground">Создайте пространство для своей семьи или вступите по приглашению.</p>
      {pending.data?.status === "rejected" && (
        <p role="alert" className="mx-auto mt-4 max-w-md rounded-xl bg-muted p-3 text-center text-sm">Предыдущая заявка была отклонена. Уточните у родственника и попробуйте снова.</p>
      )}
      <div className="mt-8 grid gap-5 md:grid-cols-2">
        <form onSubmit={create} className="rounded-3xl border bg-card p-6 shadow-soft">
          <div className="text-4xl" aria-hidden>🏡</div>
          <h3 className="mt-3 text-xl font-semibold">Создать семью</h3>
          <p className="mt-1 text-sm text-muted-foreground">Вы станете владельцем и будете одобрять новых участников.</p>
          <Label htmlFor="fname" className="mt-4 block">Название</Label>
          <Input id="fname" className="mt-2" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Семья Ивановых" />
          <Button type="submit" variant="hero" className="mt-4 w-full" disabled={busy}>{busy && <Loader2 className="animate-spin" />}Создать</Button>
        </form>
        <form onSubmit={useCode} className="rounded-3xl border bg-card p-6 shadow-soft">
          <div className="text-4xl" aria-hidden>💌</div>
          <h3 className="mt-3 text-xl font-semibold">У меня есть приглашение</h3>
          <p className="mt-1 text-sm text-muted-foreground">Вставьте ссылку или код, который прислал родственник.</p>
          <Label htmlFor="code" className="mt-4 block">Код или ссылка</Label>
          <Input id="code" className="mt-2" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="Например, 4F7A2B9C1D" />
          <Button type="submit" variant="outline" className="mt-4 w-full">Продолжить</Button>
        </form>
      </div>
    </div>
  );
}
