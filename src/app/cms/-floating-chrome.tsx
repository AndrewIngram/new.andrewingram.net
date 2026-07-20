import { Link } from "@tanstack/react-router";
import { ChevronDownIcon, ChevronLeftIcon } from "lucide-react";
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

type CmsCollection = "posts" | "images" | "writingFeedback";
type CmsCollectionPath = "/cms/posts" | "/cms/images" | "/cms/writing-feedback";

const collectionLabels: Record<CmsCollection, string> = {
  posts: "Posts",
  images: "Images",
  writingFeedback: "Writing feedback",
};

const collectionLinks: Record<CmsCollection, CmsCollectionPath> = {
  posts: "/cms/posts",
  images: "/cms/images",
  writingFeedback: "/cms/writing-feedback",
};

type CmsFloatingChromeNavigation =
  | {
      type: "collection";
      collection: CmsCollection;
    }
  | {
      type: "back";
      label: string;
      to: CmsCollectionPath;
    };

type CmsFloatingChromeProps = {
  navigation: CmsFloatingChromeNavigation;
  currentPage?: string;
  actions?: ReactNode;
};

export function CmsFloatingChrome({
  navigation,
  currentPage,
  actions,
}: CmsFloatingChromeProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-20 flex p-4">
      <div className="floating-menu pointer-events-auto flex w-full flex-wrap items-center gap-2 rounded-lg border bg-background p-2 shadow-sm">
        <div className="flex min-w-0 items-center gap-2">
          <ToolbarNavigation navigation={navigation} />
          {currentPage ? (
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage className="max-w-[min(22rem,45vw)] truncate">
                    {currentPage}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          ) : null}
        </div>
        {actions ? (
          <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ToolbarNavigation({
  navigation,
}: {
  navigation: CmsFloatingChromeNavigation;
}) {
  if (navigation.type === "back") {
    return (
      <Link
        to={navigation.to}
        className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-sm font-medium shadow-xs transition-colors hover:bg-muted"
      >
        <ChevronLeftIcon className="size-4" />
        {navigation.label}
      </Link>
    );
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink render={<Link to={collectionLinks[navigation.collection]} />}>
            {collectionLabels[navigation.collection]}
          </BreadcrumbLink>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label="Switch content collection"
                  className="hover:text-foreground inline-flex items-center transition-colors"
                >
                  <ChevronDownIcon className="size-3.5" />
                </button>
              }
            />
            <DropdownMenuContent align="start">
              <DropdownMenuItem render={<Link to="/cms/posts" />}>
                Posts
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link to="/cms/images" />}>
                Images
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link to="/cms/writing-feedback" />}>
                Writing feedback
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
