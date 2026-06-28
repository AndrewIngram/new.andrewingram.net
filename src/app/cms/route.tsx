import { createFileRoute, Outlet } from "@tanstack/react-router";

import globalCss from "../globals.css?url";
import cmsCss from "./cms.css?url";

export const Route = createFileRoute("/cms")({
  head: () => ({
    links: [
      { rel: "stylesheet", href: globalCss },
      { rel: "stylesheet", href: cmsCss },
    ],
  }),
  component: CmsLayout,
});

function CmsLayout() {
  return <Outlet />;
}
