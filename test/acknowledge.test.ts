import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { isAcknowledged, validateAcknowledged, classifyIncomplete } from "../src/acknowledge.ts";

const ACK = [
  {
    rule: "color-contrast",
    html: 'class="badge"',
    reason: "bgImage",
    pages: ["/"]
  }
];

describe("acknowledge", () => {
  test("an entry without html or targets is refused: it would silence a whole rule", () => {
    // The type refuses it too; the runtime check is for configs written without types.
    // @ts-expect-error neither `html` nor `targets`
    assert.throws(() => validateAcknowledged([{ rule: "color-contrast" }]), /needs a `rule`/);
    assert.doesNotThrow(() => validateAcknowledged(ACK));
  });

  test("a match needs the same rule, page, markup and reason", () => {
    const node = { html: '<span class="badge">', reason: "bgImage", target: "span" };
    assert.deepEqual(
      [
        isAcknowledged(ACK, "/", "color-contrast", node),
        isAcknowledged(ACK, "/about", "color-contrast", node),
        isAcknowledged(ACK, "/", "link-name", node),
        isAcknowledged(ACK, "/", "color-contrast", { ...node, reason: "fgAlpha" }),
        isAcknowledged(ACK, "/", "color-contrast", { ...node, html: "<span>" })
      ],
      [true, false, false, false, false]
    );
  });

  test("every node is counted before the listing is trimmed, new ones listed first", () => {
    const nodes = [
      ...Array.from({ length: 3 }, () => ({ target: "i", html: '<i class="badge">', reason: "bgImage" })),
      ...Array.from({ length: 25 }, (_, i) => ({ target: `#n${i}`, html: `<p id="n${i}">`, reason: "bgImage" }))
    ];
    const r = classifyIncomplete(ACK, "/", { incomplete: [{ id: "color-contrast", impact: null, help: "", count: nodes.length, nodes }] });
    const v = r.incomplete[0];
    assert.deepEqual(
      [r.incompleteNew, r.incompleteAcknowledged, v.nodes.length, v.unlisted, v.nodes.every((n) => !n.acknowledged)],
      [25, 3, 20, 5, true]
    );
  });
});
