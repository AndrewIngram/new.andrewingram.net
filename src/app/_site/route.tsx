import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

import siteCss from "../site.css?url";

export const Route = createFileRoute("/_site")({
  head: () => ({
    links: [{ rel: "stylesheet", href: siteCss }],
  }),
  component: SiteLayout,
});

function SiteLayout() {
  return (
    <section className="site">
      <header className="site-header">
        <nav>
          <Link className="site-title" to="/">
            Andrew&nbsp;Ingram
          </Link>

          <div className="nav-links">
            <Link to="/">Posts</Link>
            <a href="javascript:;">Resume</a>
            <a href="javascript:;">About</a>
          </div>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </section>
  );
}
