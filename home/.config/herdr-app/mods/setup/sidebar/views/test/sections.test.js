import { test } from "node:test";
import assert from "node:assert/strict";
import { byMachine } from "../sections.js";

const row = (machine, id) => ({ w: { machine, id } });

test("local spaces come first, then other machines by name", () => {
  const rows = [row("zeta", 1), row(null, 2), row("alpha", 3), row(null, 4)];
  assert.deepEqual(
    byMachine(rows).map((r) => r.w.id),
    [2, 4, 3, 1],
  );
});

test("a machine's spaces keep their order", () => {
  const rows = [row("fedora", 1), row(null, 2), row("fedora", 3)];
  assert.deepEqual(
    byMachine(rows).map((r) => r.w.id),
    [2, 1, 3],
  );
});
