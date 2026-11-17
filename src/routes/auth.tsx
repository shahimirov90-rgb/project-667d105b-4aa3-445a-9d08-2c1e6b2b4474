import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { inviteRedirectPath } from "@/lib/invite-routing";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Вход — Семейный круг" },
      { name: "description", content: "Войдите или зарегистрируйтесь в Семейном круге." },
      { property: "og:title", content: "Вход — Семейный круг" },
      { property: "og:description", content: "Войдите или зарегистрируйтесь в Семейном круге." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function nextPath() {
  let storedCode: string | null = null;
  let search = "";
  if (typeof window !== "undefined") {
    search = window.location.search;
    try { storedCode = sessionStorage.getItem("pendingInvite"); } catch { /* Session storage may be disabled. */ }
  }
  return inviteRedirectPath(search, storedCode);
}

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const go = () => navigate({ href: nextPath(), replace: true });
    let active = true;
    void supabase.auth.getUser().then(({ data, error }) => {
      if (active && !error && data.user) go();
    }).catch((error: unknown) => {
      if (active) console.warn("[Auth] Could not check the current session", error);
    });
    const { data } = supabase.auth.onAuthStateChange((e, s) => e === "SIGNED_IN" && s && go());
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [navigate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (mode === "up" && !name.trim()) { toast.error("Введите имя"); return; }
    setBusy(true);
    try {
      if (mode === "up") {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin + nextPath(), data: { display_name: name.trim().slice(0, 60) } },
        });
        if (error) throw error;
        if (!data.session) setSent(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message.includes("Invalid") ? "Неверная почта или пароль" : error.message.includes("confirmed") ? "Подтвердите почту по ссылке из письма" : error.message);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось войти");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    try {
      const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" + window.location.search });
      if (r.error) toast.error("Не удалось войти через Google");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось войти через Google");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background bg-soft px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border bg-card p-6 shadow-soft md:p-8">
        <Link to="/" className="font-display text-xl font-semibold text-primary">🏡 Семейный круг</Link>
        {sent ? (
          <div className="mt-6" role="status">
            <h1 className="text-2xl font-semibold">Проверьте почту</h1>
            <p className="mt-2 text-muted-foreground">Мы отправили письмо на <b>{email}</b>. Перейдите по ссылке, чтобы подтвердить адрес и войти.</p>
            <Button variant="outline" className="mt-6 w-full" onClick={() => { setSent(false); setMode("in"); }}>Вернуться ко входу</Button>
          </div>
        ) : (
          <>
            <h1 className="mt-6 text-3xl font-semibold">{mode === "in" ? "С возвращением!" : "Создать аккаунт"}</h1>
            <p className="mt-1 text-muted-foreground">{mode === "in" ? "Войдите, чтобы увидеть семейный чат." : "Это займёт минуту."}</p>
            <form onSubmit={submit} className="mt-6 space-y-4">
              {mode === "up" && (
                <div className="space-y-2"><Label htmlFor="name">Как вас зовут в семье</Label>
                  <Input id="name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Бабушка Галя" /></div>
              )}
              <div className="space-y-2"><Label htmlFor="email">Электронная почта</Label>
                <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="pw">Пароль</Label>
                <Input id="pw" type="password" minLength={8} autoComplete={mode === "in" ? "current-password" : "new-password"} required value={password} onChange={(e) => setPassword(e.target.value)} />
                {mode === "up" && <p className="text-sm text-muted-foreground">Не меньше 8 символов.</p>}</div>
              <Button type="submit" variant="hero" size="lg" className="w-full" disabled={busy}>
                {busy && <Loader2 className="animate-spin" />}{mode === "in" ? "Войти" : "Зарегистрироваться"}
              </Button>
            </form>
            <div className="my-5 flex items-center gap-3 text-sm text-muted-foreground"><span className="h-px flex-1 bg-border" />или<span className="h-px flex-1 bg-border" /></div>
            <Button type="button" variant="outline" size="lg" className="w-full" onClick={google} disabled={busy}>
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[18px]"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>
              Продолжить с Google
            </Button>
            <p className="mt-6 text-center">
              {mode === "in" ? "Впервые здесь? " : "Уже есть аккаунт? "}
              <button type="button" className="font-semibold text-primary underline-offset-4 hover:underline" onClick={() => setMode(mode === "in" ? "up" : "in")}>
                {mode === "in" ? "Зарегистрироваться" : "Войти"}
              </button>
            </p>
            <p className="mt-4 text-center text-sm text-muted-foreground">🔒 Ваши данные видят только участники вашей семьи.</p>
          </>
        )}
      </div>
    </div>
  );
}
