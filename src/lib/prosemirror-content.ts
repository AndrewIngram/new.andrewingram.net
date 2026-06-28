import {
  Schema as ProseMirrorSchema,
  type AttributeSpec,
  type DOMOutputSpec,
  type Mark,
  type MarkSpec,
  type Node as ProseMirrorNode,
  type NodeSpec,
  type ParseRule,
  type SchemaSpec,
  type TagParseRule,
} from "prosemirror-model";

export interface StandardTypedV1<Input = unknown, Output = Input> {
  readonly "~standard": StandardTypedV1.Props<Input, Output>;
}

export namespace StandardTypedV1 {
  export interface Props<Input = unknown, Output = Input> {
    readonly version: 1;
    readonly vendor: string;
    readonly types?: Types<Input, Output> | undefined;
  }

  export interface Types<Input = unknown, Output = Input> {
    readonly input: Input;
    readonly output: Output;
  }

  export type InferInput<Schema extends StandardTypedV1> = NonNullable<
    Schema["~standard"]["types"]
  >["input"];

  export type InferOutput<Schema extends StandardTypedV1> = NonNullable<
    Schema["~standard"]["types"]
  >["output"];
}

export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly "~standard": StandardSchemaV1.Props<Input, Output>;
}

export namespace StandardSchemaV1 {
  export interface Props<Input = unknown, Output = Input>
    extends StandardTypedV1.Props<Input, Output> {
    readonly validate: (
      value: unknown,
      options?: Options | undefined,
    ) => Result<Output> | Promise<Result<Output>>;
  }

  export type Result<Output> = SuccessResult<Output> | FailureResult;

  export interface SuccessResult<Output> {
    readonly value: Output;
    readonly issues?: undefined;
  }

  export interface FailureResult {
    readonly issues: ReadonlyArray<Issue>;
  }

  export interface Issue {
    readonly message: string;
    readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
  }

  export interface PathSegment {
    readonly key: PropertyKey;
  }

  export interface Options {
    readonly libraryOptions?: Record<string, unknown> | undefined;
  }

  export type InferInput<Schema extends StandardTypedV1> = StandardTypedV1.InferInput<Schema>;
  export type InferOutput<Schema extends StandardTypedV1> = StandardTypedV1.InferOutput<Schema>;
}

type ValidationResult<Output> = StandardSchemaV1.Result<Output>;
type Issue = StandardSchemaV1.Issue;

const success = <Output>(value: Output): ValidationResult<Output> => ({ value });

const failure = (message: string, path?: readonly PropertyKey[]): ValidationResult<never> => ({
  issues: [{ message, ...(path ? { path } : {}) }],
});

const standardSchema = <Output>(
  validate: (value: unknown) => ValidationResult<Output>,
): StandardSchemaV1<unknown, Output> => ({
  "~standard": {
    version: 1,
    vendor: "andrewingram.net/prosemirror-content",
    validate,
  },
});

export const string = () =>
  standardSchema<string>((value) =>
    typeof value === "string" ? success(value) : failure("Expected string"),
  );

export const number = () =>
  standardSchema<number>((value) =>
    typeof value === "number" && Number.isFinite(value)
      ? success(value)
      : failure("Expected number"),
  );

export const literal = <const Values extends readonly [string | number | boolean, ...Array<string | number | boolean>]>(
  ...values: Values
) =>
  standardSchema<Values[number]>((value) =>
    values.includes(value as Values[number])
      ? success(value as Values[number])
      : failure(`Expected ${values.map(String).join(" | ")}`),
  );

export const nullable = <Schema extends StandardSchemaV1>(schema: Schema) =>
  standardSchema<StandardSchemaV1.InferOutput<Schema> | null>((value) => {
    if (value === null) return success(null);
    return schema["~standard"].validate(value) as ValidationResult<
      StandardSchemaV1.InferOutput<Schema>
    >;
  });

