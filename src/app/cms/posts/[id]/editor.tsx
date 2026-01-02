"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Document from "@tiptap/extension-document";
import { Placeholder } from "@tiptap/extensions/placeholder";
import { Node, type Editor, type JSONContent } from "@tiptap/core";
import {
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
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

const stripTitleNode = (content: JSONContent): JSONContent => {
  const nodes = content.type === "doc" ? (content.content ?? []) : [];
  const bodyNodes = nodes.filter((node) => node.type !== "title");
  return {
    type: "doc",
    content: bodyNodes.length > 0 ? bodyNodes : [{ type: "paragraph" }],
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
  const initialType = post.type ?? "long";
  const defaultLongContent = useMemo(() => {
    const content = post.content ?? {
      type: "doc",
      content: [{ type: "paragraph" }],
    };
    return normalizeDocContent(content, post.title);
  }, [post.content, post.title]);
  const defaultCompactContent = useMemo(() => {
    const content = post.content ?? {
      type: "doc",
      content: [{ type: "paragraph" }],
    };
    return stripTitleNode(content);
  }, [post.content]);

  const [postType, setPostType] = useState<Post["type"]>(initialType);
  const [title, setTitle] = useState(() =>
    initialType === "long"
      ? extractTitle(defaultLongContent) || post.title
      : post.title
  );
  const [status, setStatus] = useState(post.status);
  const [publishedAt, setPublishedAt] = useState(post.publishedAt ?? "");
  const [lastSavedAt, setLastSavedAt] = useState(post.updatedAt);
  const [isSaving, startTransition] = useTransition();
  const [isImageSheetOpen, setImageSheetOpen] = useState(false);
  const [libraryImages, setLibraryImages] = useState<ImageAsset[]>(images);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [uploadCaption, setUploadCaption] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [reactionKind, setReactionKind] = useState<"tweet" | "url" | "video">(
    post.meta?.sourceKind ?? "url"
  );
  const [reactionUrl, setReactionUrl] = useState(post.meta?.sourceUrl ?? "");
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
  const editorBodyRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  const minimapTrackRef = useRef<HTMLDivElement | null>(null);
  const minimapRafRef = useRef<number | null>(null);
  const minimapDraggingRef = useRef(false);
  const slashStateRef = useRef(slashState);
  const slashIndexRef = useRef(slashIndex);
  const filteredCommandsRef = useRef<SlashCommand[]>([]);
  const postTypeRef = useRef(postType);
  const previousTypeRef = useRef<Post["type"]>(postType);
  const [minimapBlocks, setMinimapBlocks] = useState<
    {
      top: number;
      height: number;
      variant: "title" | "heading" | "media" | "text";
    }[]
  >([]);
  const [minimapMeta, setMinimapMeta] = useState({
    contentTop: 0,
    contentHeight: 0,
    scrollTop: 0,
    viewportHeight: 0,
    headerHeight: 0,
  });

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
  const compactEditor = useEditor({
    immediatelyRender: false,
    extensions: [
      ImageBlock,
      StarterKit,
      Placeholder.configure({
        showOnlyCurrent: false,
        placeholder: () =>
          postTypeRef.current === "reaction"
            ? "Add your reaction..."
            : "Share a short thought...",
      }),
    ],
    content: defaultCompactContent,
    onUpdate: ({ editor }) => {
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
  const isLongForm = postType === "long";
  const activeEditor = isLongForm ? editor : compactEditor;

  const clampValue = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

  const updateMinimapViewport = () => {
    const contentRoot = editorBodyRef.current?.querySelector(
      ".tiptap"
    ) as HTMLElement | null;
    if (!contentRoot) return;
    const headerHeight = headerRef.current?.getBoundingClientRect().height ?? 0;
    const rect = contentRoot.getBoundingClientRect();
    const contentTop = rect.top + window.scrollY;
    const contentHeight = contentRoot.scrollHeight;
    const scrollTop = window.scrollY - contentTop + headerHeight;
    const viewportHeight = Math.max(0, window.innerHeight - headerHeight);
    setMinimapMeta({
      contentTop,
      contentHeight,
      scrollTop,
      viewportHeight,
      headerHeight,
    });
  };

  const rebuildMinimapBlocks = () => {
    const contentRoot = editorBodyRef.current?.querySelector(
      ".tiptap"
    ) as HTMLElement | null;
    if (!contentRoot) return;
    const contentHeight = contentRoot.scrollHeight;
    if (contentHeight <= 0) return;
    const blocks = Array.from(contentRoot.children).map((node) => {
      const element = node as HTMLElement;
      const tag = element.tagName.toLowerCase();
      const variant =
        tag === "post-title"
          ? "title"
          : tag.startsWith("h")
            ? "heading"
            : tag === "figure"
              ? "media"
              : "text";
      return {
        top: element.offsetTop / contentHeight,
        height: Math.max(element.offsetHeight / contentHeight, 0.01),
        variant,
      };
    });
    setMinimapBlocks(blocks);
    updateMinimapViewport();
  };

  const scheduleMinimapUpdate = (mode: "viewport" | "full") => {
    if (minimapRafRef.current) return;
    minimapRafRef.current = window.requestAnimationFrame(() => {
      minimapRafRef.current = null;
      if (mode === "full") {
        rebuildMinimapBlocks();
      } else {
        updateMinimapViewport();
      }
    });
  };

  const scrollFromMinimap = (
    event: ReactPointerEvent<HTMLDivElement>,
    behavior: ScrollBehavior
  ) => {
    const track = minimapTrackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const ratio = clampValue((event.clientY - rect.top) / rect.height, 0, 1);
    const target =
      minimapMeta.contentTop +
      ratio * minimapMeta.contentHeight -
      minimapMeta.headerHeight -
      minimapMeta.viewportHeight / 2;
    const minScroll = minimapMeta.contentTop - minimapMeta.headerHeight;
    const maxScroll = Math.max(
      minScroll,
      minimapMeta.contentTop + minimapMeta.contentHeight - window.innerHeight
    );
    const top = clampValue(target, minScroll, maxScroll);
    window.scrollTo({ top, behavior });
  };

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
    if (!editor || !isLongForm) return;
    rebuildMinimapBlocks();
    const handleUpdate = () => scheduleMinimapUpdate("full");
    const handleScroll = () => scheduleMinimapUpdate("viewport");
    const handleResize = () => scheduleMinimapUpdate("full");
    editor.on("update", handleUpdate);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleResize);
    return () => {
      editor.off("update", handleUpdate);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleResize);
    };
  }, [editor, isLongForm]);

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

  useEffect(() => {
    postTypeRef.current = postType;
  }, [postType]);

  useEffect(() => {
    if (!editor || !compactEditor) return;
    const previousType = previousTypeRef.current;
    if (previousType === postType) return;
    if (postType === "long") {
      const compactContent = compactEditor.getJSON();
      editor.commands.setContent(
        normalizeDocContent(compactContent, title),
        false
      );
    } else {
      const longContent = editor.getJSON();
      compactEditor.commands.setContent(stripTitleNode(longContent), false);
    }
    previousTypeRef.current = postType;
  }, [compactEditor, editor, postType, title]);

  const selectedImage = useMemo(
    () => libraryImages.find((image) => image.id === selectedImageId) ?? null,
    [libraryImages, selectedImageId]
  );

  const handleSave = () => {
    if (!activeEditor) return;
    const rawContent = activeEditor.getJSON();
    const nextTitle =
      postType === "long" ? extractTitle(rawContent) : title.trim();
    const content =
      postType === "long"
        ? normalizeDocContent(rawContent, nextTitle)
        : stripTitleNode(rawContent);
    const trimmedUrl = reactionUrl.trim();
    const meta =
      postType === "reaction"
        ? {
            sourceKind: reactionKind,
            ...(trimmedUrl ? { sourceUrl: trimmedUrl } : {}),
          }
        : {};
    const nextPublishedAt =
      publishedAt || (status === "published" ? new Date().toISOString() : "");
    startTransition(async () => {
      const result = await savePost({
        id: post.id,
        title: nextTitle,
        status,
        content,
        type: postType,
        meta,
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
  const compactEditorClass =
    "w-full [&_.tiptap]:w-full [&_.tiptap]:min-h-[10rem] [&_.tiptap]:px-4 [&_.tiptap]:py-4 [&_.tiptap]:outline-none [&_.tiptap]:prose [&_.tiptap]:prose-base [&_.tiptap]:text-gray-900 [&_.tiptap\\ figure]:my-4 [&_.tiptap\\ figure]:overflow-hidden [&_.tiptap\\ figure]:rounded-xl [&_.tiptap\\ figure]:border [&_.tiptap\\ figure]:border-gray-200 [&_.tiptap\\ figure]:bg-white [&_.tiptap\\ figure\\ img]:w-full [&_.tiptap\\ figure\\ img]:object-cover [&_.tiptap\\ figcaption]:px-4 [&_.tiptap\\ figcaption]:py-3 [&_.tiptap\\ figcaption]:text-sm [&_.tiptap\\ figcaption]:text-gray-600 [&_.is-empty::before]:float-left [&_.is-empty::before]:h-0 [&_.is-empty::before]:text-gray-400 [&_.is-empty::before]:pointer-events-none [&_.is-empty::before]:content-[attr(data-placeholder)]";

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
      <header
        ref={headerRef}
        className="flex min-h-16 flex-wrap items-center gap-3 border-b px-4 py-2 sticky top-0 z-10 bg-white"
      >
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
              htmlFor="postType"
            >
              Type
            </label>
            <select
              id="postType"
              value={postType}
              onChange={(event) =>
                setPostType(event.target.value as Post["type"])
              }
              className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950"
            >
              <option value="long">Long form</option>
              <option value="short">Short form</option>
              <option value="reaction">Reaction</option>
            </select>
          </div>
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
      <div
        className={
          isLongForm ? "flex flex-1 bg-white" : "flex flex-1 bg-gray-50"
        }
      >
        {activeEditor ? (
          <BubbleMenu
            editor={activeEditor}
            tippyOptions={{ duration: 100, maxWidth: "none", placement: "top" }}
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
                data-active={editor.isActive("bold")}
                aria-pressed={editor.isActive("bold")}
                aria-label="Toggle bold"
                onClick={() => editor.chain().focus().toggleBold().run()}
              >
                <Bold className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className={toolbarButtonClass}
                data-active={editor.isActive("italic")}
                aria-pressed={editor.isActive("italic")}
                aria-label="Toggle italic"
                onClick={() => editor.chain().focus().toggleItalic().run()}
              >
                <Italic className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className={toolbarButtonClass}
                data-active={editor.isActive("strike")}
                aria-pressed={editor.isActive("strike")}
                aria-label="Toggle strikethrough"
                onClick={() => editor.chain().focus().toggleStrike().run()}
              >
                <Strikethrough className="size-4" />
              </Button>
              <span aria-hidden className="mx-1 h-4 w-px bg-gray-200" />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className={toolbarButtonClass}
                data-active={editor.isActive("heading", { level: 2 })}
                aria-pressed={editor.isActive("heading", { level: 2 })}
                aria-label="Toggle heading"
                onClick={() =>
                  editor.chain().focus().toggleHeading({ level: 2 }).run()
                }
              >
                <Heading2 className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className={toolbarButtonClass}
                data-active={editor.isActive("code")}
                aria-pressed={editor.isActive("code")}
                aria-label="Toggle inline code"
                onClick={() => editor.chain().focus().toggleCode().run()}
              >
                <Code className="size-4" />
              </Button>
              <span aria-hidden className="mx-1 h-4 w-px bg-gray-200" />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className={toolbarButtonClass}
                data-active={editor.isActive("bulletList")}
                aria-pressed={editor.isActive("bulletList")}
                aria-label="Toggle bulleted list"
                onClick={() => editor.chain().focus().toggleBulletList().run()}
              >
                <List className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className={toolbarButtonClass}
                data-active={editor.isActive("orderedList")}
                aria-pressed={editor.isActive("orderedList")}
                aria-label="Toggle numbered list"
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
              >
                <ListOrdered className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className={toolbarButtonClass}
                data-active={editor.isActive("blockquote")}
                aria-pressed={editor.isActive("blockquote")}
                aria-label="Toggle blockquote"
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
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
        {isLongForm ? (
          <>
            <div ref={editorBodyRef} className="flex-1">
              <EditorContent
                editor={activeEditor}
                className={longEditorClass}
              />
            </div>
            <aside className="relative hidden w-24 shrink-0 pr-4 lg:block">
              <div className="sticky top-24">
                <div
                  ref={minimapTrackRef}
                  className="relative h-[calc(100vh-10rem)] rounded-xl border border-gray-200 bg-gray-50 shadow-inner"
                  onPointerDown={(event) => {
                    minimapDraggingRef.current = true;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    scrollFromMinimap(event, "auto");
                  }}
                  onPointerMove={(event) => {
                    if (!minimapDraggingRef.current) return;
                    scrollFromMinimap(event, "auto");
                  }}
                  onPointerUp={() => {
                    minimapDraggingRef.current = false;
                  }}
                  onClick={(event) => scrollFromMinimap(event, "smooth")}
                >
                  {minimapMeta.contentHeight > 0
                    ? minimapBlocks.map((block, index) => (
                        <div
                          key={`${block.variant}-${index}`}
                          className={`absolute left-2 right-2 rounded-sm ${
                            block.variant === "title"
                              ? "bg-gray-900"
                              : block.variant === "heading"
                                ? "bg-gray-600"
                                : block.variant === "media"
                                  ? "bg-gray-400"
                                  : "bg-gray-300"
                          }`}
                          style={{
                            top: `${block.top * 100}%`,
                            height: `${block.height * 100}%`,
                          }}
                        />
                      ))
                    : null}
                  {minimapMeta.contentHeight > 0 ? (
                    <div
                      className="absolute left-1 right-1 rounded-md border border-gray-900/30 bg-gray-900/10"
                      style={{
                        top: `${clampValue(
                          (minimapMeta.scrollTop / minimapMeta.contentHeight) *
                            100,
                          0,
                          100
                        )}%`,
                        height: `${clampValue(
                          (minimapMeta.viewportHeight /
                            minimapMeta.contentHeight) *
                            100,
                          6,
                          100
                        )}%`,
                      }}
                    />
                  ) : null}
                </div>
              </div>
            </aside>
          </>
        ) : (
          <div className="flex flex-1 justify-center px-6 py-10">
            <div className="w-full max-w-2xl space-y-6">
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-6">
                <div className="space-y-1">
                  <label className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Title
                  </label>
                  <Input
                    type="text"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Add a title..."
                  />
                </div>
                {postType === "reaction" ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1">
                      <label
                        className="text-xs font-medium uppercase tracking-wide text-gray-500"
                        htmlFor="reactionKind"
                      >
                        Source
                      </label>
                      <select
                        id="reactionKind"
                        value={reactionKind}
                        onChange={(event) =>
                          setReactionKind(
                            event.target.value as "tweet" | "url" | "video"
                          )
                        }
                        className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950"
                      >
                        <option value="tweet">Tweet / X</option>
                        <option value="url">Link</option>
                        <option value="video">Video</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label
                        className="text-xs font-medium uppercase tracking-wide text-gray-500"
                        htmlFor="reactionUrl"
                      >
                        URL
                      </label>
                      <Input
                        id="reactionUrl"
                        type="url"
                        value={reactionUrl}
                        onChange={(event) => setReactionUrl(event.target.value)}
                        placeholder="https://"
                      />
                    </div>
                  </div>
                ) : null}
                <div
                  ref={editorBodyRef}
                  className="rounded-xl border border-gray-200 bg-gray-50"
                >
                  <EditorContent
                    editor={activeEditor}
                    className={compactEditorClass}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default Tiptap;
