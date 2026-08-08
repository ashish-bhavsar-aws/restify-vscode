import { describe, it, expect } from "vitest";
import {
  queryJsonPath,
  buildJsonLayout,
  queryJsonPathInText,
} from "../../src/core/jsonPath";

const doc = {
  store: {
    book: [
      { title: "A", price: 8.95, category: "fiction" },
      { title: "B", price: 12.99, category: "reference" },
      { title: "C", price: 8.99, category: "fiction" },
    ],
    bicycle: { color: "red", price: 19.95 },
  },
  expensive: 10,
};

function paths(result: ReturnType<typeof queryJsonPath>) {
  expect(result.ok).toBe(true);
  return result.ok ? result.matches.map((m) => m.path) : [];
}

describe("queryJsonPath", () => {
  it("returns the root for $", () => {
    const res = queryJsonPath(doc, "$");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.matches).toEqual([{ path: "$", value: doc }]);
    }
  });

  it("selects a child property", () => {
    expect(paths(queryJsonPath(doc, "$.expensive"))).toEqual(["$.expensive"]);
    expect(paths(queryJsonPath(doc, "$.store.bicycle.color"))).toEqual(["$.store.bicycle.color"]);
  });

  it("supports bracket string keys", () => {
    expect(paths(queryJsonPath(doc, "$['store']['bicycle']"))).toEqual(["$.store.bicycle"]);
  });

  it("selects array elements by index", () => {
    expect(paths(queryJsonPath(doc, "$.store.book[0]"))).toEqual(["$.store.book[0]"]);
    expect(paths(queryJsonPath(doc, "$.store.book[1].title"))).toEqual(["$.store.book[1].title"]);
  });

  it("rejects out-of-range and invalid indexes", () => {
    expect(paths(queryJsonPath(doc, "$.store.book[99]"))).toEqual([]);
    const bad = queryJsonPath(doc, "$.store.book[-1]");
    expect(bad.ok).toBe(false);
  });

  it("selects all elements with a wildcard", () => {
    expect(paths(queryJsonPath(doc, "$.store.book[*].title"))).toEqual([
      "$.store.book[0].title",
      "$.store.book[1].title",
      "$.store.book[2].title",
    ]);
    expect(paths(queryJsonPath(doc, "$.store.*"))).toEqual([
      "$.store.book",
      "$.store.bicycle",
    ]);
  });

  it("collects matches recursively with ..", () => {
    expect(paths(queryJsonPath(doc, "$..price"))).toEqual([
      "$.store.book[0].price",
      "$.store.book[1].price",
      "$.store.book[2].price",
      "$.store.bicycle.price",
    ]);
  });

  it("filters array elements", () => {
    expect(paths(queryJsonPath(doc, "$.store.book[?(@.category == 'fiction')]"))).toEqual([
      "$.store.book[0]",
      "$.store.book[2]",
    ]);
    expect(paths(queryJsonPath(doc, "$.store.book[?(@.price > 9)]"))).toEqual([
      "$.store.book[1]",
    ]);
    expect(paths(queryJsonPath(doc, "$.store.book[?(@.category)]"))).toEqual([
      "$.store.book[0]",
      "$.store.book[1]",
      "$.store.book[2]",
    ]);
  });

  it("rejects malformed expressions", () => {
    expect(queryJsonPath(doc, "store.book").ok).toBe(false);
    expect(queryJsonPath(doc, "$.store[").ok).toBe(false);
    expect(queryJsonPath(doc, "").ok).toBe(false);
  });
});

describe("buildJsonLayout", () => {
  const text = JSON.stringify(doc);

  it("matches JSON.stringify pretty output", () => {
    const layout = buildJsonLayout(text);
    expect(layout.ok).toBe(true);
    expect(layout.pretty).toBe(JSON.stringify(doc, null, 2));
  });

  it("records ranges for nested nodes", () => {
    const layout = buildJsonLayout(text);
    expect(layout.ok).toBe(true);
    const r = layout.ranges!.get("$.store.book[1].title");
    expect(r).toBeDefined();
    const slice = layout.pretty!.slice(r!.from, r!.to);
    expect(slice).toBe(JSON.stringify("B"));
  });

  it("fails cleanly on invalid JSON", () => {
    const layout = buildJsonLayout("{oops");
    expect(layout.ok).toBe(false);
  });
});

describe("queryJsonPathInText", () => {
  const text = JSON.stringify(doc);

  it("returns highlight ranges aligned to the pretty body", () => {
    const res = queryJsonPathInText(text, "$..title");
    expect(res.ok).toBe(true);
    expect(res.matches).toHaveLength(3);
    expect(res.ranges).toHaveLength(3);
    const layout = buildJsonLayout(text);
    res.ranges.forEach((r, i) => {
      expect(layout.pretty!.slice(r.from, r.to)).toBe(JSON.stringify(res.matches[i].value));
    });
  });

  it("reports an error for non-JSON bodies", () => {
    const res = queryJsonPathInText("Not JSON at all", "$.a");
    expect(res.ok).toBe(false);
    expect(res.error).toContain("not valid JSON");
  });

  it("reports an error for malformed expressions", () => {
    const res = queryJsonPathInText(text, "oops");
    expect(res.ok).toBe(false);
    expect(res.matches).toEqual([]);
  });
});
