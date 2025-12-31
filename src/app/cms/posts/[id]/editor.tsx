"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Document from "@tiptap/extension-document";
import { Placeholder } from "@tiptap/extensions/placeholder";
import { Node, type JSONContent } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { Post, SavePostInput } from "@/lib/posts";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

type EditorProps = {
  post: Post;
  savePost: (input: SavePostInput) => Promise<{ id: string }>;
};

const Title = Node.create({
  name: "title",
  group: "title",
  content: "text*",
  marks: "",
  defining: true,
  parseHTML() {
    return [{ tag: "post-title" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["post-title", HTMLAttributes, 0];
  },
});

const PostDocument = Document.extend({
  content: "title block+",
});

const extractTitle = (content: JSONContent | null | undefined) => {
  const nodes = content?.content ?? [];
  const titleNode = nodes.find((node) => node.type === "title");
  if (!titleNode?.content?.length) return "";
  return titleNode.content
    .map((node) => ("text" in node ? node.text : ""))
    .join("");
};

const normalizeDocContent = (
  content: JSONContent,
  title: string
): JSONContent => {
  const nodes = content.type === "doc" ? (content.content ?? []) : [];
  const titleNode =
    nodes.find((node) => node.type === "title") ??
    (title
      ? { type: "title", content: [{ type: "text", text: title }] }
      : { type: "title", content: [] });
  const bodyNodes = nodes.filter((node) => node.type !== "title");
  const normalizedBody =
    bodyNodes.length === 0 ? [{ type: "paragraph" }] : bodyNodes;

  return {
    type: "doc",
    content: [titleNode, ...normalizedBody],
  };
};

const formatDateForInput = (value?: string) =>
  value ? value.slice(0, 10) : "";

const parseDateFromInput = (value: string) =>
  value ? new Date(value).toISOString() : "";

const Tiptap = ({ post, savePost }: EditorProps) => {
  const router = useRouter();
  const defaultContent = useMemo(() => {
    const content = post.content ?? {
      type: "doc",
      content: [{ type: "paragraph" }],
    };
    return normalizeDocContent(content, post.title);
  }, [post.content, post.title]);

  console.log("Default content:", defaultContent);

  const [title, setTitle] = useState(
    () => extractTitle(defaultContent) || post.title
  );
  const [status, setStatus] = useState(post.status);
  const [publishedAt, setPublishedAt] = useState(post.publishedAt ?? "");
  const [lastSavedAt, setLastSavedAt] = useState(post.updatedAt);
  const [isSaving, startTransition] = useTransition();

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      PostDocument,
      Title,
      StarterKit.configure({ document: false }),
      Placeholder.configure({
        showOnlyCurrent: false,
        placeholder: ({ node }) =>
          node.type.name === "title" ? "Untitled post" : "Write your story...",
      }),
    ],
    content: defaultContent,
    onUpdate: ({ editor }) => {
      setTitle(extractTitle(editor.getJSON()));
    },
  });

  const handleSave = () => {
    if (!editor) return;
    const content = editor.getJSON();
    const nextTitle = extractTitle(content);
    const nextPublishedAt =
      publishedAt || (status === "published" ? new Date().toISOString() : "");
    startTransition(async () => {
      const result = await savePost({
        id: post.id,
        title: nextTitle,
        status,
        content,
        publishedAt: nextPublishedAt || undefined,
      });
      setLastSavedAt(new Date().toISOString());
      setTitle(nextTitle);
      setPublishedAt(nextPublishedAt);
      if (post.id === "new" && result.id) {
        router.replace(`/cms/posts/${result.id}`);
      }
    });
  };

  return (
    <>
      <header className="flex min-h-16 flex-wrap items-center gap-3 border-b px-4 py-2">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-1 data-[orientation=vertical]:h-4"
        />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink href="/cms">Content</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink href="/cms/posts">Posts</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbPage>{title || "Untitled post"}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <label
              className="text-xs font-medium uppercase tracking-wide"
              htmlFor="status"
            >
              Status
            </label>
            <select
              id="status"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as Post["status"])
              }
              className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950"
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <label
              className="text-xs font-medium uppercase tracking-wide"
              htmlFor="publishedAt"
            >
              Published
            </label>
            <input
              id="publishedAt"
              type="date"
              value={formatDateForInput(publishedAt)}
              onChange={(event) =>
                setPublishedAt(parseDateFromInput(event.target.value))
              }
              className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950"
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">
              {isSaving
                ? "Saving..."
                : `Last saved ${new Date(lastSavedAt).toLocaleString()}`}
            </span>
            <Button onClick={handleSave} disabled={!editor || isSaving}>
              Save
            </Button>
          </div>
        </div>
      </header>
      <div className="flex flex-1 bg-white">
        <EditorContent
          editor={editor}
          className="w-full [&_.tiptap]:mx-auto [&_.tiptap]:w-full [&_.tiptap]:max-w-3xl [&_.tiptap]:px-6 [&_.tiptap]:py-12 [&_.tiptap]:min-h-full [&_.tiptap]:outline-none [&_.tiptap]:prose [&_.tiptap]:prose-lg [&_.tiptap]:text-gray-900 [&_.tiptap\\ h1]:mb-6 [&_.tiptap\\ h1]:mt-4 [&_.tiptap\\ h1]:text-4xl [&_.tiptap\\ h1]:font-semibold [&_.tiptap\\ h1]:tracking-tight [&_.is-empty::before]:float-left [&_.is-empty::before]:h-0 [&_.is-empty::before]:text-gray-400 [&_.is-empty::before]:pointer-events-none [&_.is-empty::before]:content-[attr(data-placeholder)]"
        />
      </div>
    </>
  );
};

export default Tiptap;
