import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { PostContent } from "@/components/post-content";
import { preparePostContentForRender } from "@/lib/code-highlighting";
import { getPostBySlug } from "@/lib/posts";
import { AppRuntime } from "@/lib/runtime";

import siteCss from "../site.css?url";

const getPost = createServerFn({ method: "GET" })
  .inputValidator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const post = await AppRuntime.runPromise(getPostBySlug(slug)).catch(
      () => null,
    );
    if (!post) throw notFound();
    return {
      ...post,
      content: await preparePostContentForRender(post.content),
    };
  });

export const Route = createFileRoute("/posts/$slug")({
  head: () => ({
    links: [{ rel: "stylesheet", href: siteCss }],
  }),
  loader: ({ params }) => getPost({ data: params.slug }),
  component: PostDetail,
});

function PostDetail() {
  const post = Route.useLoaderData();

  return (
    <section className="site">
      <header className="site-header">
        <nav>
          <a className="site-title" href="/">
            Andrew Ingram
          </a>

          <div className="nav-links">
            <a href="/">Posts</a>
            <a href="javascript:;">Resume</a>
            <a href="javascript:;">About</a>
          </div>
        </nav>
      </header>
      <main>
        <article className="post-detail">
          <header>
            <h1>{post.title}</h1>
          </header>
          <div className="post-content">
            <PostContent content={post.content} skipTitle />
          </div>
        </article>
      </main>
    </section>
  );
}
