import { useEditorEventCallback, useEditorState } from "@handlewithcare/react-prosemirror";
import { type CSSProperties, useEffect, useState } from "react";
import {
  Bold,
  Code,
  Heading2,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
} from "lucide-react";
import { Toolbar } from "@base-ui/react/toolbar";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createEditorActions, getActiveLinkHref, getEditorCommandState } from "./commands";
import { isFormattingToolbarSelection } from "./plugins";

const buttonClass =
  "text-gray-700 hover:bg-gray-100 data-[active=true]:bg-gray-900 data-[active=true]:text-white";
const toolbarButtonClass = cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), buttonClass);
const formattingToolbarAnchorStyle = {
  positionAnchor: "--formatting-toolbar",
  bottom: "anchor(top)",
  left: "anchor(center)",
  marginBottom: "8px",
  positionTryFallbacks: "flip-block",
  positionVisibility: "anchors-visible",
} as CSSProperties;

export function FloatingToolbar() {
  const state = useEditorState();
  const commandState = getEditorCommandState(state);
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState("");

  const visible = isFormattingToolbarSelection(state);

  useEffect(() => {
    setHref(getActiveLinkHref(state));
    if (!visible) setLinkOpen(false);
  }, [state, visible]);

  const run = useEditorEventCallback(
    (
      view,
      command:
        | "toggleBold"
        | "toggleItalic"
        | "toggleStrike"
        | "toggleCode"
        | "toggleHeading"
        | "toggleBulletList"
        | "toggleOrderedList"
        | "toggleBlockquote",
    ) => {
      const actions = createEditorActions(view).chain().focus();
      if (command === "toggleBold") actions.toggleBold().run();
      if (command === "toggleItalic") actions.toggleItalic().run();
      if (command === "toggleStrike") actions.toggleStrike().run();
      if (command === "toggleCode") actions.toggleCode().run();
      if (command === "toggleHeading") actions.toggleHeading({ level: 2 }).run();
      if (command === "toggleBulletList") actions.toggleBulletList().run();
      if (command === "toggleOrderedList") actions.toggleOrderedList().run();
      if (command === "toggleBlockquote") actions.toggleBlockquote().run();
    },
  );

  const applyLink = useEditorEventCallback((view, value: string) => {
    createEditorActions(view).chain().focus().setLink(value).run();
    setLinkOpen(false);
  });

  if (!visible) return null;

  return (
    <Toolbar.Root
      className="fixed z-50 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
      style={formattingToolbarAnchorStyle}
    >
      <Toolbar.Button
        type="button"
        className={toolbarButtonClass}
        data-active={commandState.active.bold}
        aria-pressed={commandState.active.bold}
        aria-label="Toggle bold"
        disabled={!commandState.can.bold}
        onClick={() => run("toggleBold")}
      >
        <Bold className="size-4" />
      </Toolbar.Button>
      <Toolbar.Button
        type="button"
        className={toolbarButtonClass}
        data-active={commandState.active.italic}
        aria-pressed={commandState.active.italic}
        aria-label="Toggle italic"
        disabled={!commandState.can.italic}
        onClick={() => run("toggleItalic")}
      >
        <Italic className="size-4" />
      </Toolbar.Button>
      <Toolbar.Button
        type="button"
        className={toolbarButtonClass}
        data-active={commandState.active.strike}
        aria-pressed={commandState.active.strike}
        aria-label="Toggle strikethrough"
        disabled={!commandState.can.strike}
        onClick={() => run("toggleStrike")}
      >
        <Strikethrough className="size-4" />
      </Toolbar.Button>
      <Toolbar.Separator className="mx-1 h-4 w-px bg-gray-200" />
      <Toolbar.Button
        type="button"
        className={toolbarButtonClass}
        data-active={commandState.active.heading2}
        aria-pressed={commandState.active.heading2}
        aria-label="Toggle heading"
        disabled={!commandState.can.heading2}
        onClick={() => run("toggleHeading")}
      >
        <Heading2 className="size-4" />
      </Toolbar.Button>
      <Toolbar.Button
        type="button"
        className={toolbarButtonClass}
        data-active={commandState.active.code}
        aria-pressed={commandState.active.code}
        aria-label="Toggle inline code"
        disabled={!commandState.can.code}
        onClick={() => run("toggleCode")}
      >
        <Code className="size-4" />
      </Toolbar.Button>
      <Toolbar.Separator className="mx-1 h-4 w-px bg-gray-200" />
      <Toolbar.Button
        type="button"
        className={toolbarButtonClass}
        data-active={commandState.active.bulletList}
        aria-pressed={commandState.active.bulletList}
        aria-label="Toggle bulleted list"
        disabled={!commandState.can.bulletList}
        onClick={() => run("toggleBulletList")}
      >
        <List className="size-4" />
      </Toolbar.Button>
      <Toolbar.Button
        type="button"
        className={toolbarButtonClass}
        data-active={commandState.active.orderedList}
        aria-pressed={commandState.active.orderedList}
        aria-label="Toggle numbered list"
        disabled={!commandState.can.orderedList}
        onClick={() => run("toggleOrderedList")}
      >
        <ListOrdered className="size-4" />
      </Toolbar.Button>
      <Toolbar.Button
        type="button"
        className={toolbarButtonClass}
        data-active={commandState.active.blockquote}
        aria-pressed={commandState.active.blockquote}
        aria-label="Toggle blockquote"
        disabled={!commandState.can.blockquote}
        onClick={() => run("toggleBlockquote")}
      >
        <Quote className="size-4" />
      </Toolbar.Button>
      <Toolbar.Separator className="mx-1 h-4 w-px bg-gray-200" />
      <div className="relative">
        <Toolbar.Button
          type="button"
          className={toolbarButtonClass}
          data-active={commandState.active.link}
          aria-pressed={commandState.active.link}
          aria-label="Edit link"
          disabled={!commandState.can.link}
          onClick={() => setLinkOpen((value) => !value)}
        >
          <LinkIcon className="size-4" />
        </Toolbar.Button>
        {linkOpen ? (
          <form
            className="absolute left-1/2 top-10 flex w-72 -translate-x-1/2 gap-2 rounded-lg border border-gray-200 bg-white p-2 shadow-lg"
            onSubmit={(event) => {
              event.preventDefault();
              applyLink(href);
            }}
          >
            <input
              type="url"
              value={href}
              onChange={(event) => setHref(event.target.value)}
              placeholder="https://example.com"
              className="h-8 min-w-0 flex-1 rounded-md border border-gray-200 px-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-gray-950"
            />
            <Button type="submit" size="sm">
              Apply
            </Button>
          </form>
        ) : null}
      </div>
    </Toolbar.Root>
  );
}
