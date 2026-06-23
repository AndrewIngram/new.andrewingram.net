import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { getAllPosts } from "@/lib/posts";
import { AppRuntime } from "@/lib/runtime";

import siteCss from "./site.css?url";

const getHomePosts = createServerFn({ method: "GET" }).handler(() =>
  AppRuntime.runPromise(getAllPosts()),
);

export const Route = createFileRoute("/")({
  head: () => ({
    links: [{ rel: "stylesheet", href: siteCss }],
  }),
  loader: () => getHomePosts(),
  component: Home,
});

function Home() {
  const data = Route.useLoaderData();

  return (
    <section className="site">
      <header className="site-header">
        <nav>
          <a className="site-title" href="javascript:;">
            Andrew&nbsp;Ingram
          </a>

          <div className="nav-links">
            <a href="javascript:;">Posts</a>
            <a href="javascript:;">Resume</a>
            <a href="javascript:;">About</a>
          </div>
        </nav>
      </header>
      <main>
        {data.map((post) => (
          <article className="post" key={post.id}>
            <header>
              <h1>
                <Link to="/posts/$slug" params={{ slug: post.slug }}>
                  Feb - {post.title}
                </Link>
              </h1>
            </header>
          </article>
        ))}
      </main>
    </section>
  );
}
