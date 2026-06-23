import {
  useEditorEventCallback,
  useEditorEventListener,
  useEditorState,
} from "@handlewithcare/react-prosemirror";
import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Code2, Heading2, Heading3, Image as ImageIcon } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { createEditorActions } from "./commands";
import { dismissSlashCommand, slashCommandPluginKey } from "./plugins";

type SlashCommand = {
  id: string;
  title: string;
  description: string;
  icon: typeof ImageIcon;
  run: () => void;
};

const slashMenuAnchorStyle = {
  positionAnchor: "--slash-command",
  top: "calc(anchor(bottom) + 8px)",
  left: "anchor(left)",
  positionTryFallbacks: "flip-block",
} as CSSProperties;

export function SlashMenu({ openImages }: { openImages: () => void }) {
  const editorState = useEditorState();
  const slashState = slashCommandPluginKey.getState(editorState);
  const activeRange = slashState?.active ?? null;
  const [slashIndex, setSlashIndex] = useState(0);
  const activeRangeRef = useRef(activeRange);
  const slashIndexRef = useRef(slashIndex);
  const commandsRef = useRef<SlashCommand[]>([]);

  const runCommand = useEditorEventCallback((view, command: SlashCommand) => {
    const range = activeRangeRef.current;
    if (!range) return;
    createEditorActions(view).chain().focus().deleteRange(range).run();
    command.run();
  });

  const runEditorCommand = useEditorEventCallback(
    (view, command: "heading-2" | "heading-3" | "code-block") => {
      const chain = createEditorActions(view).chain().focus();
      if (command === "heading-2") chain.toggleHeading({ level: 2 }).run();
      if (command === "heading-3") chain.toggleHeading({ level: 3 }).run();
      if (command === "code-block") chain.toggleCodeBlock().run();
    },
  );

  const slashCommands = useMemo(
    (): SlashCommand[] => [
      {
        id: "image",
        title: "Image",
        description: "Embed an image from the library",
        icon: ImageIcon,
        run: openImages,
      },
      {
        id: "heading-2",
        title: "Heading 2",
        description: "Large section heading",
        icon: Heading2,
        run: () => runEditorCommand("heading-2"),
      },
      {
        id: "heading-3",
        title: "Heading 3",
        description: "Subsection heading",
        icon: Heading3,
        run: () => runEditorCommand("heading-3"),
      },
      {
        id: "code-block",
        title: "Code block",
        description: "Insert a code block",
        icon: Code2,
        run: () => runEditorCommand("code-block"),
      },
    ],
    [openImages, runEditorCommand],
  );

  const filteredCommands = useMemo(() => {
    const query = activeRange?.query.trim().toLowerCase() ?? "";
    if (!query) return slashCommands;
    return slashCommands.filter((command) =>
      `${command.title} ${command.description}`.toLowerCase().includes(query),
    );
  }, [slashCommands, activeRange?.query]);

  useEditorEventListener("keydown", (view, event) => {
    if (!activeRangeRef.current) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const commands = commandsRef.current;
      if (commands.length === 0) return;
      setSlashIndex((value) => (value + 1) % commands.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      const commands = commandsRef.current;
      if (commands.length === 0) return;
      setSlashIndex((value) => (value - 1 + commands.length) % commands.length);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const commands = commandsRef.current;
      const command = commands[slashIndexRef.current];
      if (command) runCommand(command);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      const transaction = dismissSlashCommand(view.state);
      if (transaction) view.dispatch(transaction);
    }
  });

  useEffect(() => {
    setSlashIndex(0);
  }, [activeRange?.query]);

  useEffect(() => {
    activeRangeRef.current = activeRange;
  }, [activeRange]);

  useEffect(() => {
    slashIndexRef.current = slashIndex;
  }, [slashIndex]);

  useEffect(() => {
    commandsRef.current = filteredCommands;
  }, [filteredCommands]);

  if (!activeRange) return null;

  console.log(slashIndex, filteredCommands);

  return (
    <div
      className="fixed z-50 w-72 rounded-xl border border-gray-200 bg-white p-2 shadow-lg"
      style={slashMenuAnchorStyle}
    >
      <Command
        value={filteredCommands[slashIndex]?.id ?? ""}
        onValueChange={(value) => {
          const index = filteredCommands.findIndex(
            (command) => command.id === value,
          );
          if (index >= 0) setSlashIndex(index);
        }}
        shouldFilter={false}
        loop
      >
        <CommandList className="max-h-64">
          <CommandEmpty>No matches.</CommandEmpty>
          {filteredCommands.map((command, index) => {
            const Icon = command.icon;
            return (
              <CommandItem
                key={command.id}
                value={command.id}
                onSelect={() => runCommand(command)}
              >
                <Icon className="mt-0.5 size-4" />
                <span>
                  <span className="block text-sm font-medium">
                    {command.title}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {command.description}
                  </span>
                </span>
              </CommandItem>
            );
          })}
        </CommandList>
      </Command>
    </div>
  );
}
