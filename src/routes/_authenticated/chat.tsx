import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { KeyRound, Loader2, Lock, Paperclip, Reply, Search, SendHorizonal, SmilePlus, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FamilyGate, type FamilyCtx } from "@/components/family/FamilyGate";
import { MediaView } from "@/components/family/MediaView";
import { UserAvatar } from "@/components/family/UserAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { decryptMessage, encryptForFamily, useFamilyKeys, type Decrypted } from "@/lib/e2ee";
import { errText, formatDay, formatTime, REACTIONS, uploadWithProgress, useInvalidate, useMembers, validateMedia } from "@/lib/family";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({ meta: [{ title: "Семейный чат — Семейный круг" }, { name: "description", content: "Закрытый чат вашей семьи." }, { property: "og:title", content: "Семейный чат" }, { property: "og:description", content: "Закрытый чат вашей семьи." }] }),
  component: () => <FamilyGate title="__family" wide>{(ctx) => <Chat ctx={ctx} />}</FamilyGate>,
});

type Msg = { id: string; user_id: string; body: string | null; ciphertext: string | null; iv: string | null; key_version: number | null; reply_to_id: string | null; media_path: string | null; media_type: string | null; created_at: string };
type Pending = { file: File; preview: string; kind: "image" | "video"; ext: string; progress: number | null; abort?: (() => void) | undefined };

