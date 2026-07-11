import Link from "next/link";
import { login } from "../actions";
import { Button } from "@/components/ui/button";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { error, notice } = await searchParams;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">Sign in</h2>
      {notice ? (
        <p className="rounded-md bg-accent px-3 py-2 text-sm">{notice}</p>
      ) : null}
      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <form action={login} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="rounded-md border bg-background px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="rounded-md border bg-background px-3 py-2"
          />
        </label>
        <Button type="submit">Sign in</Button>
      </form>
      <p className="text-sm text-muted-foreground">
        New here?{" "}
        <Link href="/signup" className="text-foreground underline">
          Create your business
        </Link>
      </p>
    </div>
  );
}
