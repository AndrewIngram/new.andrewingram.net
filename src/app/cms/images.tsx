import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppRuntime } from "@/lib/runtime";
import { getAllImages } from "@/lib/images";

import { CmsFloatingChrome } from "./-floating-chrome";
import { uploadImageAction } from "./-image-actions";

const getImages = createServerFn({ method: "GET" }).handler(() =>
  AppRuntime.runPromise(getAllImages()),
);

export const Route = createFileRoute("/cms/images")({
  loader: () => getImages({}),
  component: ImagesPage,
});

function ImagesPage() {
  const router = useRouter();
  const loaderImages = Route.useLoaderData();
  const [images, setImages] = useState(loaderImages);
  const [isUploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const uploadImage = useServerFn(uploadImageAction);

  async function onUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isUploading) return;
    const form = event.currentTarget;
    setUploadError(null);
    setUploading(true);
    try {
      const image = await uploadImage({ data: new FormData(form) });
      setImages((prev) => [image, ...prev.filter((item) => item.id !== image.id)]);
      form.reset();
      await router.invalidate();
    } catch (error) {
      setUploadError(
        error instanceof Error && error.message ? error.message : "Unable to upload image.",
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <CmsFloatingChrome collection="images" />
      <div className="flex min-h-svh flex-col gap-6 px-6 pb-6 pt-24">
        <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Upload image</h2>
          <p className="mt-1 text-sm text-gray-500">
            Add an image and an optional caption for the library.
          </p>
          <form onSubmit={onUpload} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="text-xs font-medium uppercase tracking-wide text-gray-500">
                File
              </label>
              <Input name="file" type="file" accept="image/*" required disabled={isUploading} />
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Caption (optional)
              </label>
              <Input name="caption" type="text" placeholder="Photo by..." disabled={isUploading} />
            </div>
            <Button type="submit" disabled={isUploading}>
              {isUploading ? "Uploading..." : "Upload"}
            </Button>
          </form>
          {uploadError ? (
            <p role="alert" className="mt-3 text-sm text-red-600">
              {uploadError}
            </p>
          ) : null}
        </section>

        <section>
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-semibold text-gray-900">Image library</h1>
            <span className="text-sm text-gray-500">{images.length} images</span>
          </div>
          {images.length === 0 ? (
            <div className="mt-6 rounded-lg border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
              No images yet. Upload one to get started.
            </div>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {images.map((image) => (
                <div
                  key={image.id}
                  className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
                >
                  <div className="aspect-video bg-gray-50">
                    <img
                      src={`/images/${image.id}?width=480&format=auto`}
                      alt={image.originalName}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="space-y-1 p-3">
                    <p className="text-sm font-medium text-gray-900">{image.originalName}</p>
                    {image.caption ? (
                      <p className="text-sm text-gray-600">{image.caption}</p>
                    ) : (
                      <p className="text-xs text-gray-400">No caption</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
