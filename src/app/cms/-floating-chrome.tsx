import { Link } from "@tanstack/react-router";
import { ChevronDownIcon } from "lucide-react";
import type { ReactNode } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type CmsCollection = "posts" | "images";

const collectionLabels: Record<CmsCollection, string> = {
  posts: "Posts",
  images: "Images",
};

type CmsFloatingChromeProps = {
  collection: CmsCollection;
  currentPage?: string;
  actions?: ReactNode;
};

export function CmsFloatingChrome({
  collection,
  currentPage,
  actions,
}: CmsFloatingChromeProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-20 flex flex-wrap items-start justify-between gap-3 p-4">
      <div className="pointer-events-auto rounded-lg border bg-background px-3 py-2 shadow-sm">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link
                  to={collection === "posts" ? "/cms/posts" : "/cms/images"}
                >
                  {collectionLabels[collection]}
                </Link>
              </BreadcrumbLink>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Switch content collection"
                    className="hover:text-foreground inline-flex items-center transition-colors"
                  >
                    <ChevronDownIcon className="size-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem render={<Link to="/cms/posts" />}>
                    Posts
                  </DropdownMenuItem>
                  <DropdownMenuItem render={<Link to="/cms/images" />}>
                    Images
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </BreadcrumbItem>
            {currentPage ? (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage className="max-w-[min(20rem,50vw)] truncate">
                    {currentPage}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </>
            ) : null}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      {actions ? (
        <div className="pointer-events-auto ml-auto flex max-w-full flex-wrap items-center justify-end gap-2 rounded-lg border bg-background p-2 shadow-sm">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
