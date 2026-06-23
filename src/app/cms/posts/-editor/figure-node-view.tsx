import {
  useEditorEventCallback,
  useEditorState,
  useIsNodeSelected,
  useNodePos,
  type NodeViewComponentProps,
} from "@handlewithcare/react-prosemirror";
import { NodeSelection } from "prosemirror-state";
import { createContext, useContext, type MouseEvent, type ReactNode } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CodeBlockNodeView } from "./code-block-node-view";

export type FigureReplacementRequest = {
  figurePos: number;
  currentSrc: string;
};

const FigureReplacementContext = createContext<
  ((request: FigureReplacementRequest) => void) | null
>(null);

export function FigureNodeViewProvider({
  children,
  requestReplacement,
}: {
  children: ReactNode;
  requestReplacement: (request: FigureReplacementRequest) => void;
}) {
  return (
    <FigureReplacementContext.Provider value={requestReplacement}>
      {children}
    </FigureReplacementContext.Provider>
  );
}

export function FigureNodeView({
  children,
  nodeProps,
  ref,
  className,
  ...props
}: NodeViewComponentProps) {
  const state = useEditorState();
  const nodePos = useNodePos();
  const selected = useIsNodeSelected();
  const requestReplacement = useContext(FigureReplacementContext);
  const captionActive =
    state.selection.$from.parent.type.name === "figcaption" &&
    state.selection.$to.parent === state.selection.$from.parent &&
    state.selection.from > nodePos &&
    state.selection.to < nodePos + nodeProps.node.nodeSize;
  const active = selected || captionActive;

  const selectFigure = useEditorEventCallback((view, event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("figcaption") || target.closest("[data-figure-toolbar]")) return;

    const pos = nodeProps.getPos();
    const node = view.state.doc.nodeAt(pos);
    if (node?.type.name !== "figure") return;

    event.preventDefault();
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
    view.focus();
  });

  const deleteFigure = useEditorEventCallback((view) => {
    const pos = nodeProps.getPos();
    view.dispatch(view.state.tr.delete(pos, pos + nodeProps.node.nodeSize).scrollIntoView());
    view.focus();
  });

  const replaceImage = useEditorEventCallback((_view) => {
    requestReplacement?.({
      figurePos: nodeProps.getPos(),
      currentSrc: String(nodeProps.node.firstChild?.attrs.src ?? ""),
    });
  });

  return (
    <figure
      {...props}
      ref={ref}
      className={cn("group relative", active && "ring-2 ring-gray-900 ring-offset-2", className)}
      data-selected={active}
      onMouseDown={selectFigure}
    >
      {active ? (
        <div
          className="absolute right-2 top-2 z-10 flex gap-1 rounded-md border border-gray-200 bg-white p-1 shadow-lg"
          contentEditable={false}
          data-figure-toolbar
        >
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Replace image"
            onMouseDown={(event) => event.preventDefault()}
            onClick={replaceImage}
          >
            <RefreshCw className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Delete figure"
            onMouseDown={(event) => event.preventDefault()}
            onClick={deleteFigure}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ) : null}
      <div ref={nodeProps.contentDOMRef}>{children}</div>
    </figure>
  );
}

export const nodeViewComponents = {
  codeBlock: CodeBlockNodeView,
  figure: FigureNodeView,
};
