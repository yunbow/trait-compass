import type { Metadata } from "next";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "クローズドベータ版 | Trait Compass",
  robots: { index: false, follow: false },
};

interface BetaGatePageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function BetaGatePage({ searchParams }: BetaGatePageProps) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6 py-12" id="main-content">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-xl font-bold text-foreground">クローズドベータ版</h1>
        <p className="text-sm text-muted-foreground">パスワードを入力してください。</p>
      </div>
      <form action="/api/beta-gate" className="flex flex-col gap-3" method="POST">
        <label className="text-sm font-medium text-foreground" htmlFor="beta-password">
          パスワード
        </label>
        <input
          autoComplete="off"
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-base text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          id="beta-password"
          name="password"
          required
          type="password"
        />
        {error === "1" && (
          <p className="text-sm text-destructive" role="alert">
            パスワードが違います。もう一度お試しください。
          </p>
        )}
        <Button className="w-full" size="lg" type="submit">
          進む
        </Button>
      </form>
    </main>
  );
}
