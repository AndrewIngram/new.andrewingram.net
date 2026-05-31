import { createFileRoute, Outlet } from "@tanstack/react-router";

import cmsCss from "./globals.css?url";

export const Route = createFileRoute("/cms")({
  head: () => ({
    links: [{ rel: "stylesheet", href: cmsCss }],
  }),
  component: CmsLayout,
});

function CmsLayout() {
  return <Outlet />;
}
