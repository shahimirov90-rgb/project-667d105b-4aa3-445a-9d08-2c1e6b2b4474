import { createFileRoute, Link } from "@tanstack/react-router";
import { Images, Lock, MessageCircleHeart, UserPlus } from "lucide-react";
import hero from "@/assets/family-hero.jpg";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Семейный круг — закрытый чат для вашей семьи" },
      { name: "description", content: "Личное пространство для родных: сообщения, фото и видео, которые видят только участники семьи." },
      { property: "og:title", content: "Семейный круг — закрытый чат для вашей семьи" },
      { property: "og:description", content: "Сообщения, фото и видео только для своих. Вступление — по приглашению и с одобрением владельца." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const FEATURES = [
  { icon: MessageCircleHeart, title: "Общий семейный чат", text: "Ответы, реакции и поиск по истории." },
  { icon: Images, title: "Фото и видео", text: "Галерея всех семейных моментов в одном месте." },
  { icon: UserPlus, title: "Только по приглашению", text: "Владелец одобряет каждого нового родственника." },
  { icon: Lock, title: "Приватно", text: "Текст сообщений зашифрован на устройствах, файлы доступны только семье." },
];

function Index() {
  return (
    <div className="min-h-dvh bg-background bg-soft">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <span className="font-display text-2xl font-semibold text-primary">🏡 Семейный круг</span>
        <Button asChild variant="outline"><Link to="/auth">Войти</Link></Button>
      </header>
      <main className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-6 md:grid-cols-2 md:pt-12">
        <section>
          <h1 className="text-4xl font-semibold leading-tight md:text-6xl">Все родные — в одном тёплом кругу</h1>
          <p className="mt-5 text-lg text-muted-foreground md:text-xl">
            Закрытое пространство для вашей семьи: делитесь новостями, фотографиями внуков и видео с праздников. Без рекламы и посторонних.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild variant="hero" size="lg"><Link to="/auth">Создать семейный круг</Link></Button>
            <Button asChild variant="outline" size="lg"><Link to="/auth">У меня есть приглашение</Link></Button>
          </div>
        </section>
        <img src={hero} width={1280} height={960} alt="Семья вместе рассматривает фотографии на телефоне" className="w-full rounded-3xl shadow-soft" />
        <ul className="grid gap-4 sm:grid-cols-2 md:col-span-2 md:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="rounded-2xl border bg-card p-5 shadow-soft">
              <Icon className="mb-3 size-7 text-primary" aria-hidden />
              <h2 className="text-lg font-semibold">{title}</h2>
              <p className="mt-1 text-muted-foreground">{text}</p>
            </li>
          ))}
        </ul>
      </main>
      <footer className="border-t px-5 py-6 text-center text-sm text-muted-foreground">Создатель Шах Имиров</footer>
    </div>
  );
}
