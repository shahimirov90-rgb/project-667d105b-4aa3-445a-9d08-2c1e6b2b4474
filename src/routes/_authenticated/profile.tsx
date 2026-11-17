import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Camera, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Route as AuthRoute } from "@/routes/_authenticated/route";
import { AppShell } from "@/components/family/AppShell";
import { UserAvatar } from "@/components/family/UserAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errText, MAX_AVATAR_BYTES, useInvalidate, useMyMembership, useProfile } from "@/lib/family";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Профиль — Семейный круг" }, { name: "description", content: "Ваше имя и фото в семейном чате." }, { property: "og:title", content: "Профиль" }, { property: "og:description", content: "Ваше имя и фото в семейном чате." }] }),
  component: Profile,
});

function Profile() {
  const { user } = AuthRoute.useRouteContext();
  const profile = useProfile(user.id);
  const membership = useMyMembership(user.id);
  const invalidate = useInvalidate();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (profile.data) setName(profile.data.display_name); }, [profile.data]);

  async function save(e: FormEvent) {
    e.preventDefault();
    const displayName = name.trim().slice(0, 60);
    if (!displayName) { toast.error("Введите имя"); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from("profiles").update({ display_name: displayName }).eq("id", user.id);
      if (error) throw error;
      toast.success("Сохранено");
      invalidate("profile", "members");
    } catch (error) {
      toast.error(errText(error));
    } finally {
      setBusy(false);
    }
  }

  async function avatar(file?: File) {
    if (!file) return;
    const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file.type];
    if (!ext) { toast.error("Подойдёт фото JPG, PNG или WEBP"); return; }
    if (file.size === 0) { toast.error("Файл пустой"); return; }
    if (file.size > MAX_AVATAR_BYTES) { toast.error("Фото больше 5 МБ"); return; }

    setBusy(true);
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    let uploaded = false;
    try {
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (uploadError) throw uploadError;
      uploaded = true;

      // Keep the previous avatar until the profile points to the new file.
      const { error: profileError } = await supabase.from("profiles").update({ avatar_path: path }).eq("id", user.id);
      if (profileError) throw profileError;

      const oldPath = profile.data?.avatar_path;
      invalidate("profile", "members");
      toast.success("Фото обновлено");

      // Old-file cleanup is best-effort; a cleanup failure must not undo a successful profile update.
      if (oldPath && oldPath !== path) {
        try {
          const { error: cleanupError } = await supabase.storage.from("avatars").remove([oldPath]);
          if (cleanupError) console.warn("Не удалось удалить старое фото профиля", cleanupError);
        } catch (cleanupError) {
          // The profile already points to the new avatar; cleanup must never roll it back.
          console.warn("Не удалось удалить старое фото профиля", cleanupError);
        }
      }
    } catch (error) {
      // Avoid leaving an orphaned upload if saving the profile reference failed.
      if (uploaded) {
        const { error: cleanupError } = await supabase.storage.from("avatars").remove([path]);
        if (cleanupError) console.warn("Не удалось удалить неиспользуемое фото", cleanupError);
      }
      toast.error(errText(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="Профиль" role={membership.data?.role ?? undefined}>
      <div className="mx-auto max-w-md p-6">
        {profile.isLoading ? <Loader2 className="mx-auto size-8 animate-spin text-primary" aria-label="Загрузка" /> : (
          <form onSubmit={save} className="rounded-3xl border bg-card p-6 shadow-soft">
            <div className="flex flex-col items-center">
              <UserAvatar name={profile.data?.display_name} path={profile.data?.avatar_path} className="size-28 text-3xl" />
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { avatar(e.target.files?.[0]); e.target.value = ""; }} />
              <Button type="button" variant="outline" className="mt-3" onClick={() => fileRef.current?.click()} disabled={busy}><Camera /> Сменить фото</Button>
            </div>
            <Label htmlFor="dn" className="mt-6 block">Имя, которое видят родные</Label>
            <Input id="dn" className="mt-2" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            <p className="mt-2 text-sm text-muted-foreground">Почта: {user.email}</p>
            <Button type="submit" variant="hero" className="mt-5 w-full" disabled={busy}>{busy && <Loader2 className="animate-spin" />}Сохранить</Button>
            <p className="mt-4 text-center text-sm text-muted-foreground">🔒 Фото профиля видят только члены вашей семьи.</p>
          </form>
        )}
      </div>
    </AppShell>
  );
}
