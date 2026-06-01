import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import AdminDashboard from "./admin";
import SuperAdminDashboard from "./superadmin";

export default async function DashboardPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (session.role === "SUPER_ADMIN") {
    return <SuperAdminDashboard session={session} />;
  }

  // Admin users are guaranteed to have a branchId from our seed configuration
  return <AdminDashboard session={session as any} />;
}