export const array = <Schema extends StandardSchemaV1>(schema: Schema) =>
  standardSchema<Array<StandardSchemaV1.InferOutput<Schema>>>((value) => {
    if (!Array.isArray(value)) return failure("Expected array");

    const output: Array<StandardSchemaV1.InferOutput<Schema>> = [];
    const issues: Issue[] = [];

    value.forEach((item, index) => {
      const result = schema["~standard"].validate(item) as ValidationResult<
        StandardSchemaV1.InferOutput<Schema>
      >;
      if (result.issues) {
        issues.push(
          ...result.issues.map((issue) => ({
            ...issue,
            path: [index, ...(issue.path ?? [])],
          })),
        );
        return;
      }
      output.push(result.value);
    });

    return issues.length ? { issues } : success(output);
  });

export const custom = <Output>(
  validate: (value: unknown) => ValidationResult<Output>,
): StandardSchemaV1<unknown, Output> => standardSchema(validate);

type AttrDefinition<Schema extends StandardSchemaV1 = StandardSchemaV1> = {
  readonly schema: Schema;
  readonly default?: StandardSchemaV1.InferOutput<Schema>;
};

type AttrDefinitions = Record<string, AttrDefinition>;

type AttrOutput<Attrs> = Attrs extends AttrDefinitions
  ? { [Key in keyof Attrs & string]: StandardSchemaV1.InferOutput<Attrs[Key]["schema"]> } & Record<
      string,
      unknown
    >
  : Record<string, unknown>;

type AttrJson<Attrs> = Attrs extends AttrDefinitions
  ? keyof Attrs extends never
    ? {}
    : { attrs?: Partial<AttrOutput<Attrs>> }
  : {};

export const attr = <Schema extends StandardSchemaV1>(
  schema: Schema,
  options: { default?: StandardSchemaV1.InferOutput<Schema> } = {},
): AttrDefinition<Schema> => ({
  schema,
  ...(Object.prototype.hasOwnProperty.call(options, "default") ? { default: options.default } : {}),
});

type RefExpression<Name extends string = string> = {
  readonly kind: "ref";
  readonly name: Name;
};

type GroupExpression<Name extends string = string> = {
  readonly kind: "group";
  readonly name: Name;
};

type SeqExpression<Expressions extends readonly unknown[]> = {
  readonly kind: "seq";
  readonly expressions: Expressions;
};

type RepeatExpression<
  Kind extends "optional" | "many" | "some" = "optional" | "many" | "some",
  Expression = unknown,
> = {
  readonly kind: Kind;
  readonly expression: Expression;
};

type ContentExpression =
  | RefExpression
  | GroupExpression
  | SeqExpression<readonly unknown[]>
  | RepeatExpression<"optional" | "many" | "some", unknown>;

export const ref = <const Name extends string>(name: Name): RefExpression<Name> => ({
  kind: "ref",
  name,
});

export const group = <const Name extends string>(name: Name): GroupExpression<Name> => ({
  kind: "group",
  name,
});

export const seq = <const Expressions extends readonly ContentExpression[]>(
  ...expressions: Expressions
): SeqExpression<Expressions> => ({ kind: "seq", expressions });

export const optional = <const Expression extends ContentExpression>(
  expression: Expression,
): RepeatExpression<"optional", Expression> => ({ kind: "optional", expression });

export const many = <const Expression extends ContentExpression>(
  expression: Expression,
): RepeatExpression<"many", Expression> => ({ kind: "many", expression });

export const some = <const Expression extends ContentExpression>(
  expression: Expression,
): RepeatExpression<"some", Expression> => ({ kind: "some", expression });

type MarkPolicy =
  | { readonly kind: "marks"; readonly mode: "all" }
  | { readonly kind: "marks"; readonly mode: "none" }
  | { readonly kind: "marks"; readonly mode: "only"; readonly names: readonly string[] };

export const all = (): MarkPolicy => ({ kind: "marks", mode: "all" });
export const none = (): MarkPolicy => ({ kind: "marks", mode: "none" });
export const only = <const Names extends readonly string[]>(...names: Names) =>
  ({ kind: "marks", mode: "only", names }) satisfies MarkPolicy;

