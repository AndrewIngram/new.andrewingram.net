import type { CSSProperties } from "react";
import type { PostOutlineItem } from "@/lib/post-outline";

export function PostOutline({
  items,
  showOutline,
}: {
  items: PostOutlineItem[];
  showOutline: boolean;
}) {
  if (!showOutline || items.length === 0) return null;

  return (
    <nav className="post-outline" aria-label="Post outline">
      <h2>Post outline</h2>
      <ol>
        {items.map((item) => (
          <li
            key={item.id}
            style={{ "--outline-depth": Math.max(0, item.level - 1) } as CSSProperties}
          >
            <a href={`#${item.id}`}>{item.text}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
