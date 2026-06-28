import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { getAllPosts } from "@/lib/posts";
import { AppRuntime } from "@/lib/runtime";

const getHomePosts = createServerFn({ method: "GET" }).handler(() =>
  AppRuntime.runPromise(getAllPosts()),
);

export const Route = createFileRoute("/_site/")({
  loader: () => getHomePosts(),
  component: Home,
});

function Home() {
  const data = Route.useLoaderData();

  return (
    <>
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
    </>
  );
}
