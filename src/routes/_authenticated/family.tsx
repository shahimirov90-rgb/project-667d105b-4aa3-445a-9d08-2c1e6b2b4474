import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Link2, Loader2, UserMinus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FamilyGate, type FamilyCtx } from "@/components/family/FamilyGate";
import { UserAvatar } from "@/components/family/UserAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { errText, ROLE_LABEL, useInvalidate, useMembers, type Role } from "@/lib/family";

export const Route = createFileRoute("/_authenticated/family")({
  head: () => ({ meta: [{ title: "Семья и приглашения — Семейный круг" }, { name: "description", content: "Участники, роли, заявки и приглашения." }, { property: "og:title", content: "Моя семья" }, { property: "og:description", content: "Участники, роли, заявки и приглашения." }] }),
  component: () => <FamilyGate title="Семья">{(ctx) => <FamilyPage ctx={ctx} />}</FamilyGate>,
});

function Section({ title, children, hint, id }: { title: string; hint?: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="rounded-3xl border bg-card p-5 shadow-soft md:p-6">
      <h2 className="text-xl font-semibold">{title}</h2>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function FamilyPage({ ctx }: { ctx: FamilyCtx }) {
  const { familyId, userId, role } = ctx;
  const isAdmin = role !== "member";
  const invalidate = useInvalidate();
  const members = useMembers(familyId);
  const [famName, setFamName] = useState(ctx.familyName);
  const [inviteBusy, setInviteBusy] = useState(false);
  useEffect(() => setFamName(ctx.familyName), [ctx.familyName]);

  const requests = useQuery({
    queryKey: ["requests", familyId],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("join_requests").select("id, created_at, user_id, profiles(display_name, avatar_path)").eq("family_id", familyId).eq("status", "pending").order("created_at");
      if (error) throw error;
      return data;
    },
  });
  const invites = useQuery({
    queryKey: ["invites", familyId],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("family_invites").select("*").eq("family_id", familyId).is("revoked_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!isAdmin) return;
    const ch = supabase.channel(`req-${familyId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "join_requests", filter: `family_id=eq.${familyId}` }, () => invalidate("requests"))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [familyId, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  async function rpc(fn: () => PromiseLike<{ error: unknown }>, ok: string, ...keys: string[]) {
    try {
      const { error } = await fn();
      if (error) throw error;
      toast.success(ok);
      invalidate(...keys);
    } catch (error) {
      toast.error(errText(error));
    }
  }
  const link = (code: string) => `${window.location.origin}/invite/${code}`;
  async function copy(code: string) {
    try { await navigator.clipboard.writeText(link(code)); toast.success("Ссылка скопирована"); } catch { toast.info(link(code)); }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-4 md:p-6">
      <p className="rounded-2xl bg-accent p-4 text-accent-foreground">🔒 <b>Приватность:</b> сообщения, фото и видео доступны только участникам этой семьи. Текст сообщений дополнительно зашифрован на устройствах; при удалении или выходе участника ключ автоматически меняется. Новые родственники попадают сюда только после одобрения владельца или администратора.</p>

      {isAdmin && (
        <Section title="Заявки на вступление" hint="Одобряйте только тех, кого знаете лично.">
          {requests.isLoading ? <Loader2 className="animate-spin" aria-label="Загрузка" /> : requests.isError ? <div role="alert" className="text-sm text-destructive">{errText(requests.error)} <Button variant="outline" size="sm" onClick={() => requests.refetch()}>Повторить</Button></div> : !requests.data?.length ? <p className="text-muted-foreground">Новых заявок нет.</p> : (
            <ul className="space-y-3">
              {requests.data.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3">
                  <UserAvatar name={r.profiles?.display_name} path={r.profiles?.avatar_path} />
                  <div className="min-w-0 flex-1"><p className="font-semibold">{r.profiles?.display_name ?? "Новый пользователь"}</p><p className="text-sm text-muted-foreground">{new Date(r.created_at).toLocaleString("ru-RU")}</p></div>
                  <Button onClick={() => rpc(() => supabase.rpc("review_request", { _request: r.id, _approve: true }), "Участник добавлен", "requests", "members")}><Check /> Принять</Button>
                  <Button variant="outline" onClick={() => rpc(() => supabase.rpc("review_request", { _request: r.id, _approve: false }), "Заявка отклонена", "requests")}><X /> Отклонить</Button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {isAdmin && (
        <Section title="Приглашения" hint="Ссылка действует 14 дней. Даже по ссылке человек попадёт в семью только после вашего одобрения.">
          <Button variant="hero" disabled={inviteBusy} onClick={async () => {
            if (inviteBusy) return;
            setInviteBusy(true);
            try {
              const { data, error } = await supabase.rpc("create_invite", { _family: familyId });
              if (error) throw error;
              invalidate("invites");
              if (data) await copy(data);
            } catch (error) {
              toast.error(errText(error));
            } finally {
              setInviteBusy(false);
            }
          }}>{inviteBusy ? <Loader2 className="animate-spin" /> : <Link2 />} {inviteBusy ? "Создаём…" : "Создать ссылку-приглашение"}</Button>
          <ul className="mt-4 space-y-2">
            {invites.isError && <li role="alert" className="text-sm text-destructive">{errText(invites.error)} <Button variant="outline" size="sm" onClick={() => invites.refetch()}>Повторить</Button></li>}{!invites.isError && invites.data?.length === 0 && <li className="text-muted-foreground">Активных приглашений нет.</li>}
            {invites.data?.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-muted p-3">
                <code className="flex-1 text-lg font-bold tracking-wider">{i.code}</code>
                <span className="text-sm text-muted-foreground">до {new Date(i.expires_at).toLocaleDateString("ru-RU")}</span>
                <Button variant="outline" size="sm" onClick={() => copy(i.code)}><Copy /> Копировать</Button>
                <Button variant="ghost" size="sm" onClick={() => rpc(() => supabase.rpc("revoke_invite", { _invite: i.id }), "Приглашение отозвано", "invites")}>Отозвать</Button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={`Участники (${members.data?.length ?? "…"})`}>
        {members.isLoading ? <Loader2 className="animate-spin" aria-label="Загрузка" /> : members.isError ? <div role="alert" className="text-sm text-destructive">{errText(members.error)} <Button variant="outline" size="sm" onClick={() => members.refetch()}>Повторить</Button></div> : (
          <ul className="space-y-3">
            {members.data?.map((m) => {
              const canRemove = m.user_id !== userId && m.role !== "owner" && (role === "owner" || (role === "admin" && m.role === "member"));
              return (
                <li key={m.user_id} className="flex flex-wrap items-center gap-3">
                  <UserAvatar name={m.profiles?.display_name} path={m.profiles?.avatar_path} />
                  <p className="min-w-0 flex-1 font-semibold">{m.profiles?.display_name}{m.user_id === userId && " (вы)"}</p>
                  {role === "owner" && m.role !== "owner" ? (
                    <Select value={m.role} onValueChange={(v) => rpc(() => supabase.rpc("set_member_role", { _family: familyId, _user: m.user_id, _role: v as Role }), "Роль изменена", "members")}>
                      <SelectTrigger className="h-11 w-44" aria-label={`Роль: ${m.profiles?.display_name}`}><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="admin">Администратор</SelectItem><SelectItem value="member">Участник</SelectItem></SelectContent>
                    </Select>
                  ) : <Badge variant={m.role === "member" ? "secondary" : "default"}>{ROLE_LABEL[m.role]}</Badge>}
                  {canRemove && <Button variant="ghost" size="icon" aria-label={`Удалить ${m.profiles?.display_name}`} onClick={() => confirm(`Удалить ${m.profiles?.display_name} из семьи?`) && rpc(() => supabase.rpc("remove_member", { _family: familyId, _user: m.user_id }), "Участник удалён", "members")}><UserMinus /></Button>}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {isAdmin && (
        <Section id="admin-settings" title="Настройки семьи">
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const name = famName.trim(); if (!name) { toast.error("Введите название семьи"); return; } rpc(() => supabase.from("families").update({ name }).eq("id", familyId), "Название сохранено", "membership"); }}>
            <Input value={famName} onChange={(e) => setFamName(e.target.value)} maxLength={80} required aria-label="Название семьи" />
            <Button type="submit">Сохранить</Button>
          </form>
        </Section>
      )}

      {role !== "owner" && (
        <Button variant="outline" className="self-start text-destructive" onClick={() => confirm("Покинуть семью? Вы потеряете доступ к переписке.") && rpc(() => supabase.rpc("remove_member", { _family: familyId, _user: userId }), "Вы покинули семью", "membership")}>Покинуть семью</Button>
      )}
    </div>
  );
}
