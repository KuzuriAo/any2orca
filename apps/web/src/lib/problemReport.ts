// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The problem report the page offers to copy: the library's own text, with the page as the app. Nothing is sent
 * anywhere; the text goes to the clipboard when the user asks, and holds no file name, object names or paths.
 */
import { describeEnvironment, problemReport, type ConvertReport, type Inspection, type ProblemReportOptions, type ProfileCatalog } from "any2orca";

export const WEB_APP_NAME = "any2orca web app";

/**
 * What the report keeps of an error from the converter's worker: that it is one of the library's own, with its
 * code, or else its kind. The message stays out: it can quote the file.
 */
export function errorForReport(err: unknown): { name: string; code?: string } {
  const e = (typeof err === "object" && err !== null ? err : {}) as { name?: unknown; code?: unknown };
  if (typeof e.code === "string") return { name: "Any2orcaError", code: e.code };
  return { name: typeof e.name === "string" ? e.name : "" };
}

export function webProblemReport(input: {
  inspection?: Inspection | null;
  report?: ConvertReport;
  error?: unknown;
  stage?: string;
  options?: ProblemReportOptions;
  catalog?: ProfileCatalog | null;
}): string {
  return problemReport({
    app: WEB_APP_NAME,
    environment: describeEnvironment(),
    ...(input.inspection ? { inspection: input.inspection } : {}),
    ...(input.report ? { report: input.report } : {}),
    ...(input.error !== undefined ? { error: errorForReport(input.error) } : {}),
    ...(input.stage !== undefined ? { stage: input.stage } : {}),
    ...(input.options ? { options: input.options } : {}),
    ...(input.catalog ? { catalog: input.catalog } : {}),
  });
}
