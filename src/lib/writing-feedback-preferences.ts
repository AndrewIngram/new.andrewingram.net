import { Data, Effect } from "effect";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { DB, type AppDb } from "@/db/db";
import {
  writingFeedbackDictionaryWords,
  writingFeedbackSuppressions,
} from "@/db/schema";

export type WritingFeedbackPreferenceScope = "post" | "global";

export type WritingFeedbackPreferences = {
  postSuppressionKeys: string[];
  globalSuppressionKeys: string[];
  postDictionaryWords: string[];
  globalDictionaryWords: string[];
};

export type AddWritingFeedbackSuppressionInput = {
  scope: WritingFeedbackPreferenceScope;
  postId?: string | undefined;
  key: string;
  kind: string;
  message: string;
  exampleText?: string | undefined;
};

export type AddWritingFeedbackDictionaryWordInput = {
  scope: WritingFeedbackPreferenceScope;
  postId?: string | undefined;
  word: string;
};

export type WritingFeedbackSuppressionEntry = {
  id: string;
  postId: string | null;
  scope: WritingFeedbackPreferenceScope;
  keyKind: "context_hash" | "pattern";
  key: string;
  kind: string;
  message: string;
  exampleText: string | null;
  createdAt: string;
};

export type WritingFeedbackDictionaryWordEntry = {
  id: string;
  postId: string | null;
  wordKey: string;
  word: string;
  createdAt: string;
};

export type WritingFeedbackPreferenceEntries = {
  suppressions: WritingFeedbackSuppressionEntry[];
  dictionaryWords: WritingFeedbackDictionaryWordEntry[];
};

export class WritingFeedbackPreferencesLoadError extends Data.TaggedError(
  "WritingFeedbackPreferencesLoadError",
)<{
  cause: unknown;
}> {}

export class WritingFeedbackPreferencesSaveError extends Data.TaggedError(
  "WritingFeedbackPreferencesSaveError",
)<{
  cause: unknown;
}> {}

export const emptyWritingFeedbackPreferences = (): WritingFeedbackPreferences => ({
  postSuppressionKeys: [],
  globalSuppressionKeys: [],
  postDictionaryWords: [],
  globalDictionaryWords: [],
});

const toIsoString = (value: Date | null | undefined) =>
  (value ?? new Date(0)).toISOString();

const toSuppressionEntry = (
  row: typeof writingFeedbackSuppressions.$inferSelect,
): WritingFeedbackSuppressionEntry => ({
  id: row.id ?? "",
  postId: row.postId,
  scope: row.scope,
  keyKind: row.keyKind,
  key: row.key,
  kind: row.kind,
  message: row.message,
  exampleText: row.exampleText,
  createdAt: toIsoString(row.createdAt),
});

const toDictionaryWordEntry = (
  row: typeof writingFeedbackDictionaryWords.$inferSelect,
): WritingFeedbackDictionaryWordEntry => ({
  id: row.id ?? "",
  postId: row.postId,
  wordKey: row.wordKey,
  word: row.word,
  createdAt: toIsoString(row.createdAt),
});

export const normalizeDictionaryWord = (word: string) =>
  word
    .trim()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .replace(/\s+/g, " ");

export const dictionaryWordKey = (word: string) =>
  normalizeDictionaryWord(word).toLocaleLowerCase("en-GB");

const scopedPostId = (scope: WritingFeedbackPreferenceScope, postId?: string) =>
  scope === "post" ? (postId ?? null) : null;

const requirePostId = (scope: WritingFeedbackPreferenceScope, postId?: string) => {
  if (scope === "global") return Effect.succeed(undefined);
  return postId ? Effect.succeed(undefined) : Effect.fail(new Error("postId is required"));
};

const suppressionScopeWhere = (
  dbPostId: string | null,
  scope: WritingFeedbackPreferenceScope,
) =>
  scope === "global"
    ? isNull(writingFeedbackSuppressions.postId)
    : eq(writingFeedbackSuppressions.postId, dbPostId ?? "");

const dictionaryScopeWhere = (
  dbPostId: string | null,
  scope: WritingFeedbackPreferenceScope,
) =>
  scope === "global"
    ? isNull(writingFeedbackDictionaryWords.postId)
    : eq(writingFeedbackDictionaryWords.postId, dbPostId ?? "");

export const getWritingFeedbackPreferences = (postId?: string) =>
  Effect.gen(function* () {
    const db = yield* Effect.service(DB);
    const scopeWhere = postId
      ? or(
          isNull(writingFeedbackSuppressions.postId),
          eq(writingFeedbackSuppressions.postId, postId),
        )
      : isNull(writingFeedbackSuppressions.postId);
    const wordWhere = postId
      ? or(
          isNull(writingFeedbackDictionaryWords.postId),
          eq(writingFeedbackDictionaryWords.postId, postId),
        )
      : isNull(writingFeedbackDictionaryWords.postId);

    const suppressions: ReadonlyArray<typeof writingFeedbackSuppressions.$inferSelect> =
      yield* db.select().from(writingFeedbackSuppressions).where(scopeWhere);
    const dictionaryWords: ReadonlyArray<
      typeof writingFeedbackDictionaryWords.$inferSelect
    > = yield* db.select().from(writingFeedbackDictionaryWords).where(wordWhere);

    return {
      postSuppressionKeys: suppressions
        .filter((row) => row.postId != null)
        .map((row) => row.key),
      globalSuppressionKeys: suppressions
        .filter((row) => row.postId == null)
        .map((row) => row.key),
      postDictionaryWords: dictionaryWords
        .filter((row) => row.postId != null)
        .map((row) => row.word),
      globalDictionaryWords: dictionaryWords
        .filter((row) => row.postId == null)
        .map((row) => row.word),
    } satisfies WritingFeedbackPreferences;
  }).pipe(
    Effect.mapError((cause) => new WritingFeedbackPreferencesLoadError({ cause })),
  );

