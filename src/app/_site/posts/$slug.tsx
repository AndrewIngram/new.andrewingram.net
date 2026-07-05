import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { PostContent } from "@/components/post-content";
import { PostOutline } from "@/components/post-outline";
import { preparePostContentForRender } from "@/lib/code-highlighting";
import { extractPostOutline } from "@/lib/post-outline";
import { getPublishedPostBySlug } from "@/lib/posts";
import { AppRuntime } from "@/lib/runtime";

const getPost = createServerFn({ method: "GET" })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const result = await AppRuntime.runPromise(getPublishedPostBySlug(slug)).catch(
      () => null,
    );
    if (!result) throw notFound();
    if (result.redirectTo) {
      throw redirect({
        to: "/posts/$slug",
        params: { slug: result.redirectTo },
        statusCode: 301,
      });
    }
    const content = await preparePostContentForRender(result.post.content);
    return {
      ...result.post,
      content,
      outline: extractPostOutline(content),
    };
  });

export const Route = createFileRoute("/_site/posts/$slug")({
  loader: ({ params }) => getPost({ data: params.slug }),
  component: PostDetail,
});

function PostDetail() {
  const post = Route.useLoaderData();

  return (
    <article className="post-detail">
      <header>
        <h1>{post.title}</h1>
        <p>
          Published{" "}
          {new Date(post.publishedAt).toLocaleDateString("en-GB", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
          {post.lastPublishedAt !== post.publishedAt ? (
            <>
              {" "}
              · Updated{" "}
              {new Date(post.lastPublishedAt).toLocaleDateString("en-GB", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </>
          ) : null}
        </p>
      </header>
      <div className="post-detail-body">
        <PostOutline items={post.outline} showOutline={post.showOutline} />
        <div className="post-content">
          <PostContent content={post.content} skipTitle />
        </div>
      </div>
    </article>
  );
}
