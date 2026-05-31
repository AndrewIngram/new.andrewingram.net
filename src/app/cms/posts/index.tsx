import { Button } from "@/components/ui/button";
import { getAllPosts } from "@/lib/posts";
import { AppRuntime } from "@/lib/runtime";
import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { CmsFloatingChrome } from "../-floating-chrome";
import { columns } from "./-columns";
import { DataTable } from "./-data-table";

const getPosts = createServerFn({ method: "GET" }).handler(() =>
  AppRuntime.runPromise(getAllPosts()),
);

export const Route = createFileRoute("/cms/posts/")({
  loader: () => getPosts(),
  component: PostsIndex,
});

function PostsIndex() {
  const data = Route.useLoaderData();

  return (
    <>
      <CmsFloatingChrome
        collection="posts"
        actions={
          <Button asChild>
            <Link to="/cms/posts/$id" params={{ id: "new" }}>
              New post
            </Link>
          </Button>
        }
      />
      <div className="flex min-h-svh flex-col gap-4 px-4 pb-4 pt-24 sm:px-6">
        <h1 className="scroll-m-20 text-left text-4xl font-extrabold tracking-tight text-balance">
          Posts
        </h1>
        <DataTable columns={columns} data={data} />
      </div>
    </>
  );
}