function Chat({ ctx }: { ctx: FamilyCtx }) {
  const { familyId, userId, role } = ctx;
  const invalidate = useInvalidate();
  const [limit, setLimit] = useState(60);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");
  const [highlight, setHighlight] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);
  const isAdmin = role !== "member";

  const members = useMembers(familyId);
  const people = useMemo(() => new Map((members.data ?? []).map((m) => [m.user_id, m.profiles])), [members.data]);

  const messages = useQuery({
    queryKey: ["messages", familyId, limit],
    queryFn: async () => {
      const { data, error } = await supabase.from("messages").select("id, user_id, body, ciphertext, iv, key_version, reply_to_id, media_path, media_type, created_at").eq("family_id", familyId).order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return (data as Msg[]).reverse();
    },
  });
  const ids = (messages.data ?? []).map((m) => m.id);
  const reactions = useQuery({
    queryKey: ["reactions", familyId, ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("message_reactions").select("message_id, user_id, emoji").in("message_id", ids);
      if (error) throw error;
      return data;
    },
  });
  const keys = useFamilyKeys(familyId, userId, members.data?.map((m) => m.user_id));
  const e2ee = keys.data;
  const plain = useQuery({
    queryKey: ["decrypted", familyId, ids.join(","), e2ee ? [...e2ee.keys.keys()].join(",") : ""],
    enabled: ids.length > 0,
    structuralSharing: false,
    queryFn: async () => {
      const out = new Map<string, Decrypted>();
      for (const m of messages.data ?? []) out.set(m.id, await decryptMessage(e2ee, familyId, m));
      return out;
    },
  });
  const textOf = (id: string) => plain.data?.get(id);
  // Text is encrypted on the server, so search runs here, over decrypted loaded messages only.
  const searchResults = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    return (messages.data ?? []).filter((m) => textOf(m.id)?.text?.toLowerCase().includes(t)).reverse().slice(0, 50);
  }, [q, messages.data, plain.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const canSendText = e2ee?.status === "ready";

  useEffect(() => {
    const ch = supabase
      .channel(`family-${familyId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `family_id=eq.${familyId}` }, () => invalidate("messages"))
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions", filter: `family_id=eq.${familyId}` }, () => invalidate("reactions"))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [familyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const lastId = messages.data?.at(-1)?.id;
  useEffect(() => { if (!highlight) bottomRef.current?.scrollIntoView({ block: "end" }); }, [lastId, highlight]);

  const byId = useMemo(() => new Map((messages.data ?? []).map((m) => [m.id, m])), [messages.data]);

  function pick(f?: File) {
    if (!f) return;
    const v = validateMedia(f);
    if (!v.ok) { toast.error(v.error); return; }
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const preview = URL.createObjectURL(f);
    previewUrlRef.current = preview;
    setPending({ file: f, preview, kind: v.kind, ext: v.ext, progress: null });
  }
  function clearPending() {
    pending?.abort?.();
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPending(null);
  }

  async function send(e?: FormEvent) {
    e?.preventDefault();
    if (sendingRef.current) return;
    const body = text.trim();
    if (!body && !pending) return;
    if (body && (!e2ee || !canSendText)) { toast.error("Ключ шифрования ещё не получен — текст пока отправить нельзя"); return; }
    sendingRef.current = true;
    setSending(true);
    let media: { media_path: string; media_type: string; media_mime: string; media_size: number } | null = null;
    try {
      if (pending) {
        const path = [familyId, userId, crypto.randomUUID() + "." + pending.ext].join("/");
        // Track the intended object before upload starts so an aborted/failed
        // transfer can also attempt to remove a partially persisted object.
        media = { media_path: path, media_type: pending.kind, media_mime: pending.file.type, media_size: pending.file.size };
        const up = uploadWithProgress("family-media", path, pending.file, (p) => setPending((s) => (s ? { ...s, progress: p } : s)));
        setPending((s) => (s ? { ...s, progress: 0, abort: up.abort } : s));
        await up.promise;
      }
      const cipher = body ? await encryptForFamily(e2ee!, familyId, userId, body) : null;
      const { error } = await supabase.from("messages").insert({ family_id: familyId, user_id: userId, body: null, ...cipher, reply_to_id: replyTo?.id ?? null, ...media });
      if (error) throw error;
      setText(""); setReplyTo(null);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
      setPending(null);
      invalidate("messages");
    } catch (err) {
      // If upload succeeded but encryption or message insertion failed, remove
      // the unattached object so failed sends do not leak private media in storage.
      if (media) {
        try {
          const { error: cleanupError } = await supabase.storage.from("family-media").remove([media.media_path]);
          if (cleanupError) console.error("[Chat] Failed to clean up an unlinked media upload", cleanupError);
        } catch (cleanupError) {
          console.error("[Chat] Failed to clean up an unlinked media upload", cleanupError);
        }
      }
      toast.error(errText(err));
      setPending((s) => (s ? { ...s, progress: null, abort: undefined } : s));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  async function toggleReaction(m: Msg, emoji: string) {
    const mine = reactions.data?.some((r) => r.message_id === m.id && r.user_id === userId && r.emoji === emoji);
    const { error } = mine
      ? await supabase.from("message_reactions").delete().match({ message_id: m.id, user_id: userId, emoji })
      : await supabase.from("message_reactions").insert({ message_id: m.id, user_id: userId, emoji, family_id: familyId });
    if (error) toast.error(errText(error));
    invalidate("reactions");
  }

  async function remove(m: Msg) {
    if (!confirm("Удалить сообщение для всех?")) return;
    const { error } = await supabase.from("messages").delete().eq("id", m.id);
    if (error) { toast.error(errText(error)); return; }
    if (m.media_path && m.user_id === userId) await supabase.storage.from("family-media").remove([m.media_path]);
    invalidate("messages");
  }

  function jumpTo(id: string) {
    setSearchOpen(false);
    if (byId.has(id)) {
      setHighlight(id);
      document.getElementById(`m-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => setHighlight(null), 2500);
    } else toast.info("Сообщение старое — нажмите «Показать раньше», чтобы его найти");
  }

  const list = messages.data ?? [];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b bg-card/60 px-3 py-2">
        <p className="flex-1 truncate text-sm text-muted-foreground">{canSendText ? "🔐 Текст сообщений зашифрован на устройствах" : "🔒 Доступ только участникам семьи"} · {members.data?.length ?? "…"} чел.</p>
        <Button variant="ghost" size="icon" aria-label="Поиск по сообщениям" aria-expanded={searchOpen} onClick={() => setSearchOpen((v) => !v)}><Search /></Button>
      </div>
      {keys.isError ? (
        <p className="border-b bg-destructive/10 px-3 py-2 text-sm" role="alert">Не удалось подготовить ключи шифрования: {errText(keys.error)}. Текстовые сообщения временно недоступны.</p>
      ) : e2ee?.status === "unsupported" ? (
        <p className="border-b bg-destructive/10 px-3 py-2 text-sm" role="alert">Этот браузер не поддерживает шифрование. Откройте чат в современном браузере (Chrome, Safari, Firefox).</p>
      ) : e2ee?.status === "waiting" ? (
        <p className="flex items-start gap-2 border-b bg-accent px-3 py-2 text-sm text-accent-foreground" role="status"><KeyRound className="mt-0.5 size-4 shrink-0" aria-hidden />Ждём ключ шифрования для этого устройства. Он придёт автоматически, когда кто-то из родных откроет чат. Пока можно отправлять только фото и видео.</p>
      ) : null}
      <details className="border-b bg-card/60 px-3 py-2 text-sm">
        <summary className="cursor-pointer font-semibold">🔐 Как защищена переписка</summary>
        <div className="mt-2 space-y-1 text-muted-foreground">
          <p>Текст сообщений шифруется на вашем устройстве до отправки. Сервер хранит только зашифрованные данные и ключ не получает.</p>
          <p><b>Важно:</b> ключ хранится только в этом браузере. Если очистить данные браузера или потерять все свои устройства, а у родных не будет открытого чата, старую переписку восстановить <b>невозможно</b>.</p>
          <p>Фото, видео, реакции, имена и время сообщений <b>не шифруются сквозным шифрованием</b> — они защищены доступом только для участников семьи.</p>
          {e2ee?.fingerprint && <p>Код этого устройства: <code className="font-bold">{e2ee.fingerprint}</code></p>}
        </div>
      </details>
      {searchOpen && (
        <div className="border-b bg-card p-3">
          <p className="mb-2 text-xs text-muted-foreground">Поиск идёт только по загруженным сообщениям на этом устройстве.</p>
          <Input autoFocus placeholder="Найти в переписке…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Текст для поиска" />
          <div className="mt-2 max-h-64 overflow-y-auto" aria-live="polite">
            {q.trim().length < 2 ? <p className="p-2 text-sm text-muted-foreground">Введите минимум 2 символа.</p>
              : searchResults.length === 0 ? <p className="p-2 text-sm text-muted-foreground">Ничего не найдено.</p>
              : searchResults.map((r) => (
                <button key={r.id} onClick={() => jumpTo(r.id)} className="block w-full rounded-lg p-2 text-left hover:bg-muted">
                  <span className="text-sm font-semibold">{people.get(r.user_id)?.display_name ?? "Участник"}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{formatDay(r.created_at)}, {formatTime(r.created_at)}</span>
                  <span className="block truncate">{textOf(r.id)?.text}</span>
                </button>
              ))}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-6" role="log" aria-label="Сообщения">
        {messages.isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="size-8 animate-spin text-primary" aria-label="Загрузка сообщений" /></div>
        ) : messages.isError ? (
          <div className="py-20 text-center"><p>Не удалось загрузить сообщения.</p><Button className="mt-3" onClick={() => messages.refetch()}>Повторить</Button></div>
        ) : list.length === 0 ? (
          <div className="mx-auto max-w-sm py-16 text-center"><div className="text-5xl" aria-hidden>👋</div><h2 className="mt-3 text-2xl font-semibold">Здесь пока тихо</h2><p className="mt-2 text-muted-foreground">Напишите первое сообщение или поделитесь фото — родные увидят его сразу.</p></div>
        ) : (
          <ul className="mx-auto flex max-w-3xl flex-col gap-1">
            {list.length >= limit && <li className="mb-3 text-center"><Button variant="outline" size="sm" onClick={() => setLimit((l) => l + 60)}>Показать раньше</Button></li>}
            {list.map((m, i) => {
              const prev = list[i - 1];
              const newDay = !prev || formatDay(prev.created_at) !== formatDay(m.created_at);
              const grouped = !newDay && prev?.user_id === m.user_id && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60000;
              const own = m.user_id === userId;
              const p = people.get(m.user_id);
              const quoted = m.reply_to_id ? byId.get(m.reply_to_id) : null;
              const rs = (reactions.data ?? []).filter((r) => r.message_id === m.id);
              const counts = REACTIONS.map((e) => ({ e, n: rs.filter((r) => r.emoji === e).length, mine: rs.some((r) => r.emoji === e && r.user_id === userId) })).filter((x) => x.n);
              return (
                <li key={m.id} id={`m-${m.id}`}>
                  {newDay && <div className="my-4 text-center"><span className="rounded-full bg-secondary px-3 py-1 text-sm font-semibold text-secondary-foreground">{formatDay(m.created_at)}</span></div>}
                  <div className={cn("group flex gap-2", own && "flex-row-reverse", grouped ? "mt-0.5" : "mt-3")}>
                    <div className="w-10 shrink-0">{!grouped && <UserAvatar name={p?.display_name} path={p?.avatar_path} />}</div>
                    <div className={cn("flex max-w-[80%] flex-col md:max-w-[70%]", own && "items-end")}>
                      {!grouped && <span className="mb-1 px-1 text-sm font-bold text-muted-foreground">{own ? "Вы" : p?.display_name ?? "Бывший участник"}</span>}
                      <div className={cn("rounded-2xl px-3 py-2 shadow-sm transition-shadow", own ? "rounded-tr-md bg-bubble-own text-bubble-own-foreground" : "rounded-tl-md border bg-bubble-other", highlight === m.id && "ring-4 ring-ring")}>
                        {m.reply_to_id && (
                          <div className={cn("mb-2 rounded-lg border-l-4 px-2 py-1 text-sm", own ? "border-primary-foreground/60 bg-primary-foreground/15" : "border-primary bg-muted")}>
                            <b>{quoted ? people.get(quoted.user_id)?.display_name ?? "Участник" : "Сообщение"}</b>
                            <span className="block truncate opacity-80">{quoted ? textOf(quoted.id)?.text ?? (quoted.media_type === "video" ? "🎬 Видео" : "📷 Фото") : "Удалено или загружено раньше"}</span>
                          </div>
                        )}
                        {m.media_path && <MediaView path={m.media_path} type={m.media_type} className="mb-1 min-w-48" />}
                        {(() => {
                          const d = textOf(m.id);
                          if (!d || d.state === "none") return m.ciphertext ? <p className="text-sm italic opacity-70">Расшифровка…</p> : null;
                          if (d.state === "nokey") return <p className="flex items-center gap-1 text-sm italic opacity-80"><Lock className="size-3.5" aria-hidden />Зашифровано — у этого устройства нет ключа</p>;
                          if (d.state === "fail") return <p className="text-sm italic opacity-80">Не удалось расшифровать сообщение</p>;
                          return <>{d.state === "plain" && <span className="block text-xs opacity-70">старое, без шифрования</span>}<p className="whitespace-pre-wrap break-words text-base leading-relaxed">{d.text}</p></>;
                        })()}
                        <time dateTime={m.created_at} className="mt-0.5 block text-right text-xs opacity-70">{formatTime(m.created_at)}</time>
                      </div>
                      {counts.length > 0 && (
                        <div className="-mt-1 flex flex-wrap gap-1 px-1">
                          {counts.map(({ e, n, mine }) => (
                            <button key={e} onClick={() => toggleReaction(m, e)} aria-pressed={mine} aria-label={`${e} ${n}`} className={cn("rounded-full border bg-card px-2 py-0.5 text-sm shadow-sm", mine && "border-primary bg-secondary")}>{e} {n}</button>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                        <Button variant="ghost" size="sm" aria-label="Ответить" onClick={() => setReplyTo(m)}><Reply /></Button>
                        <Popover>
                          <PopoverTrigger asChild><Button variant="ghost" size="sm" aria-label="Добавить реакцию"><SmilePlus /></Button></PopoverTrigger>
                          <PopoverContent className="flex w-auto gap-1 p-2">
                            {REACTIONS.map((e) => <button key={e} className="rounded-lg p-1.5 text-2xl hover:bg-muted" aria-label={`Реакция ${e}`} onClick={() => toggleReaction(m, e)}>{e}</button>)}
                          </PopoverContent>
                        </Popover>
                        {(own || isAdmin) && <Button variant="ghost" size="sm" aria-label="Удалить сообщение" onClick={() => remove(m)}><Trash2 /></Button>}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="border-t bg-card p-3 md:px-6">
        <div className="mx-auto max-w-3xl">
          {replyTo && (
            <div className="mb-2 flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm">
              <Reply className="size-4 text-primary" aria-hidden />
              <span className="flex-1 truncate">Ответ <b>{people.get(replyTo.user_id)?.display_name}</b>: {textOf(replyTo.id)?.text ?? "медиа"}</span>
              <Button type="button" variant="ghost" size="sm" aria-label="Отменить ответ" onClick={() => setReplyTo(null)}><X /></Button>
            </div>
          )}
          {pending && (
            <div className="mb-2 flex items-center gap-3 rounded-xl bg-muted p-2">
              {pending.kind === "image" ? <img src={pending.preview} alt="Предпросмотр" className="size-16 rounded-lg object-cover" /> : <video src={pending.preview} className="size-16 rounded-lg object-cover" muted />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{pending.file.name}</p>
                <p className="text-xs text-muted-foreground">{(pending.file.size / 1024 / 1024).toFixed(1)} МБ</p>
                {pending.progress !== null && <Progress value={pending.progress} className="mt-1" aria-label={`Загрузка ${pending.progress}%`} />}
              </div>
              <Button type="button" variant="ghost" size="sm" aria-label={pending.progress !== null ? "Отменить загрузку" : "Убрать файл"} onClick={clearPending} disabled={sending && !pending.abort}><X /></Button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,video/mp4,video/webm,video/quicktime" className="sr-only" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} tabIndex={-1} aria-hidden />
            <Button type="button" variant="outline" size="icon" aria-label="Прикрепить фото или видео" onClick={() => fileRef.current?.click()} disabled={sending}><Paperclip /></Button>
            <textarea
              value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} rows={1} placeholder={canSendText ? "Напишите сообщение…" : "Ждём ключ шифрования…"} disabled={!canSendText} aria-label="Текст сообщения"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              className="max-h-40 min-h-11 flex-1 resize-none rounded-xl border border-input bg-background px-4 py-2.5 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button type="submit" variant="hero" size="icon" aria-label="Отправить" disabled={sending || (!text.trim() && !pending)}>{sending ? <Loader2 className="animate-spin" /> : <SendHorizonal />}</Button>
          </div>
        </div>
      </form>
    </div>
  );
}
