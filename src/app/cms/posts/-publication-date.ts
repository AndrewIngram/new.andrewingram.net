export type PublicationDateFields = {
  date: string;
  time: string;
};

const toDateTimeLocalValue = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);

export const toPublicationDateFields = (
  value?: string,
): PublicationDateFields => {
  if (!value) return { date: "", time: "" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "", time: "" };
  const [localDate = "", localTime = ""] = toDateTimeLocalValue(date).split("T");
  return { date: localDate, time: localTime };
};

export const fromPublicationDateFields = (
  date: string,
  time: string,
): string | undefined => {
  const trimmedDate = date.trim();
  if (!trimmedDate) return undefined;
  const trimmedTime = time.trim() || "00:00";
  const value = new Date(`${trimmedDate}T${trimmedTime}`);
  return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
};
