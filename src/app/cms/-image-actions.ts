import { createServerFn } from "@tanstack/react-start";

import { AppRuntime } from "@/lib/runtime";
import { saveImageUpload } from "@/lib/images";

export const uploadImageAction = createServerFn({ method: "POST" })
  .inputValidator((formData: FormData) => formData)
  .handler(async ({ data: formData }) => {
    const file = formData.get("file");
    const caption = formData.get("caption");

    if (!(file instanceof File)) {
      throw new Error("Missing image file.");
    }

    if (!file.type.startsWith("image/")) {
      throw new Error("Only image uploads are supported.");
    }

    const data = new Uint8Array(await file.arrayBuffer());
    return AppRuntime.runPromise(
      saveImageUpload({
        originalName: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        data,
        ...(typeof caption === "string" ? { caption } : {}),
      }),
    );
  });
