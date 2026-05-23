import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { Sidebar } from "@/components/nav/sidebar";
import { SidebarScrim } from "@/components/nav/sidebar-scrim";
import { MobileTopbar } from "@/components/nav/mobile-topbar";

export default async function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await getActor();
  if (!actor) redirect("/login?reason=revoked");

  return (
    <div>
      <Sidebar actor={actor} />
      <SidebarScrim />
      <div>
        <MobileTopbar />
        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}
