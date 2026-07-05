"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Link } from "@tanstack/react-router";

import type { Post } from "@/lib/posts";

export const columns: ColumnDef<Post>[] = [
  {
    accessorKey: "title",
    header: "Title",
    cell(props) {
      return (
        <Link
          className="font-medium"
          to="/cms/posts/$id"
          params={{ id: props.row.original.id }}
        >
          {props.row.original.title}
        </Link>
      );
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell(props) {
      const post = props.row.original;
      return (
        <span>
          {post.status}
          {post.hasDraftChanges && post.hasPublishedVersion
            ? " + draft changes"
            : ""}
        </span>
      );
    },
  },
  {
    accessorKey: "slug",
    header: "Draft slug",
  },
];
