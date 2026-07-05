"use client";

import { ProseMirror, ProseMirrorDoc, useEditorEffect } from "@handlewithcare/react-prosemirror";
import "prosemirror-view/style/prosemirror.css";
import {
  type FormEvent,
  type MutableRefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "@tanstack/react-router";
import { EditorState, type Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

import type { Post, SavePostInput } from "@/lib/posts";
import type { ImageAsset } from "@/lib/images";
import type {
  AddWritingFeedbackDictionaryWordInput,
  AddWritingFeedbackSuppressionInput,
  WritingFeedbackPreferences,
} from "@/lib/writing-feedback-preferences";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import { CmsFloatingChrome } from "../-floating-chrome";
import { createEditorActions } from "./-editor/commands";
import {
  FigureNodeViewProvider,
  type FigureReplacementRequest,
  nodeViewComponents,
} from "./-editor/figure-node-view";
import { FloatingToolbar } from "./-editor/floating-toolbar";
import { createEditorPlugins, externalPlugins } from "./-editor/plugins";
import { docToJSON, extractTitle, normalizePostDoc, postSchema } from "./-editor/schema";
import { SlashMenu } from "./-editor/slash-menu";
import { WritingFeedbackPopover } from "./-editor/writing-feedback-popover";

type EditorProps = {
  post: Post;
  savePost: (input: SavePostInput) => Promise<{ id: string }>;
  publishPost: (input: SavePostInput) => Promise<{ id: string }>;
  unpublishPost: (id: string) => Promise<{ id: string }>;
  archivePost: (id: string) => Promise<{ id: string }>;
  discardPostDraft: (id: string) => Promise<{ id: string }>;
  uploadImage: (formData: FormData) => Promise<ImageAsset>;
  images: ImageAsset[];
  writingFeedbackPreferences: WritingFeedbackPreferences;
  addWritingFeedbackSuppression: (
    input: AddWritingFeedbackSuppressionInput,
  ) => Promise<{ id: string }>;
  addWritingFeedbackDictionaryWord: (
    input: AddWritingFeedbackDictionaryWordInput,
  ) => Promise<{ id: string }>;
};

type ImageSheetIntent = { type: "insert" } | { type: "replace"; figurePos: number };

const imageIdFromSrc = (src: string) => /^\/images\/([^/?#]+)/.exec(src)?.[1] ?? null;

const toDateTimeLocalValue = (value?: string) => {
  const date = value ? new Date(value) : new Date();
  const validDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return new Date(validDate.getTime() - validDate.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
};

const fromDateTimeLocalValue = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

function EditorViewTracker({
  editorViewRef,
}: {
  editorViewRef: MutableRefObject<EditorView | null>;
}) {
  useEditorEffect(
    (view) => {
      editorViewRef.current = view;
      return () => {
        if (editorViewRef.current === view) editorViewRef.current = null;
      };
    },
    [editorViewRef],
  );
  return null;
}

const PostEditor = ({
  post,
  savePost,
  publishPost,
  unpublishPost,
  archivePost,
  discardPostDraft,
  uploadImage,
  images,
  writingFeedbackPreferences,
  addWritingFeedbackSuppression,
  addWritingFeedbackDictionaryWord,
}: EditorProps) => {
  const router = useRouter();
  const editorViewRef = useRef<EditorView | null>(null);
  const initialDoc = useMemo(
    () => normalizePostDoc(post.content, post.title),
    [post.content, post.title],
  );
  const plugins = useMemo(
    () =>
      createEditorPlugins({
        writingFeedback: { preferences: writingFeedbackPreferences },
      }),
    [writingFeedbackPreferences],
  );
  const [editorState, setEditorState] = useState(() =>
    EditorState.create({
      schema: postSchema,
      doc: initialDoc,
      plugins,
    }),
  );
  const currentContent = docToJSON(editorState.doc);
  const currentTitle = extractTitle(currentContent) || post.title || "Untitled post";
  const [slug, setSlug] = useState(post.slug);
  const [showOutline, setShowOutline] = useState(post.showOutline);
  const [publicationDate, setPublicationDate] = useState(() =>
    toDateTimeLocalValue(post.publishedAt),
  );
  const [isSaving, startTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [imageSheetIntent, setImageSheetIntent] = useState<ImageSheetIntent | null>(null);
  const [libraryImages, setLibraryImages] = useState<ImageAsset[]>(images);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [uploadCaption, setUploadCaption] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const selectedImage = useMemo(
    () => libraryImages.find((image) => image.id === selectedImageId) ?? null,
    [libraryImages, selectedImageId],
  );

  const dispatchTransaction = (transaction: Transaction) => {
    setEditorState((state) => state.apply(transaction));
  };

  useEffect(() => {
    setEditorState(
      EditorState.create({
        schema: postSchema,
        doc: initialDoc,
        plugins,
      }),
    );
    setSlug(post.slug);
    setShowOutline(post.showOutline);
    setPublicationDate(toDateTimeLocalValue(post.publishedAt));
  }, [initialDoc, plugins, post.publishedAt, post.showOutline, post.slug]);

  const getDraftInput = (): SavePostInput => {
    const rawContent = docToJSON(editorState.doc);
    const nextTitle = extractTitle(rawContent);
    return {
      id: post.id,
      title: nextTitle,
      slug,
      content: docToJSON(normalizePostDoc(rawContent, nextTitle)),
      showOutline,
    };
  };

  const runPostMutation = (mutation: () => Promise<{ id: string }>) => {
    setSaveError(null);
    startTransition(async () => {
      try {
        const result = await mutation();
        if (post.id === "new" && result.id) {
          await router.navigate({
            to: "/cms/posts/$id",
            params: { id: result.id },
            replace: true,
          });
        }
        await router.invalidate({ sync: true });
      } catch (error) {
        setSaveError(
          error instanceof Error && error.message ? error.message : "Unable to save post.",
        );
      }
    });
  };

  const handleSave = () => {
    runPostMutation(() => savePost(getDraftInput()));
  };

  const handlePublish = () => {
    runPostMutation(() =>
      publishPost({
        ...getDraftInput(),
        publishedAt: fromDateTimeLocalValue(publicationDate),
      }),
    );
  };

  const handleUnpublish = () => {
    if (post.id === "new") return;
    runPostMutation(() => unpublishPost(post.id));
  };

  const handleDiscardDraft = () => {
    if (post.id === "new") return;
    runPostMutation(() => discardPostDraft(post.id));
  };

  const handleArchive = () => {
    if (post.id === "new") return;
    runPostMutation(() => archivePost(post.id));
  };

  const persistWritingFeedbackSuppression = ({
    scope,
    ...input
  }: Omit<AddWritingFeedbackSuppressionInput, "postId">) => {
    if (scope === "post" && post.id === "new") return;
    void addWritingFeedbackSuppression({
      ...input,
      scope,
      ...(scope === "post" ? { postId: post.id } : {}),
    }).catch((error: unknown) => {
      console.warn("[writing-feedback] unable to persist suppression", error);
    });
  };

  const persistWritingFeedbackDictionaryWord = ({
    scope,
    word,
  }: Omit<AddWritingFeedbackDictionaryWordInput, "postId">) => {
    if (scope === "post" && post.id === "new") return;
    void addWritingFeedbackDictionaryWord({
      scope,
      word,
      ...(scope === "post" ? { postId: post.id } : {}),
    }).catch((error: unknown) => {
      console.warn("[writing-feedback] unable to persist dictionary word", error);
    });
  };

  const handleUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!uploadFile || isUploadingImage) return;

    const formData = new FormData();
    formData.set("file", uploadFile);
    if (uploadCaption.trim()) formData.set("caption", uploadCaption.trim());

    setUploadError(null);
    setUploadingImage(true);
    try {
      const image = await uploadImage(formData);
      setLibraryImages((items) => [image, ...items.filter((item) => item.id !== image.id)]);
      setSelectedImageId(image.id);
      setUploadCaption("");
      setUploadFile(null);
      event.currentTarget.reset();
    } catch (error) {
      setUploadError(
        error instanceof Error && error.message ? error.message : "Unable to upload image.",
      );
    } finally {
      setUploadingImage(false);
    }
  };

  const handleConfirmImage = () => {
    const view = editorViewRef.current;
    if (!selectedImage || !view || !imageSheetIntent) return;

    const imageAttrs = {
      src: `/images/${selectedImage.id}`,
      alt: selectedImage.originalName,
      ...(selectedImage.width == null ? {} : { width: selectedImage.width }),
      ...(selectedImage.height == null ? {} : { height: selectedImage.height }),
    };

    if (imageSheetIntent.type === "replace") {
      createEditorActions(view)
        .chain()
        .replaceFigureImage({
          figurePos: imageSheetIntent.figurePos,
          ...imageAttrs,
        })
        .focus()
        .run();
    } else {
      createEditorActions(view)
        .chain()
        .focus()
        .insertFigure({
          ...imageAttrs,
          caption: selectedImage.caption ?? "",
        })
        .run();
    }

    setImageSheetIntent(null);
  };

  const requestImageReplacement = ({ figurePos, currentSrc }: FigureReplacementRequest) => {
    setSelectedImageId(imageIdFromSrc(currentSrc));
    setImageSheetIntent({ type: "replace", figurePos });
  };

  const longEditorClass =
    "mx-auto w-full max-w-3xl px-6 py-12 min-h-full outline-none prose prose-lg text-gray-900 [&_h1[data-node='title']]:block [&_h1[data-node='title']]:mb-6 [&_h1[data-node='title']]:mt-4 [&_h1[data-node='title']]:text-4xl [&_h1[data-node='title']]:font-semibold [&_h1[data-node='title']]:tracking-tight [&_figure]:my-6 [&_figure]:overflow-hidden [&_figure]:rounded-xl [&_figure]:border [&_figure]:border-gray-200 [&_figure]:bg-white [&_figure_img]:w-full [&_figure_img]:object-cover [&_figcaption]:px-4 [&_figcaption]:py-3 [&_figcaption]:text-sm [&_figcaption]:text-gray-600 [&_.slash-command-query]:rounded [&_.slash-command-query]:bg-gray-100 [&_.slash-command-query]:px-0.5 [&_.is-empty::before]:float-left [&_.is-empty::before]:h-0 [&_.is-empty::before]:text-gray-400 [&_.is-empty::before]:pointer-events-none [&_.is-empty::before]:content-[attr(data-placeholder)]";

  return (
    <>
      <Sheet
        open={imageSheetIntent !== null}
        onOpenChange={(open) => {
          if (!open) setImageSheetIntent(null);
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Image library</SheetTitle>
            <SheetDescription>
              {imageSheetIntent?.type === "replace"
                ? "Upload a new image or select an existing replacement."
                : "Upload a new image or select an existing one to embed."}
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
                    disabled={isUploadingImage}
                    onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
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
                    disabled={isUploadingImage}
                  />
                </div>
                <Button type="submit" disabled={!uploadFile || isUploadingImage}>
                  {isUploadingImage ? "Uploading..." : "Upload image"}
                </Button>
                {uploadError ? (
                  <p role="alert" className="text-sm text-red-600">
                    {uploadError}
                  </p>
                ) : null}
              </form>
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Library</h3>
                <span className="text-xs text-gray-500">{libraryImages.length} images</span>
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
                      onClick={() => setSelectedImageId(image.id)}
                      className={`overflow-hidden rounded-lg border text-left transition ${
                        selectedImageId === image.id
                          ? "border-gray-900 shadow-sm"
                          : "border-gray-200 hover:border-gray-400"
                      }`}
                    >
                      <div className="aspect-video bg-gray-50">
                        <img
                          src={`/images/${image.id}?width=480&format=auto`}
                          alt={image.originalName}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </div>
                      <div className="space-y-1 p-2">
                        <p className="text-xs font-medium text-gray-900">{image.originalName}</p>
                        {image.caption ? (
                          <p className="text-xs text-gray-600">{image.caption}</p>
                        ) : (
                          <p className="text-xs text-gray-400">No caption</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
          <SheetFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setImageSheetIntent(null)}>
              Close
            </Button>
            <Button type="button" onClick={handleConfirmImage} disabled={!selectedImage}>
              {imageSheetIntent?.type === "replace" ? "Replace image" : "Insert image"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <CmsFloatingChrome
        collection="posts"
        currentPage={currentTitle}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-3">
            <span className="text-xs text-gray-500">
              {post.status}
              {post.hasDraftChanges && post.hasPublishedVersion ? " + draft changes" : ""}
            </span>
            {saveError ? (
              <span role="alert" className="text-xs text-red-600">
                {saveError}
              </span>
            ) : null}
            {isSaving ? <span className="text-xs text-gray-500">Saving...</span> : null}
            <Button onClick={handleSave} disabled={isSaving}>
              Save Draft
            </Button>
            <Button onClick={handlePublish} disabled={isSaving}>
              {post.hasPublishedVersion ? "Republish" : "Publish"}
            </Button>
            {post.status === "published" && post.id !== "new" ? (
              <Button variant="outline" onClick={handleUnpublish} disabled={isSaving}>
                Unpublish
              </Button>
            ) : null}
            {post.hasPublishedVersion && post.hasDraftChanges && post.id !== "new" ? (
              <Button variant="outline" onClick={handleDiscardDraft} disabled={isSaving}>
                Discard Draft
              </Button>
            ) : null}
            {post.id !== "new" && post.status !== "archived" ? (
              <Button variant="outline" onClick={handleArchive} disabled={isSaving}>
                Archive
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="flex min-h-svh bg-white pt-48 xl:pt-20">
        <div className="flex-1">
          <div className="mx-auto mt-6 w-full max-w-3xl px-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="space-y-1">
                <span className="text-xs font-medium uppercase text-gray-500">
                  Slug
                </span>
                <Input
                  value={slug}
                  onChange={(event) => setSlug(event.target.value)}
                  placeholder="post-slug"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium uppercase text-gray-500">
                  Publication date
                </span>
                <Input
                  type="datetime-local"
                  value={publicationDate}
                  onChange={(event) => setPublicationDate(event.target.value)}
                />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-md border border-gray-200 px-3 py-2">
                <span className="text-xs font-medium uppercase text-gray-500">
                  Post outline
                </span>
                <Switch checked={showOutline} onCheckedChange={setShowOutline} />
              </label>
            </div>
          </div>
          <FigureNodeViewProvider requestReplacement={requestImageReplacement}>
            <ProseMirror
              state={editorState}
              dispatchTransaction={dispatchTransaction}
              nodeViewComponents={nodeViewComponents}
              plugins={externalPlugins}
            >
              <EditorViewTracker editorViewRef={editorViewRef} />
              <FloatingToolbar />
              <SlashMenu
                openImages={() => {
                  setImageSheetIntent({ type: "insert" });
                }}
              />
              <WritingFeedbackPopover
                persistSuppression={persistWritingFeedbackSuppression}
                persistDictionaryWord={persistWritingFeedbackDictionaryWord}
              />
              <ProseMirrorDoc className={longEditorClass} spellCheck={false} />
            </ProseMirror>
          </FigureNodeViewProvider>
        </div>
      </div>
    </>
  );
};

export default PostEditor;
