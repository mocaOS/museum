import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/session";
import AdminShell from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAuth();
  if (!ctx) redirect("/login?next=/admin");
  if (ctx.user.role !== "superadmin" && ctx.user.role !== "admin") {
    redirect("/");
  }

  return (
    <AdminShell
      user={{
        id: ctx.user.id,
        email: ctx.user.email,
        username: ctx.user.username,
      }}
    >
      {children}
    </AdminShell>
  );
}
