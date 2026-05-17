import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { getAllPosts } from "@/lib/posts";
import { AppRuntime } from "@/lib/runtime";
import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { columns } from "./-columns";
import { DataTable } from "./-data-table";

const getPosts = createServerFn({ method: "GET" }).handler(() =>
  AppRuntime.runPromise(getAllPosts())
);

export const Route = createFileRoute("/cms/posts/")({
  loader: () => getPosts(),
  component: PostsIndex,
});

function PostsIndex() {
  const data = Route.useLoaderData();

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 justify-between">
        <div className="flex flex-1 items-center gap-2">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-[orientation=vertical]:h-4"
          />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink href="/cms">Content</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbPage>Posts</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild>
            <Link to="/cms/posts/$id" params={{ id: "new" }}>
              New post
            </Link>
          </Button>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4">
        <h1 className="scroll-m-20 text-left text-4xl font-extrabold tracking-tight text-balance">
          Posts
        </h1>
        <DataTable columns={columns} data={data} />
      </div>
    </>
  );
}
