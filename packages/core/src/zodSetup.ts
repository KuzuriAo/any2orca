// SPDX-License-Identifier: MIT
/**
 * Turns off zod's compiled parsers before any schema exists. zod builds them
 * with the Function constructor, and checks first whether it may by calling
 * it once. A strict content security policy, like a browser extension's or a
 * site's without 'unsafe-eval', refuses that call: zod catches the error and
 * parses the plain way, but the browser still reports a policy violation each
 * time a page or worker loads the library. Parsing gives the same result
 * either way. zod reads the setting when a schema is created, so every module
 * that defines one imports this first.
 *
 * The setting is zod's own, shared by every copy of zod in the same page or
 * worker. A caller that sets `jitless` itself before importing any2orca keeps
 * its choice.
 */
import { z } from "zod";

if (z.config().jitless === undefined) z.config({ jitless: true });
