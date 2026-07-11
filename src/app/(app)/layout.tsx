import { redirect } from "next/navigation";
import { MainNav } from "@/components/main-nav";
import { createClient } from "@/lib/supabase/server";
import { signout } from "../(auth)/actions";
import { Button } from "@/components/ui/button";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware already gates these routes; this is defense in depth.
  if (!user) {
    redirect("/login");
  }

  return (
    <>
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4">
          <span className="font-semibold tracking-tight">Margin</span>
          <MainNav />
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {user.email}
            </span>
            <form action={signout}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {children}
      </main>
    </>
  );
}
