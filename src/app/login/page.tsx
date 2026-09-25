import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await isAuthenticated()) redirect("/");
  const { next } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Private tool</div>
          <h1 className="mt-1 text-2xl font-semibold">Lead Cockpit</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to continue.</p>
        </div>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
