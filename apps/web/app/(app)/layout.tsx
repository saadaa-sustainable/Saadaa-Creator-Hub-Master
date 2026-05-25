import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/nav/sidebar";
import { SidebarScrim } from "@/components/nav/sidebar-scrim";
import { MobileTopbar } from "@/components/nav/mobile-topbar";

export default async function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await getActor();
  if (!actor) {
    // Distinguish "never signed in" from "signed in but access revoked" so
    // the login page only shows the red revoked banner when it's actually
    // true. Otherwise a fresh visitor sees a misleading error message.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    redirect(user ? "/login?reason=revoked" : "/login");
  }

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
