// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isHighFlowSupported } from "./api";

describe("isHighFlowSupported", () => {
  it("returns true for standard 0.4mm nozzle", () => {
    assert.equal(isHighFlowSupported("0.4"), true);
    assert.equal(isHighFlowSupported(" 0.4 "), true);
  });

  it("defaults to 0.4mm nozzle when undefined or empty", () => {
    assert.equal(isHighFlowSupported(), true);
    assert.equal(isHighFlowSupported(null), true);
    assert.equal(isHighFlowSupported(""), true);
  });

  it("returns false for non-0.4mm nozzles that lack high-flow profiles", () => {
    assert.equal(isHighFlowSupported("0.2"), false);
    assert.equal(isHighFlowSupported("0.6"), false);
    assert.equal(isHighFlowSupported("0.8"), false);
  });
});
