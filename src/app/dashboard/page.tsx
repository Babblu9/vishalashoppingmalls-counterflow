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

  // ADMIN users must have a branchId — if missing, the account is misconfigured
  if (!session.branchId) {
    redirect("/login");
  }

  return <AdminDashboard session={{ ...session, branchId: session.branchId, branchName: session.branchName ?? "" }} />;
}
