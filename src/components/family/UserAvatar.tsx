import { useSignedUrl } from "@/lib/family";
import { cn } from "@/lib/utils";

export function UserAvatar({ name, path, className }: { name?: string | null | undefined; path?: string | null | undefined; className?: string | undefined }) {
  const { data: url } = useSignedUrl("avatars", path);
  const initials = (name ?? "?").split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span className={cn("inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-sm font-bold text-secondary-foreground", className)}>
      {url ? <img src={url} alt={name ?? ""} className="size-full object-cover" /> : <span aria-hidden>{initials}</span>}
      {!url && <span className="sr-only">{name}</span>}
    </span>
  );
}