type ToDom<Attrs extends AttrDefinitions | undefined> = (
  attrs: AttrOutput<Attrs>,
  node: ProseMirrorNode,
) => unknown;

type MarkToDom<Attrs extends AttrDefinitions | undefined> = (
  attrs: AttrOutput<Attrs>,
  mark: Mark,
  inline: boolean,
) => unknown;

type NodeDefinition<Attrs extends AttrDefinitions | undefined = AttrDefinitions | undefined> = {
  readonly kind: "node";
  readonly attrs?: Attrs;
  readonly content?: ContentExpression;
  readonly marks?: MarkPolicy;
  readonly group?: string;
  readonly inline?: boolean;
  readonly atom?: boolean;
  readonly selectable?: boolean;
  readonly draggable?: boolean;
  readonly code?: boolean;
  readonly defining?: boolean;
  readonly isolating?: boolean;
  readonly toDOM?: ToDom<Attrs>;
  readonly parseDOM?: readonly TagParseRule[];
};

type TextDefinition = {
  readonly kind: "text";
  readonly group?: string;
};

type MarkDefinition<Attrs extends AttrDefinitions | undefined = AttrDefinitions | undefined> = {
  readonly kind: "mark";
  readonly attrs?: Attrs;
  readonly inclusive?: boolean;
  readonly excludes?: string;
  readonly group?: string;
  readonly spanning?: boolean;
  readonly code?: boolean;
  readonly toDOM?: MarkToDom<Attrs>;
  readonly parseDOM?: readonly ParseRule[];
};

type AnyNodeDefinition = NodeDefinition | TextDefinition;
type AnyMarkDefinition = MarkDefinition;

type ContentDefinition = {
  readonly topNode: string;
  readonly nodes: Record<string, AnyNodeDefinition>;
  readonly marks?: Record<string, AnyMarkDefinition>;
};

export const node = <const Definition extends object>(
  definition: Definition,
): Definition & { readonly kind: "node" } => ({ kind: "node", ...definition });

export const text = <const Definition extends Omit<TextDefinition, "kind"> = { group: "inline" }>(
  definition = { group: "inline" } as Definition,
): Definition & { readonly kind: "text" } => ({ kind: "text", ...definition });

export const mark = <const Definition extends object>(
  definition: Definition,
): Definition & { readonly kind: "mark" } => ({ kind: "mark", ...definition });

export const defineProseMirrorContent = <const Definition>(definition: Definition) => definition;

type DefinitionNodes<Definition> = Definition extends { readonly nodes: infer Nodes } ? Nodes : never;
type DefinitionMarks<Definition> = Definition extends { readonly marks: infer Marks } ? Marks : {};
type MarkNames<Definition> = keyof DefinitionMarks<Definition> & string;

type AllowedMarkNames<Definition, Policy> = Policy extends { mode: "none" }
  ? never
  : Policy extends { mode: "only"; names: readonly string[] }
    ? Policy["names"][number] & MarkNames<Definition>
    : MarkNames<Definition>;

type MarkJson<Definition, Name extends MarkNames<Definition>> = {
  type: Name;
} & AttrJson<DefinitionMarks<Definition>[Name] extends { attrs: infer Attrs } ? Attrs : never>;

type MarkUnion<Definition, Names extends string> = Names extends MarkNames<Definition>
  ? MarkJson<Definition, Names>
  : never;

type TextJson<Definition, Policy> = {
  type: "text";
  text?: string;
} & ([AllowedMarkNames<Definition, Policy>] extends [never]
  ? { marks?: never }
  : { marks?: Array<MarkUnion<Definition, AllowedMarkNames<Definition, Policy>>> });

type GroupNames<GroupValue> = GroupValue extends string ? GroupValue : never;

