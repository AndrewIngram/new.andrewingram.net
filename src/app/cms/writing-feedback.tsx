import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { Plus, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AppRuntime, runMutation } from "@/lib/runtime";
import {
  addWritingFeedbackDictionaryWord,
  deleteWritingFeedbackDictionaryWord,
  deleteWritingFeedbackSuppression,
  getWritingFeedbackPreferenceEntries,
  type WritingFeedbackDictionaryWordEntry,
  type WritingFeedbackPreferenceEntries,
  type WritingFeedbackSuppressionEntry,
} from "@/lib/writing-feedback-preferences";

import { CmsFloatingChrome } from "./-floating-chrome";

const getWritingFeedbackEntries = createServerFn({ method: "GET" }).handler(() =>
  AppRuntime.runPromise(getWritingFeedbackPreferenceEntries()),
);

const addGlobalDictionaryWord = createServerFn({ method: "POST" })
  .validator((word: string) => word)
  .handler(({ data: word }) =>
    runMutation(addWritingFeedbackDictionaryWord({ scope: "global", word }), {
      name: "writingFeedback.dictionaryWord.global.add",
      errorMessage: "Unable to add dictionary word.",
    }),
  );

const deleteSuppression = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(({ data: id }) =>
    runMutation(deleteWritingFeedbackSuppression(id), {
      name: "writingFeedback.suppression.delete",
      errorMessage: "Unable to delete grammar suppression.",
      context: { id },
    }),
  );

const deleteDictionaryWord = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(({ data: id }) =>
    runMutation(deleteWritingFeedbackDictionaryWord(id), {
      name: "writingFeedback.dictionaryWord.delete",
      errorMessage: "Unable to delete dictionary word.",
      context: { id },
    }),
  );

export const Route = createFileRoute("/cms/writing-feedback")({
  loader: () => getWritingFeedbackEntries({}),
  component: WritingFeedbackPreferencesPage,
});

const formatScope = (postId: string | null) => (postId ? "Post" : "Global");

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

function WritingFeedbackPreferencesPage() {
  const router = useRouter();
  const loaderEntries = Route.useLoaderData();
  const [entries, setEntries] = useState<WritingFeedbackPreferenceEntries>(loaderEntries);
  const [word, setWord] = useState("");
  const [isSaving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addWord = useServerFn(addGlobalDictionaryWord);
  const removeSuppression = useServerFn(deleteSuppression);
  const removeDictionaryWord = useServerFn(deleteDictionaryWord);

  useEffect(() => {
    setEntries(loaderEntries);
  }, [loaderEntries]);

  async function refresh() {
    await router.invalidate();
  }

  async function onAddWord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextWord = word.trim();
    if (!nextWord || isSaving) return;
    setError(null);
    setSaving(true);
    try {
      await addWord({ data: nextWord });
      setWord("");
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to add dictionary word.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSuppressionEntry(entry: WritingFeedbackSuppressionEntry) {
    setError(null);
    setEntries((current) => ({
      ...current,
      suppressions: current.suppressions.filter((item) => item.id !== entry.id),
    }));
    try {
      await removeSuppression({ data: entry.id });
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to delete grammar suppression.");
      setEntries(loaderEntries);
    }
  }

  async function deleteDictionaryEntry(entry: WritingFeedbackDictionaryWordEntry) {
    setError(null);
    setEntries((current) => ({
      ...current,
      dictionaryWords: current.dictionaryWords.filter((item) => item.id !== entry.id),
    }));
    try {
      await removeDictionaryWord({ data: entry.id });
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to delete dictionary word.");
      setEntries(loaderEntries);
    }
  }

  return (
    <>
      <CmsFloatingChrome collection="writingFeedback" />
      <div className="flex min-h-svh flex-col gap-6 px-4 pb-6 pt-24 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900">Writing feedback</h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage Harper dictionary words and ignored grammar feedback.
            </p>
          </div>
          <form
            onSubmit={onAddWord}
            className="flex w-full gap-2 sm:w-auto sm:min-w-96"
          >
            <Input
              value={word}
              onChange={(event) => setWord(event.target.value)}
              placeholder="Add global dictionary word"
              disabled={isSaving}
            />
            <Button type="submit" disabled={isSaving || !word.trim()}>
              <Plus className="size-4" />
              Add
            </Button>
          </form>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <DictionaryWordsTable
          entries={entries.dictionaryWords}
          deleteEntry={deleteDictionaryEntry}
        />
        <SuppressionsTable
          entries={entries.suppressions}
          deleteEntry={deleteSuppressionEntry}
        />
      </div>
    </>
  );
}

function DictionaryWordsTable({
  entries,
  deleteEntry,
}: {
  entries: WritingFeedbackDictionaryWordEntry[];
  deleteEntry: (entry: WritingFeedbackDictionaryWordEntry) => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Dictionary words</h2>
        <span className="text-sm text-gray-500">{entries.length} words</span>
      </div>
      <div className="overflow-hidden rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Word</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead>Post</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-12 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-gray-500">
                  No dictionary words.
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-medium">{entry.word}</TableCell>
                  <TableCell>{formatScope(entry.postId)}</TableCell>
                  <TableCell className="max-w-64 truncate text-gray-500">
                    {entry.postId ?? "-"}
                  </TableCell>
                  <TableCell>{formatDate(entry.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`Delete dictionary word ${entry.word}`}
                      onClick={() => deleteEntry(entry)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function SuppressionsTable({
  entries,
  deleteEntry,
}: {
  entries: WritingFeedbackSuppressionEntry[];
  deleteEntry: (entry: WritingFeedbackSuppressionEntry) => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Grammar suppressions</h2>
        <span className="text-sm text-gray-500">{entries.length} suppressions</span>
      </div>
      <div className="overflow-hidden rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Example</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Message</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead>Post</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-12 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-gray-500">
                  No grammar suppressions.
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="max-w-56 truncate font-medium">
                    {entry.exampleText ?? "-"}
                  </TableCell>
                  <TableCell>{entry.kind}</TableCell>
                  <TableCell className="max-w-xl whitespace-normal text-gray-700">
                    {entry.message}
                  </TableCell>
                  <TableCell>{formatScope(entry.postId)}</TableCell>
                  <TableCell className="max-w-64 truncate text-gray-500">
                    {entry.postId ?? "-"}
                  </TableCell>
                  <TableCell>{formatDate(entry.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      aria-label="Delete grammar suppression"
                      onClick={() => deleteEntry(entry)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
