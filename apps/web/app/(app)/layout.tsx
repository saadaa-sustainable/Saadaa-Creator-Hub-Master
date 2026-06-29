import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/nav/sidebar";
import { SidebarScrim } from "@/components/nav/sidebar-scrim";
import { MobileTopbar } from "@/components/nav/mobile-topbar";
import { KnowMoreModal } from "@/features/know-more/know-more-modal";
import { TestModeBanner } from "@/components/ui/test-mode-banner";
import { getTestModeScopes } from "@/features/settings/actions";
import { TEST_SCOPE_LABELS } from "@/features/settings/test-scopes";

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

  // Global Test Mode banner — shown above every view while any scope is active.
  const testScopes = await getTestModeScopes();
  const isAdmin = hasPermission(actor, "admin");

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to workspace
      </a>
      <Sidebar actor={actor} />
      <SidebarScrim />
      <div className="app-shell-main">
        <MobileTopbar />
        <main id="main-content" className="main-content" tabIndex={-1}>
          <TestModeBanner
            scopeLabels={testScopes.map((s) => TEST_SCOPE_LABELS[s])}
            isAdmin={isAdmin}
          />
          {children}
        </main>
      </div>
      <KnowMoreModal />
    </div>
  );
}
