import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const params = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-(--bg) p-6">
      <LoginForm passwordUpdated={params.notice === "password-updated"} />
    </div>
  );
}
