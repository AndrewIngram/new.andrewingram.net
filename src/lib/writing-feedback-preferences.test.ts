import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DB } from "@/db/db";

const createMocks = () => {
  const limit = vi.fn((): Effect.Effect<unknown[], never, never> => Effect.succeed([]));
  const orderBy = vi.fn((): Effect.Effect<unknown[], never, never> =>
    Effect.succeed([]),
  );
  const query = (effect: Effect.Effect<unknown[], never, never> = Effect.succeed([])) =>
    Object.assign(effect, { limit, orderBy });
  const where = vi.fn(() => query());
  const from = vi.fn(() => ({ orderBy, where }));
  const select = vi.fn(() => ({ from }));
  const values = vi.fn((): Effect.Effect<void, never, never> => Effect.succeed(undefined));
  const insert = vi.fn(() => ({ values }));
  const deleteWhere = vi.fn((): Effect.Effect<void, never, never> =>
    Effect.succeed(undefined),
  );
  const deleteFrom = vi.fn(() => ({ where: deleteWhere }));

  return {
    db: { select, insert, delete: deleteFrom },
    deleteWhere,
    from,
    query,
    where,
    limit,
    orderBy,
    values,
  };
};

const mocks = createMocks();

import {
  addWritingFeedbackDictionaryWord,
  addWritingFeedbackSuppression,
  deleteWritingFeedbackDictionaryWord,
  deleteWritingFeedbackSuppression,
  dictionaryWordKey,
  getWritingFeedbackPreferenceEntries,
  getWritingFeedbackPreferences,
  normalizeDictionaryWord,
} from "./writing-feedback-preferences";

const provideDb = <A, E>(effect: Effect.Effect<A, E, DB>) =>
  effect.pipe(Effect.provideService(DB, mocks.db as never));

const resetMocks = () => {
  vi.clearAllMocks();
  mocks.where.mockReset();
  mocks.limit.mockReset();
  mocks.orderBy.mockReset();
  mocks.values.mockReset();
  mocks.deleteWhere.mockReset();
  mocks.where.mockReturnValue(mocks.query());
  mocks.limit.mockReturnValue(Effect.succeed([]));
  mocks.orderBy.mockReturnValue(Effect.succeed([]));
  mocks.values.mockReturnValue(Effect.succeed(undefined));
  mocks.deleteWhere.mockReturnValue(Effect.succeed(undefined));
};

describe("writing feedback preferences", () => {
  beforeEach(resetMocks);

  it("normalizes dictionary words", () => {
    expect(normalizeDictionaryWord(" “ProseMirror” ")).toBe("ProseMirror");
    expect(dictionaryWordKey(" “ProseMirror” ")).toBe("prosemirror");
  });

  it("loads global and post-scoped preferences", async () => {
    mocks.where
      .mockReturnValueOnce(
        mocks.query(
          Effect.succeed([
            { postId: null, key: "global-pattern" },
            { postId: "post-1", key: "post-context" },
          ]),
        ),
      )
      .mockReturnValueOnce(
        mocks.query(
          Effect.succeed([
            { postId: null, word: "ProseMirror" },
            { postId: "post-1", word: "Tupl" },
          ]),
        ),
      );

    const preferences = await Effect.runPromise(
      provideDb(getWritingFeedbackPreferences("post-1")),
    );

    expect(preferences).toEqual({
      globalSuppressionKeys: ["global-pattern"],
      postSuppressionKeys: ["post-context"],
      globalDictionaryWords: ["ProseMirror"],
      postDictionaryWords: ["Tupl"],
    });
  });

  it("lists suppressions and dictionary words for management screens", async () => {
    mocks.orderBy
      .mockReturnValueOnce(
        Effect.succeed([
          {
            id: "wfs-1",
            postId: null,
            scope: "global",
            keyKind: "pattern",
            key: "pattern",
            kind: "Usage",
            message: "Message",
            exampleText: "more complete",
            createdAt: new Date("2026-07-05T18:11:00.000Z"),
          },
        ]),
      )
      .mockReturnValueOnce(
        Effect.succeed([
          {
            id: "wfd-1",
            postId: null,
            wordKey: "prosemirror",
            word: "ProseMirror",
            createdAt: new Date("2026-07-05T18:12:00.000Z"),
          },
        ]),
      );

    const entries = await Effect.runPromise(
      provideDb(getWritingFeedbackPreferenceEntries()),
    );

    expect(entries.suppressions[0]).toEqual(
      expect.objectContaining({
        id: "wfs-1",
        exampleText: "more complete",
        createdAt: "2026-07-05T18:11:00.000Z",
      }),
    );
    expect(entries.dictionaryWords[0]).toEqual(
      expect.objectContaining({
        id: "wfd-1",
        word: "ProseMirror",
        createdAt: "2026-07-05T18:12:00.000Z",
      }),
    );
  });

  it("persists suppressions idempotently", async () => {
    await Effect.runPromise(
      provideDb(
        addWritingFeedbackSuppression({
          scope: "global",
          key: "pattern",
          kind: "Usage",
          message: "Message",
          exampleText: "more complete",
        }),
      ),
    );

    expect(mocks.values).toHaveBeenCalledWith([
      expect.objectContaining({
        postId: null,
        scope: "global",
        keyKind: "pattern",
        key: "pattern",
      }),
    ]);

    resetMocks();
    mocks.limit.mockReturnValueOnce(Effect.succeed([{ id: "existing" }]));
    await Effect.runPromise(
      provideDb(
        addWritingFeedbackSuppression({
          scope: "global",
          key: "pattern",
          kind: "Usage",
          message: "Message",
        }),
      ),
    );

    expect(mocks.values).not.toHaveBeenCalled();
  });

  it("ignores blank suppression keys", async () => {
    await Effect.runPromise(
      provideDb(
        addWritingFeedbackSuppression({
          scope: "global",
          key: " ",
          kind: "Usage",
          message: "Message",
        }),
      ),
    );

    expect(mocks.values).not.toHaveBeenCalled();
  });

  it("persists dictionary words idempotently", async () => {
    await Effect.runPromise(
      provideDb(
        addWritingFeedbackDictionaryWord({
          scope: "post",
          postId: "post-1",
          word: " ProseMirror ",
        }),
      ),
    );

    expect(mocks.values).toHaveBeenCalledWith([
      expect.objectContaining({
        postId: "post-1",
        wordKey: "prosemirror",
        word: "ProseMirror",
      }),
    ]);

    resetMocks();
    mocks.limit.mockReturnValueOnce(Effect.succeed([{ id: "existing" }]));
    await Effect.runPromise(
      provideDb(
        addWritingFeedbackDictionaryWord({
          scope: "post",
          postId: "post-1",
          word: "ProseMirror",
        }),
      ),
    );

    expect(mocks.values).not.toHaveBeenCalled();
  });

  it("deletes suppressions and dictionary words", async () => {
    await Effect.runPromise(provideDb(deleteWritingFeedbackSuppression("wfs-1")));
    await Effect.runPromise(provideDb(deleteWritingFeedbackDictionaryWord("wfd-1")));

    expect(mocks.deleteWhere).toHaveBeenCalledTimes(2);
  });
});
