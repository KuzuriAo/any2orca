// SPDX-License-Identifier: MIT
import type { Plugin } from "vite";

/**
 * Store linters that read an extension's code (Firefox's `web-ext lint`) report one DANGEROUS_EVAL warning in a
 * bundle with any2orca: zod, which any2orca uses to check its input, calls the Function constructor once to see
 * whether it may compile faster parsers. any2orca turns that off before it creates any schema, so the call never
 * runs; this replaces it with that answer, so the shipped code matches what runs and the warning goes away.
 *
 * Add it to both `plugins` and `worker.plugins`: the converter runs in a worker, which Vite builds separately. If
 * zod's code changes so the check no longer matches, the build stops with an error instead of shipping it.
 */
export function withoutZodEvalProbe(): Plugin {
  const probe = /try \{\s*const F = Function;\s*new F\(""\);\s*return true;\s*\}\s*catch \(_\) \{\s*return false;\s*\}/;
  return {
    name: "without-zod-eval-probe",
    transform(code, id) {
      if (!/[\\/]node_modules[\\/]zod[\\/]v4[\\/]core[\\/]util\.js$/.test(id)) return null;
      if (!probe.test(code)) throw new Error("withoutZodEvalProbe: zod's eval check has changed; update the pattern in withoutZodEvalProbe.ts");
      return { code: code.replace(probe, "return false;"), map: null };
    },
  };
}
