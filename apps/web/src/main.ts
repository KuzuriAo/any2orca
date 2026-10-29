// SPDX-License-Identifier: AGPL-3.0-or-later
import "./lib/zod-config"

import { mount } from "svelte"
import "./app.css"
import App from "./App.svelte"
import { getInitialBrand, applyBrand } from "./lib/brand"
import { getInitialTheme, applyTheme } from "./lib/theme"

// Bootstrap brand and theme attributes on root element
applyBrand(getInitialBrand())
applyTheme(getInitialTheme())

const target = document.getElementById("app")!
// index.html ships a static <h1> fallback inside #app for crawlers that
// don't execute JS -- clear it before mounting so it never renders
// alongside (or is duplicated by) the real app for actual browsers.
target.innerHTML = ""

const app = mount(App, {
  target,
})

export default app