export const getWritingFeedbackPreferenceEntries = () =>
  Effect.gen(function* () {
    const db = yield* Effect.service(DB);
    const suppressions: ReadonlyArray<typeof writingFeedbackSuppressions.$inferSelect> =
      yield* db
        .select()
        .from(writingFeedbackSuppressions)
        .orderBy(desc(writingFeedbackSuppressions.createdAt));
    const dictionaryWords: ReadonlyArray<
      typeof writingFeedbackDictionaryWords.$inferSelect
    > = yield* db
      .select()
      .from(writingFeedbackDictionaryWords)
      .orderBy(desc(writingFeedbackDictionaryWords.createdAt));

    return {
      suppressions: suppressions.map(toSuppressionEntry),
      dictionaryWords: dictionaryWords.map(toDictionaryWordEntry),
    } satisfies WritingFeedbackPreferenceEntries;
  }).pipe(
    Effect.mapError((cause) => new WritingFeedbackPreferencesLoadError({ cause })),
  );

const existingSuppression = (
  db: AppDb,
  input: AddWritingFeedbackSuppressionInput,
  postId: string | null,
) =>
  db
    .select({ id: writingFeedbackSuppressions.id })
    .from(writingFeedbackSuppressions)
    .where(
      and(
        suppressionScopeWhere(postId, input.scope),
        eq(
          writingFeedbackSuppressions.keyKind,
          input.scope === "post" ? "context_hash" : "pattern",
        ),
        eq(writingFeedbackSuppressions.key, input.key),
      ),
    )
    .limit(1);

export const addWritingFeedbackSuppression = (
  input: AddWritingFeedbackSuppressionInput,
) =>
  Effect.gen(function* () {
    yield* requirePostId(input.scope, input.postId);
    const key = input.key.trim();
    if (!key) return { id: "" };
    const db = yield* Effect.service(DB);
    const postId = scopedPostId(input.scope, input.postId);
    const existing = yield* existingSuppression(db, { ...input, key }, postId);
    if (existing[0]) return { id: existing[0].id ?? "" };

    const id = randomUUID();
    yield* db.insert(writingFeedbackSuppressions).values([
      {
        id,
        postId,
        scope: input.scope,
        keyKind: input.scope === "post" ? "context_hash" : "pattern",
        key,
        kind: input.kind,
        message: input.message,
        exampleText: input.exampleText,
        createdAt: new Date(),
      },
    ]);
    return { id };
  }).pipe(
    Effect.mapError((cause) => new WritingFeedbackPreferencesSaveError({ cause })),
  );

const existingDictionaryWord = (
  db: AppDb,
  input: AddWritingFeedbackDictionaryWordInput,
  postId: string | null,
  wordKey: string,
) =>
  db
    .select({ id: writingFeedbackDictionaryWords.id })
    .from(writingFeedbackDictionaryWords)
    .where(
      and(
        dictionaryScopeWhere(postId, input.scope),
        eq(writingFeedbackDictionaryWords.wordKey, wordKey),
      ),
    )
    .limit(1);

export const addWritingFeedbackDictionaryWord = (
  input: AddWritingFeedbackDictionaryWordInput,
) =>
  Effect.gen(function* () {
    yield* requirePostId(input.scope, input.postId);
    const word = normalizeDictionaryWord(input.word);
    const wordKey = dictionaryWordKey(word);
    if (!word || !wordKey) return { id: "" };

    const db = yield* Effect.service(DB);
    const postId = scopedPostId(input.scope, input.postId);
    const existing = yield* existingDictionaryWord(db, input, postId, wordKey);
    if (existing[0]) return { id: existing[0].id ?? "" };

    const id = randomUUID();
    yield* db.insert(writingFeedbackDictionaryWords).values([
      {
        id,
        postId,
        wordKey,
        word,
        createdAt: new Date(),
      },
    ]);
    return { id };
  }).pipe(
    Effect.mapError((cause) => new WritingFeedbackPreferencesSaveError({ cause })),
  );

export const deleteWritingFeedbackSuppression = (id: string) =>
  Effect.gen(function* () {
    const db = yield* Effect.service(DB);
    yield* db
      .delete(writingFeedbackSuppressions)
      .where(eq(writingFeedbackSuppressions.id, id));
    return { id };
  }).pipe(
    Effect.mapError((cause) => new WritingFeedbackPreferencesSaveError({ cause })),
  );

export const deleteWritingFeedbackDictionaryWord = (id: string) =>
  Effect.gen(function* () {
    const db = yield* Effect.service(DB);
    yield* db
      .delete(writingFeedbackDictionaryWords)
      .where(eq(writingFeedbackDictionaryWords.id, id));
    return { id };
  }).pipe(
    Effect.mapError((cause) => new WritingFeedbackPreferencesSaveError({ cause })),
  );
