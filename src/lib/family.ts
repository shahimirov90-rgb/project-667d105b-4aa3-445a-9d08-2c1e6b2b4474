import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Role = "owner" | "admin" | "member";

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Владелец",
  admin: "Администратор",
  member: "Участник",
};

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];
export const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
export const REACTIONS = ["❤️", "👍", "😂", "😮", "😢", "🙏"] as const;

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "image/heic": "heic", "image/heif": "heif", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
};

/** Returns an error message (Russian) or the media kind for a chat attachment. */
export function validateMedia(file: { type: string; size: number }):
  | { ok: true; kind: "image" | "video"; ext: string }
  | { ok: false; error: string } {
  if (!Number.isFinite(file.size) || file.size <= 0) return { ok: false, error: "Файл пустой или имеет неверный размер" };
  if (IMAGE_TYPES.includes(file.type)) {
    if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "Фото больше 15 МБ" };
    return { ok: true, kind: "image", ext: EXT[file.type] ?? "bin" };
  }
  if (VIDEO_TYPES.includes(file.type)) {
    if (file.size > MAX_VIDEO_BYTES) return { ok: false, error: "Видео больше 50 МБ" };
    return { ok: true, kind: "video", ext: EXT[file.type] ?? "bin" };
  }
  return { ok: false, error: "Можно отправлять только фото (JPG, PNG, WEBP, GIF, HEIC) и видео (MP4, WEBM, MOV)" };
}

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    let active = true;
    let authChanged = false;
    // Subscribe before restoring the session so a slow getUser() response cannot
    // overwrite a newer SIGNED_IN / SIGNED_OUT event.
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      authChanged = true;
      setUser(s?.user ?? null);
    });
    void supabase.auth.getUser().then(({ data: result, error }) => {
      if (!active || authChanged) return;
      if (error) {
        console.warn("[Auth] Could not restore the current user", error);
        setUser(null);
        return;
      }
      setUser(result.user);
    }).catch((error: unknown) => {
      if (!active || authChanged) return;
      console.warn("[Auth] Could not restore the current user", error);
      setUser(null);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return user;
}

export function useMyMembership(userId?: string) {
  return useQuery({
    queryKey: ["membership", userId],
    enabled: !!userId,
    // Keep the family gate in sync when a member is removed or leaves elsewhere.
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("family_members")
        .select("family_id, role, families(id, name, owner_id)")
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useMembers(familyId?: string) {
  return useQuery({
    queryKey: ["members", familyId],
    enabled: !!familyId,
    // Membership changes affect E2EE key rotation and must propagate to open chats.
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("family_members")
        .select("user_id, role, joined_at, profiles(id, display_name, avatar_path)")
        .eq("family_id", familyId!)
        .order("joined_at");
      if (error) throw error;
      return data;
    },
  });
}

export function useProfile(userId?: string) {
  return useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId!).single();
      if (error) throw error;
      return data;
    },
  });
}

/** Private files are only shown through short-lived signed URLs. */
export function useSignedUrl(bucket: "family-media" | "avatars", path?: string | null) {
  return useQuery({
    queryKey: ["signed", bucket, path],
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

export function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

export function uploadWithProgress(
  bucket: string,
  path: string,
  file: File,
  onProgress: (pct: number) => void,
): { promise: Promise<void>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  let aborted = false;
  const promise = (async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = data.session?.access_token;
    if (!token) throw new Error("Сессия истекла, войдите снова");
    if (aborted) throw new Error("Загрузка отменена");
    const url = String(import.meta.env['VITE_SUPABASE_URL']) + "/storage/v1/object/" + bucket + "/" + path;
    await new Promise<void>((resolve, reject) => {
      xhr.open("POST", url);
      xhr.setRequestHeader("Authorization", "Bearer " + token);
      xhr.setRequestHeader("apikey", import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY']);
      xhr.setRequestHeader("Content-Type", file.type);
      xhr.setRequestHeader("x-upsert", "false");
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Не удалось загрузить файл")));
      xhr.onerror = () => reject(new Error("Ошибка сети при загрузке"));
      xhr.onabort = () => reject(new Error("Загрузка отменена"));
      if (aborted) {
        reject(new Error("Загрузка отменена"));
        return;
      }
      xhr.send(file);
    });
  })();
  return {
    promise,
    abort: () => {
      aborted = true;
      xhr.abort();
    },
  };
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}
export function formatDay(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Сегодня";
  if (d.toDateString() === y.toDateString()) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}
export function errText(e: unknown) {
  return e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : "Что-то пошло не так";
}