type NodeNamesInGroup<Definition, GroupName extends string> = {
  [Name in keyof DefinitionNodes<Definition> & string]: DefinitionNodes<Definition>[Name] extends {
    group: infer NodeGroup;
  }
    ? GroupName extends GroupNames<NodeGroup>
      ? Name
      : never
    : never;
}[keyof DefinitionNodes<Definition> & string];

type ContentItem<Definition, Expression, ParentMarks> = Expression extends RefExpression<infer Name>
  ? Name extends "text"
    ? TextJson<Definition, ParentMarks>
    : Name extends keyof DefinitionNodes<Definition> & string
      ? NodeJson<Definition, Name>
      : never
  : Expression extends GroupExpression<infer GroupName>
    ? NodeNamesInGroup<Definition, GroupName> extends infer Name
      ? Name extends "text"
        ? TextJson<Definition, ParentMarks>
        : Name extends keyof DefinitionNodes<Definition> & string
          ? NodeJson<Definition, Name>
          : never
      : never
    : Expression extends SeqExpression<infer Expressions>
      ? ContentItem<Definition, Expressions[number], ParentMarks>
      : Expression extends RepeatExpression<any, infer Child>
        ? ContentItem<Definition, Child, ParentMarks>
        : never;

type ContentJson<Definition, Expression, ParentMarks> = Expression extends ContentExpression
  ? { content?: Array<ContentItem<Definition, Expression, ParentMarks>> }
  : {};

type NodeJson<Definition, Name extends keyof DefinitionNodes<Definition> & string> =
  Name extends "text"
    ? TextJson<Definition, never>
    : DefinitionNodes<Definition>[Name] extends infer NodeDefinition
      ? {
          type: Name;
        } & AttrJson<NodeDefinition extends { attrs: infer Attrs } ? Attrs : never> &
          ContentJson<
            Definition,
            NodeDefinition extends { content: infer Content } ? Content : never,
            NodeDefinition extends { marks: infer Marks } ? Marks : never
          >
      : never;

type ContentMarkJson = {
  type: string;
  attrs?: Record<string, StandardJsonValue | undefined>;
};

type StandardJsonValue =
  | string
  | number
  | boolean
  | null
  | StandardJsonValue[]
  | { [key: string]: StandardJsonValue | undefined };

type ContentNodeJson<TypeName extends string = string> = {
  type: TypeName;
  attrs?: Record<string, StandardJsonValue | undefined>;
  content?: ContentNodeJson[];
  marks?: ContentMarkJson[];
  text?: string;
};

export type ContentOf<Definition> = Definition extends {
  readonly topNode: infer TopNode extends string;
}
  ? ContentNodeJson<TopNode>
  : ContentNodeJson;

export type NodeUnionOf<Definition> = Definition extends { readonly nodes: infer Nodes }
  ? ContentNodeJson<keyof Nodes & string>
  : ContentNodeJson;

const isPromise = <Value>(value: Value | Promise<Value>): value is Promise<Value> =>
  typeof (value as Promise<Value>)?.then === "function";

const validateSync = (schema: StandardSchemaV1, value: unknown) => {
  const result = schema["~standard"].validate(value);
  if (isPromise(result)) throw new Error("Async Standard Schema validation is not supported here");
  if (result.issues) {
    throw new Error(result.issues.map((issue) => issue.message).join("; "));
  }
};

const attrsToProseMirror = (attrs: AttrDefinitions | undefined) => {
  if (!attrs) return undefined;
  const spec: Record<string, AttributeSpec> = {};
  for (const [name, definition] of Object.entries(attrs)) {
    const attrSpec: AttributeSpec = {
      validate: (value) => validateSync(definition.schema, value),
    };
    if (Object.prototype.hasOwnProperty.call(definition, "default")) {
      attrSpec.default = definition.default;
    }
    spec[name] = attrSpec;
  }
  return spec;
};

const marksToString = (policy: MarkPolicy | undefined) => {
  if (!policy || policy.mode === "all") return undefined;
  if (policy.mode === "none") return "";
  return policy.names.join(" ");
};

