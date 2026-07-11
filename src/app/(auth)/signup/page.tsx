import Link from "next/link";
import { signup } from "../actions";
import { Button } from "@/components/ui/button";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">Create your business</h2>
      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <form action={signup} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Business name
          <input
            name="businessName"
            type="text"
            required
            placeholder="Corner Store"
            className="rounded-md border bg-background px-3 py-2"
          />
        </label>
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
            minLength={8}
            autoComplete="new-password"
            className="rounded-md border bg-background px-3 py-2"
          />
        </label>
        <Button type="submit">Sign up</Button>
      </form>
      <p className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="text-foreground underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
