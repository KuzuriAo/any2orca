// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { AGENT_PROMPT_TEXT } from "./agent-prompt.js";

describe("agentPromptText in PartnerIntegrationSelector", () => {
  it("matches the code block under 'Let your AI coding agent choose' in docs/integration-guide.md word for word", () => {
    const guidePath = path.resolve(import.meta.dirname, "../../../../docs/integration-guide.md");
    const guideContent = fs.readFileSync(guidePath, "utf8");

    const match = guideContent.match(/## Let your AI coding agent choose[\s\S]*?```text\r?\n([\s\S]*?)\r?\n```/);
    assert.ok(match, "Found code block under 'Let your AI coding agent choose'");
    const expectedPrompt = match[1];

    assert.equal(AGENT_PROMPT_TEXT, expectedPrompt);
  });
});
