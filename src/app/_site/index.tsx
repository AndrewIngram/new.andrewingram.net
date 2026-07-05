import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { getPublishedPosts } from "@/lib/posts";
import { AppRuntime } from "@/lib/runtime";

const getHomePosts = createServerFn({ method: "GET" }).handler(() =>
  AppRuntime.runPromise(getPublishedPosts()),
);

export const Route = createFileRoute("/_site/")({
  loader: () => getHomePosts({}),
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
                {new Date(post.publishedAt).toLocaleDateString("en-GB", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}{" "}
                - {post.title}
              </Link>
            </h1>
          </header>
        </article>
      ))}
    </>
  );
}
