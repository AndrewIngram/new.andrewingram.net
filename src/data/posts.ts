export type Post = {
  id: string;
  title: string;
  status: "draft" | "published" | "archived";
  content: Object;
};

export const ALL_POSTS: Post[] = [
  {
    id: "1",
    title: "First Post",
    status: "published",
    content: {
      type: "paragraph",
      children: [{ text: "This is the first post." }],
    },
  },
  {
    id: "2",
    title: "Second Post",
    status: "draft",
    content: {
      type: "paragraph",
      children: [{ text: "This is the second post." }],
    },
  },
  {
    id: "3",
    title: "Third Post",
    status: "archived",
    content: {
      type: "paragraph",
      children: [{ text: "This is the third post." }],
    },
  },
];
