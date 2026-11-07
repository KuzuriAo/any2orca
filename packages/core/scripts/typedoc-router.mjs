// SPDX-License-Identifier: MIT
// TypeDoc's usual page layout, with function pages in function/ instead of functions/: Cloudflare Pages
// reserves a top-level functions/ folder for server code, so its upload tool leaves that folder out.
import { KindRouter, ReflectionKind } from "typedoc";

export function load(app) {
  app.renderer.defineRouter(
    "any2orca",
    class extends KindRouter {
      directories = new Map([...this.directories, [ReflectionKind.Function, "function"]]);
    },
  );
}
