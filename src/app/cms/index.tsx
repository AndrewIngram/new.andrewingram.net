import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/cms/")({
  beforeLoad: () => {
    throw redirect({ to: "/cms/posts" });
  },
});
