import { createFileRoute, Outlet } from "@tanstack/react-router";

import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

import cmsCss from "./globals.css?url";

export const Route = createFileRoute("/cms")({
  head: () => ({
    links: [{ rel: "stylesheet", href: cmsCss }],
  }),
  component: CmsLayout,
});

function CmsLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
