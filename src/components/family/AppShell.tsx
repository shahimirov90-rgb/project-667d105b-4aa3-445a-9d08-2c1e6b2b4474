import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Images, LogOut, MessageCircleHeart, Settings, UserRound, Users } from "lucide-react";
import type { Role } from "@/lib/family";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const NAV = [
  { to: "/chat", label: "Чат", icon: MessageCircleHeart },
  { to: "/gallery", label: "Галерея", icon: Images },
  { to: "/family", label: "Семья", icon: Users },
  { to: "/profile", label: "Профиль", icon: UserRound },
] as const;

export function AppShell({ title, children, wide, role }: { title: string; children: ReactNode; wide?: boolean | undefined; role?: Role }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  async function signOut() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      await qc.cancelQueries();
      qc.clear();
      navigate({ to: "/auth", replace: true });
    } catch (error) {
      console.error("[AppShell] Sign-out failed", error);
      toast.error("Не удалось выйти. Проверьте подключение и попробуйте ещё раз.");
    }
  }
  return (
    <div className="flex h-dvh flex-col bg-background md:flex-row">
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-sidebar p-4 md:flex">
        <Link to="/" className="mb-8 flex items-center gap-2 px-2 font-display text-2xl font-semibold text-primary">
          <span aria-hidden>🏡</span> Семейный круг
        </Link>
        <nav className="flex flex-col gap-1" aria-label="Основное меню">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} className="flex items-center gap-3 rounded-xl px-4 py-3 text-lg font-semibold text-sidebar-foreground hover:bg-sidebar-accent" activeProps={{ className: "bg-sidebar-accent text-primary" }}>
              <Icon className="size-5" aria-hidden /> {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto">
          <p className="mb-3 px-2 text-xs text-muted-foreground">🔐 Текст сообщений зашифрован. Фото и видео видят только участники семьи.</p>
          <Button variant="ghost" className="w-full justify-start" onClick={signOut}><LogOut /> Выйти</Button>
        </div>
      </aside>
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b bg-card/80 px-4 py-3 backdrop-blur md:px-6">
          <h1 className="truncate text-xl font-semibold md:text-2xl">{title}</h1>
          <div className="flex items-center gap-1">
            {(role === "owner" || role === "admin") && (
              <Button asChild variant="ghost" size="icon" aria-label="Настройки администратора" title="Настройки администратора">
                <Link to="/family" hash="admin-settings"><Settings /></Link>
              </Button>
            )}
            <Button variant="ghost" size="icon" className="md:hidden" onClick={signOut} aria-label="Выйти"><LogOut /></Button>
          </div>
        </header>
        <main className={wide ? "flex min-h-0 flex-1 flex-col" : "min-h-0 flex-1 overflow-y-auto"}>{children}</main>
        <nav className="grid grid-cols-4 border-t bg-card md:hidden" aria-label="Основное меню">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} className="flex flex-col items-center gap-1 py-2.5 text-xs font-semibold text-muted-foreground" activeProps={{ className: "text-primary" }}>
              <Icon className="size-6" aria-hidden /> {label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

export function CenterState({ emoji, title, text, children }: { emoji: string; title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-16 text-center">
      <div className="mb-4 text-5xl" aria-hidden>{emoji}</div>
      <h2 className="text-2xl font-semibold">{title}</h2>
      {text && <p className="mt-2 text-muted-foreground">{text}</p>}
      {children && <div className="mt-6 flex w-full flex-col gap-3">{children}</div>}
    </div>
  );
}
