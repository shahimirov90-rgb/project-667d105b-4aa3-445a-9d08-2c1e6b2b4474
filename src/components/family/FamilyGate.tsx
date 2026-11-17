import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Route as AuthRoute } from "@/routes/_authenticated/route";
import { useMyMembership, type Role } from "@/lib/family";
import { AppShell, CenterState } from "./AppShell";
import { Onboarding } from "./Onboarding";
import { Button } from "@/components/ui/button";

export type FamilyCtx = { userId: string; familyId: string; familyName: string; role: Role };

export function FamilyGate({ title, wide, children }: { title: string; wide?: boolean | undefined; children: (ctx: FamilyCtx) => ReactNode }) {
  const { user } = AuthRoute.useRouteContext();
  const m = useMyMembership(user.id);
  if (m.isLoading)
    return <AppShell title={title}><div className="flex justify-center py-20"><Loader2 className="size-8 animate-spin text-primary" aria-label="Загрузка" /></div></AppShell>;
  if (m.isError)
    return <AppShell title={title}><CenterState emoji="⚠️" title="Не удалось загрузить данные" text="Проверьте соединение с интернетом."><Button onClick={() => m.refetch()}>Повторить</Button></CenterState></AppShell>;
  if (!m.data) return <AppShell title="Семейный круг"><Onboarding userId={user.id} /></AppShell>;
  const ctx: FamilyCtx = { userId: user.id, familyId: m.data.family_id, familyName: m.data.families?.name ?? "Семья", role: m.data.role };
  return <AppShell title={title === "__family" ? ctx.familyName : title} wide={wide}>{children(ctx)}</AppShell>;
}
