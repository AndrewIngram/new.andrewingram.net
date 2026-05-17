"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Document from "@tiptap/extension-document";
import { Placeholder } from "@tiptap/extensions/placeholder";
import { Node, type Editor, type JSONContent } from "@tiptap/core";
import {
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "@tanstack/react-router";
import {
  Bold,
  Code,
  Code2,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
} from "lucide-react";

import type { Post, SavePostInput } from "@/lib/posts";
import type { ImageAsset } from "@/lib/images";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type EditorProps = {
  post: Post;
  savePost: (input: SavePostInput) => Promise<{ id: string }>;
  uploadImage: (formData: FormData) => Promise<ImageAsset>;
  images: ImageAsset[];
};

type SlashCommand = {
  id: string;
  title: string;
  description: string;
  icon: typeof ImageIcon;
  run: (editor: Editor) => void;
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

const ImageBlock = Node.create({
  name: "imageBlock",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      src: {
        default: "",
      },
      alt: {
        default: "",
      },
      caption: {
        default: "",
      },
    };
  },
  parseHTML() {
    return [{ tag: "figure[data-type='image-block']" }];
  },
  renderHTML({ HTMLAttributes }) {
    const { src, alt, caption } = HTMLAttributes;
    const figcaption = caption ? ["figcaption", {}, caption] : null;
    return [
      "figure",
      { "data-type": "image-block" },
      ["img", { src, alt, loading: "lazy" }],
      ...(figcaption ? [figcaption] : []),
    ];
  },
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

const Tiptap = ({ post, savePost, uploadImage, images }: EditorProps) => {
  const toolbarButtonClass =
    "text-gray-700 hover:bg-gray-100 data-[active=true]:bg-gray-900 data-[active=true]:text-white";
  const router = useRouter();
  const defaultLongContent = useMemo(() => {
    const content = post.content ?? {
      type: "doc",
      content: [{ type: "paragraph" }],
    };
    return normalizeDocContent(content, post.title);
  }, [post.content, post.title]);

  const [title, setTitle] = useState(() =>
    extractTitle(defaultLongContent) || post.title
  );
  const [status, setStatus] = useState(post.status);
  const [publishedAt, setPublishedAt] = useState(post.publishedAt ?? "");
  const [isSaving, startTransition] = useTransition();
  const [isImageSheetOpen, setImageSheetOpen] = useState(false);
  const [libraryImages, setLibraryImages] = useState<ImageAsset[]>(images);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [uploadCaption, setUploadCaption] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [captionMode, setCaptionMode] = useState<"use" | "override" | "none">(
    "use"
  );
  const [captionOverride, setCaptionOverride] = useState("");
  const [slashState, setSlashState] = useState<{
    open: boolean;
    query: string;
    range: { from: number; to: number } | null;
    position: { top: number; left: number } | null;
  }>({
    open: false,
    query: "",
    range: null,
    position: null,
  });
  const [slashIndex, setSlashIndex] = useState(0);
  const editorRef = useRef<Editor | null>(null);
  const slashStateRef = useRef(slashState);
  const slashIndexRef = useRef(slashIndex);
  const filteredCommandsRef = useRef<SlashCommand[]>([]);

  const updateSlashMenu = (editorInstance: Editor) => {
    const { selection } = editorInstance.state;
    if (!selection.empty) {
      setSlashState((prev) =>
        prev.open
          ? { open: false, query: "", range: null, position: null }
          : prev
      );
      return;
    }

    const { $from } = selection;
    if (!$from.parent.isTextblock || $from.parent.type.name === "title") {
      setSlashState((prev) =>
        prev.open
          ? { open: false, query: "", range: null, position: null }
          : prev
      );
      return;
    }

    const text = $from.parent.textBetween(0, $from.parentOffset, "\n", "\n");
    const slashIndex = text.lastIndexOf("/");
    if (slashIndex < 0) {
      setSlashState((prev) =>
        prev.open
          ? { open: false, query: "", range: null, position: null }
          : prev
      );
      return;
    }

    if (slashIndex > 0 && !/\s/.test(text[slashIndex - 1] ?? "")) {
      setSlashState((prev) =>
        prev.open
          ? { open: false, query: "", range: null, position: null }
          : prev
      );
      return;
    }

    const query = text.slice(slashIndex + 1);
    if (/\s/.test(query)) {
      setSlashState((prev) =>
        prev.open
          ? { open: false, query: "", range: null, position: null }
          : prev
      );
      return;
    }

    const from = $from.start() + slashIndex;
    const to = $from.start() + $from.parentOffset;
    const coords = editorInstance.view.coordsAtPos($from.pos);
    setSlashState({
      open: true,
      query,
      range: { from, to },
      position: { top: coords.bottom + 8, left: coords.left },
    });
  };

  const runSlashCommand = (command: SlashCommand, editorInstance?: Editor) => {
    const currentEditor = editorInstance ?? editorRef.current;
    const range = slashStateRef.current.range ?? slashState.range;
    if (!currentEditor || !range) return;
    currentEditor.chain().focus().deleteRange(range).run();
    setSlashState({ open: false, query: "", range: null, position: null });
    command.run(currentEditor);
  };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      PostDocument,
      Title,
      ImageBlock,
      StarterKit.configure({ document: false }),
      Placeholder.configure({
        showOnlyCurrent: false,
        placeholder: ({ node }) =>
          node.type.name === "title" ? "Untitled post" : "Write your story...",
      }),
    ],
    content: defaultLongContent,
    onUpdate: ({ editor }) => {
      setTitle(extractTitle(editor.getJSON()));
      updateSlashMenu(editor);
    },
    onSelectionUpdate: ({ editor }) => {
      updateSlashMenu(editor);
    },
    editorProps: {
      handleKeyDown: (_view, event) => {
        if (!slashStateRef.current.open) return false;
        const commands = filteredCommandsRef.current;
        if (commands.length === 0) return false;
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setSlashIndex((prev) => (prev + 1) % commands.length);
          return true;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setSlashIndex(
            (prev) => (prev - 1 + commands.length) % commands.length
          );
          return true;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          const command = commands[slashIndexRef.current];
          const currentEditor = editorRef.current;
          if (command && currentEditor) {
            runSlashCommand(command, currentEditor);
            return true;
          }
        }
        if (event.key === "Escape") {
          event.preventDefault();
          setSlashState({
            open: false,
            query: "",
            range: null,
            position: null,
          });
          return true;
        }
        return false;
      },
    },
  });
  const activeEditor = editor;

  const slashCommands = useMemo(
    (): SlashCommand[] => [
      {
        id: "image",
        title: "Image",
        description: "Embed an image from the library",
        icon: ImageIcon,
        run: () => setImageSheetOpen(true),
      },
      {
        id: "heading-2",
        title: "Heading 2",
        description: "Large section heading",
        icon: Heading2,
        run: (editorInstance) =>
          editorInstance.chain().focus().toggleHeading({ level: 2 }).run(),
      },
      {
        id: "heading-3",
        title: "Heading 3",
        description: "Subsection heading",
        icon: Heading3,
        run: (editorInstance) =>
          editorInstance.chain().focus().toggleHeading({ level: 3 }).run(),
      },
      {
        id: "code-block",
        title: "Code block",
        description: "Insert a code block",
        icon: Code2,
        run: (editorInstance) =>
          editorInstance.chain().focus().toggleCodeBlock().run(),
      },
    ],
    []
  );

  const filteredCommands = useMemo(() => {
    const query = slashState.query.trim().toLowerCase();
    if (!query) return slashCommands;
    return slashCommands.filter((command) =>
      `${command.title} ${command.description}`.toLowerCase().includes(query)
    );
  }, [slashCommands, slashState.query]);

  useEffect(() => {
    setSlashIndex(0);
  }, [slashState.query]);

  useEffect(() => {
    editorRef.current = activeEditor;
  }, [activeEditor]);

  useEffect(() => {
    slashStateRef.current = slashState;
  }, [slashState]);

  useEffect(() => {
    slashIndexRef.current = slashIndex;
  }, [slashIndex]);

  useEffect(() => {
    filteredCommandsRef.current = filteredCommands;
  }, [filteredCommands]);

  useEffect(() => {
    if (!activeEditor || !slashState.open) return;
    const handleViewportChange = () => updateSlashMenu(activeEditor);
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);
    return () => {
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, [activeEditor, slashState.open]);

  const selectedImage = useMemo(
    () => libraryImages.find((image) => image.id === selectedImageId) ?? null,
    [libraryImages, selectedImageId]
  );

  const handleSave = () => {
    if (!activeEditor) return;
    const rawContent = activeEditor.getJSON();
    const nextTitle = extractTitle(rawContent);
    const content = normalizeDocContent(rawContent, nextTitle);
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
      setTitle(nextTitle);
      setPublishedAt(nextPublishedAt);
      if (post.id === "new" && result.id) {
        await router.navigate({
          to: "/cms/posts/$id",
          params: { id: result.id },
          replace: true,
        });
      }
    });
  };

  const handleUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!uploadFile) return;
    const formData = new FormData();
    formData.set("file", uploadFile);
    if (uploadCaption.trim()) {
      formData.set("caption", uploadCaption.trim());
    }
    const image = await uploadImage(formData);
    setLibraryImages((prev) => [image, ...prev]);
    setSelectedImageId(image.id);
    setCaptionMode(image.caption ? "use" : "none");
    setCaptionOverride("");
    setUploadCaption("");
    setUploadFile(null);
  };

  const handleEmbedImage = () => {
    if (!activeEditor || !selectedImage) return;
    const caption =
      captionMode === "use"
        ? (selectedImage.caption ?? "")
        : captionMode === "override"
          ? captionOverride.trim()
          : "";
    activeEditor
      .chain()
      .focus()
      .insertContent({
        type: "imageBlock",
        attrs: {
          src: `/images/${selectedImage.id}`,
          alt: selectedImage.originalName,
          caption,
        },
      })
      .run();
    setImageSheetOpen(false);
  };

  const longEditorClass =
    "w-full [&_.tiptap]:mx-auto [&_.tiptap]:w-full [&_.tiptap]:max-w-3xl [&_.tiptap]:px-6 [&_.tiptap]:py-12 [&_.tiptap]:min-h-full [&_.tiptap]:outline-none [&_.tiptap]:prose [&_.tiptap]:prose-lg [&_.tiptap]:text-gray-900 [&_.tiptap\\ h1]:mb-6 [&_.tiptap\\ h1]:mt-4 [&_.tiptap\\ h1]:text-4xl [&_.tiptap\\ h1]:font-semibold [&_.tiptap\\ h1]:tracking-tight [&_.tiptap\\ figure]:my-6 [&_.tiptap\\ figure]:overflow-hidden [&_.tiptap\\ figure]:rounded-xl [&_.tiptap\\ figure]:border [&_.tiptap\\ figure]:border-gray-200 [&_.tiptap\\ figure]:bg-white [&_.tiptap\\ figure\\ img]:w-full [&_.tiptap\\ figure\\ img]:object-cover [&_.tiptap\\ figcaption]:px-4 [&_.tiptap\\ figcaption]:py-3 [&_.tiptap\\ figcaption]:text-sm [&_.tiptap\\ figcaption]:text-gray-600 [&_.is-empty::before]:float-left [&_.is-empty::before]:h-0 [&_.is-empty::before]:text-gray-400 [&_.is-empty::before]:pointer-events-none [&_.is-empty::before]:content-[attr(data-placeholder)]";

  return (
    <>
      <Sheet open={isImageSheetOpen} onOpenChange={setImageSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Image library</SheetTitle>
            <SheetDescription>
              Upload a new image or select an existing one to embed.
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 pb-4">
            <section className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900">Upload</h3>
              <form className="mt-3 space-y-3" onSubmit={handleUpload}>
                <div className="space-y-1">
                  <label className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    File
                  </label>
                  <Input
                    type="file"
                    accept="image/*"
                    required
                    onChange={(event) =>
                      setUploadFile(event.target.files?.[0] ?? null)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Caption (optional)
                  </label>
                  <Input
                    type="text"
                    value={uploadCaption}
                    onChange={(event) => setUploadCaption(event.target.value)}
                    placeholder="Photo by..."
                  />
                </div>
                <Button type="submit" disabled={!uploadFile}>
                  Upload image
                </Button>
              </form>
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Library</h3>
                <span className="text-xs text-gray-500">
                  {libraryImages.length} images
                </span>
              </div>
              {libraryImages.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 p-4 text-center text-xs text-gray-500">
                  No images uploaded yet.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {libraryImages.map((image) => (
                    <button
                      key={image.id}
                      type="button"
                      onClick={() => {
                        setSelectedImageId(image.id);
                        setCaptionMode(image.caption ? "use" : "none");
                        setCaptionOverride("");
                      }}
                      className={`overflow-hidden rounded-lg border text-left transition ${
                        selectedImageId === image.id
                          ? "border-gray-900 shadow-sm"
                          : "border-gray-200 hover:border-gray-400"
                      }`}
                    >
                      <div className="aspect-video bg-gray-50">
                        <img
                          src={`/images/${image.id}`}
                          alt={image.originalName}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </div>
                      <div className="space-y-1 p-2">
                        <p className="text-xs font-medium text-gray-900">
                          {image.originalName}
                        </p>
                        {image.caption ? (
                          <p className="text-xs text-gray-600">
                            {image.caption}
                          </p>
                        ) : (
                          <p className="text-xs text-gray-400">No caption</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {selectedImage ? (
              <section className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-900">
                  Embed settings
                </h3>
                <div className="mt-3 space-y-3 text-sm">
                  <div className="space-y-1">
                    <label className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Caption
                    </label>
                    <select
                      value={captionMode}
                      onChange={(event) =>
                        setCaptionMode(
                          event.target.value as "use" | "override" | "none"
                        )
                      }
                      className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950"
                    >
                      <option value="use">Use stored caption</option>
                      <option value="override">Override caption</option>
                      <option value="none">No caption</option>
                    </select>
                  </div>
                  {captionMode === "override" ? (
                    <div className="space-y-1">
                      <label className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        Caption text
                      </label>
                      <Input
                        type="text"
                        value={captionOverride}
                        onChange={(event) =>
                          setCaptionOverride(event.target.value)
                        }
                        placeholder="Add a custom caption..."
                      />
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}
          </div>
          <SheetFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setImageSheetOpen(false)}
            >
              Close
            </Button>
            <Button
              type="button"
              onClick={handleEmbedImage}
              disabled={!selectedImage}
            >
              Insert image
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <header className="flex min-h-16 flex-wrap items-center gap-3 border-b px-4 py-2 sticky top-0 z-10 bg-white">
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
          <Button
            type="button"
            variant="outline"
            onClick={() => setImageSheetOpen(true)}
          >
            <ImageIcon className="mr-2 size-4" />
            Images
          </Button>
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
            {isSaving ? (
              <span className="text-xs text-gray-500">Saving...</span>
            ) : null}
            <Button onClick={handleSave} disabled={!activeEditor || isSaving}>
              Save
            </Button>
          </div>
        </div>
      </header>
      <div className="flex flex-1 bg-white">
        {activeEditor ? (
          <BubbleMenu
            editor={activeEditor}
            shouldShow={({ editor, state }) => {
              const { selection } = state;
              return !selection.empty && !editor.isActive("title");
            }}
          >
            <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className={toolbarButtonClass}
                data-active={activeEditor.isActive("bold")}
                aria-pressed={activeEditor.isActive("bold")}
                aria-label="Toggle bold"
                onClick={() => activeEditor.chain().focus().toggleBold().run()}
              >
                <Bold className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className={toolbarButtonClass}
                data-active={activeEditor.isActive("italic")}
                aria-pressed={activeEditor.isActive("italic")}
                aria-label="Toggle italic"
                onClick={() => activeEditor.chain().focus().toggleItalic().run()}
              >
                <Italic className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className={toolbarButtonClass}
                data-active={activeEditor.isActive("strike")}
                aria-pressed={activeEditor.isActive("strike")}
                aria-label="Toggle strikethrough"
                onClick={() => activeEditor.chain().focus().toggleStrike().run()}
              >
                <Strikethrough className="size-4" />
              </Button>
              <span aria-hidden className="mx-1 h-4 w-px bg-gray-200" />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className={toolbarButtonClass}
                data-active={activeEditor.isActive("heading", { level: 2 })}
                aria-pressed={activeEditor.isActive("heading", { level: 2 })}
                aria-label="Toggle heading"
                onClick={() =>
                  activeEditor.chain().focus().toggleHeading({ level: 2 }).run()
                }
              >
                <Heading2 className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className={toolbarButtonClass}
                data-active={activeEditor.isActive("code")}
                aria-pressed={activeEditor.isActive("code")}
                aria-label="Toggle inline code"
                onClick={() => activeEditor.chain().focus().toggleCode().run()}
              >
                <Code className="size-4" />
              </Button>
              <span aria-hidden className="mx-1 h-4 w-px bg-gray-200" />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className={toolbarButtonClass}
                data-active={activeEditor.isActive("bulletList")}
                aria-pressed={activeEditor.isActive("bulletList")}
                aria-label="Toggle bulleted list"
                onClick={() => activeEditor.chain().focus().toggleBulletList().run()}
              >
                <List className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className={toolbarButtonClass}
                data-active={activeEditor.isActive("orderedList")}
                aria-pressed={activeEditor.isActive("orderedList")}
                aria-label="Toggle numbered list"
                onClick={() => activeEditor.chain().focus().toggleOrderedList().run()}
              >
                <ListOrdered className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className={toolbarButtonClass}
                data-active={activeEditor.isActive("blockquote")}
                aria-pressed={activeEditor.isActive("blockquote")}
                aria-label="Toggle blockquote"
                onClick={() => activeEditor.chain().focus().toggleBlockquote().run()}
              >
                <Quote className="size-4" />
              </Button>
            </div>
          </BubbleMenu>
        ) : null}
        {activeEditor && slashState.open && slashState.position ? (
          <div
            className="fixed z-50 w-72 rounded-xl border border-gray-200 bg-white p-2 shadow-lg"
            style={{
              top: slashState.position.top,
              left: slashState.position.left,
            }}
          >
            <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Commands
            </div>
            <div className="max-h-64 overflow-y-auto">
              {filteredCommands.length === 0 ? (
                <div className="px-2 py-2 text-sm text-gray-500">
                  No matches.
                </div>
              ) : (
                filteredCommands.map((command, index) => {
                  const Icon = command.icon;
                  return (
                    <button
                      key={command.id}
                      type="button"
                      onClick={() => runSlashCommand(command)}
                      className={`flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition ${
                        index === slashIndex
                          ? "bg-gray-900 text-white"
                          : "hover:bg-gray-100 text-gray-900"
                      }`}
                    >
                      <Icon className="mt-0.5 size-4" />
                      <span>
                        <span className="block text-sm font-medium">
                          {command.title}
                        </span>
                        <span
                          className={`block text-xs ${
                            index === slashIndex
                              ? "text-gray-200"
                              : "text-gray-500"
                          }`}
                        >
                          {command.description}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ) : null}
        <div className="flex-1">
          <EditorContent editor={activeEditor} className={longEditorClass} />
        </div>
      </div>
    </>
  );
};

export default Tiptap;
