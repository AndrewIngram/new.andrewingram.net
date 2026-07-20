import { describe, expect, it } from "vitest";

import {
  fromPublicationDateFields,
  toPublicationDateFields,
} from "./-publication-date";

describe("publication date fields", () => {
  it("treats a blank date as publish-time fallback", () => {
    expect(fromPublicationDateFields("", "")).toBeUndefined();
  });

  it("defaults a selected date without time to midnight", () => {
    expect(fromPublicationDateFields("2024-03-12", "")).toBe(
      new Date("2024-03-12T00:00").toISOString(),
    );
  });

  it("preserves a selected date and time", () => {
    expect(fromPublicationDateFields("2024-03-12", "14:30")).toBe(
      new Date("2024-03-12T14:30").toISOString(),
    );
  });

  it("returns blank fields when no date has been set", () => {
    expect(toPublicationDateFields()).toEqual({ date: "", time: "" });
  });
});
