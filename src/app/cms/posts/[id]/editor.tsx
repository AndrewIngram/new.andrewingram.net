"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { FloatingMenu, BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";

const Tiptap = () => {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit], // define your extension array
    content: "<p>Hello World!</p>", // initial content
  });

  return (
    <>
      <EditorContent
        editor={editor}
        className="bg-white rounded-md max-w-3xl w-full h-full mx-auto [&_.tiptap]:p-12 [&_.tiptap]:h-full [&_.tiptap]:mx-auto [&_.tiptap]:outline-none [&_.tiptap]:prose [&_.tiptap]:lg:prose-md"
      />
      <FloatingMenu editor={editor}>This is the floating menu</FloatingMenu>
      <BubbleMenu editor={editor ?? undefined}>
        This is the bubble menu
      </BubbleMenu>
    </>
  );
};

export default Tiptap;
