"use client";

import { ColumnDef } from "@tanstack/react-table";

import type { Post } from "@/data/posts";
import Link from "next/link";

export const columns: ColumnDef<Post>[] = [
  {
    accessorKey: "title",
    header: "Title",
    // accessorFn: (row) => row.title,
    cell(props) {
      return (
        <Link className="font-medium" href={`/cms/posts/${props.row.id}`}>
          {props.getValue("title")}
        </Link>
      );
    },
  },
  {
    accessorKey: "status",
    header: "Status",
  },
];