const contentToExpression = (expression: ContentExpression): string => {
  switch (expression.kind) {
    case "ref":
    case "group":
      return expression.name;
    case "seq":
      return expression.expressions.map((child) => contentToExpression(child as ContentExpression)).join(" ");
    case "optional":
      return `${contentToExpression(expression.expression as ContentExpression)}?`;
    case "many":
      return `${contentToExpression(expression.expression as ContentExpression)}*`;
    case "some":
      return `${contentToExpression(expression.expression as ContentExpression)}+`;
  }
};

const nodeSpec = (definition: AnyNodeDefinition): NodeSpec => {
  if (definition.kind === "text") {
    const spec: NodeSpec = {};
    if (definition.group) spec.group = definition.group;
    return spec;
  }

  const spec: NodeSpec = {};
  if (definition.content) spec.content = contentToExpression(definition.content);
  if (definition.marks) {
    const marks = marksToString(definition.marks);
    if (marks !== undefined) spec.marks = marks;
  }
  if (definition.group) spec.group = definition.group;
  if (definition.inline !== undefined) spec.inline = definition.inline;
  if (definition.atom !== undefined) spec.atom = definition.atom;
  if (definition.selectable !== undefined) spec.selectable = definition.selectable;
  if (definition.draggable !== undefined) spec.draggable = definition.draggable;
  if (definition.code !== undefined) spec.code = definition.code;
  if (definition.defining !== undefined) spec.defining = definition.defining;
  if (definition.isolating !== undefined) spec.isolating = definition.isolating;
  if (definition.attrs) {
    const attrs = attrsToProseMirror(definition.attrs);
    if (attrs) spec.attrs = attrs;
  }
  if (definition.toDOM) {
    spec.toDOM = (node: ProseMirrorNode) =>
      (definition.toDOM?.(node.attrs, node) ?? ["div", 0]) as DOMOutputSpec;
  }
  if (definition.parseDOM) spec.parseDOM = definition.parseDOM;
  return spec;
};

const markSpec = (definition: AnyMarkDefinition): MarkSpec => {
  const spec: MarkSpec = {};
  if (definition.attrs) {
    const attrs = attrsToProseMirror(definition.attrs);
    if (attrs) spec.attrs = attrs;
  }
  if (definition.inclusive !== undefined) spec.inclusive = definition.inclusive;
  if (definition.excludes !== undefined) spec.excludes = definition.excludes;
  if (definition.group !== undefined) spec.group = definition.group;
  if (definition.spanning !== undefined) spec.spanning = definition.spanning;
  if (definition.code !== undefined) spec.code = definition.code;
  if (definition.toDOM) {
    spec.toDOM = (mark: Mark, inline: boolean) =>
      (definition.toDOM?.(mark.attrs, mark, inline) ?? ["span", 0]) as DOMOutputSpec;
  }
  if (definition.parseDOM) spec.parseDOM = definition.parseDOM;
  return spec;
};

export const createProseMirrorSchemaSpec = <Definition>(
  definition: Definition,
): SchemaSpec => {
  const content = definition as ContentDefinition;
  return {
    topNode: content.topNode,
    nodes: Object.fromEntries(
      Object.entries(content.nodes).map(([name, definition]) => [name, nodeSpec(definition)]),
    ),
    marks: Object.fromEntries(
      Object.entries(content.marks ?? {}).map(([name, definition]) => [name, markSpec(definition)]),
    ),
  };
};

export const createProseMirrorSchema = <Definition>(definition: Definition) =>
  new ProseMirrorSchema(createProseMirrorSchemaSpec(definition));

export const createStandardSchema = <Definition>(
  definition: Definition,
): StandardSchemaV1<unknown, ContentOf<Definition>> => {
  const schema = createProseMirrorSchema(definition);

  return standardSchema<ContentOf<Definition>>((value) => {
    try {
      const node = schema.nodeFromJSON(value);
      node.check();
      return success(node.toJSON() as ContentOf<Definition>);
    } catch (error) {
      return failure(error instanceof Error ? error.message : "Invalid ProseMirror content");
    }
  });
};
