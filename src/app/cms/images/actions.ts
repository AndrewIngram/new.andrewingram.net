"use server";

import { revalidatePath } from "next/cache";

import { AppRuntime } from "@/lib/runtime";
import { saveImageUpload } from "@/lib/images";

export async function uploadImageAction(formData: FormData) {
  const file = formData.get("file");
  const caption = formData.get("caption");

  if (!(file instanceof File)) {
    throw new Error("Missing image file.");
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("Only image uploads are supported.");
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const image = await AppRuntime.runPromise(
    saveImageUpload({
      originalName: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      data,
      caption: typeof caption === "string" ? caption : undefined,
    })
  );

  revalidatePath("/cms/images");
  return image;
}
