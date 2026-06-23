export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue | undefined };

export type JSONContent = {
  type?: string;
  attrs?: Record<string, JSONValue | undefined>;
  content?: JSONContent[];
  marks?: Array<{
    type: string;
    attrs?: Record<string, JSONValue | undefined>;
  }>;
  text?: string;
};
