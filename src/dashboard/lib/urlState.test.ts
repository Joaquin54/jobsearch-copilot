import { expect, test } from "bun:test";

import {
  defaultTableUrlState,
  mergeTableUrlState,
  parseTableUrlState,
  serializeTableUrlState,
  type TableUrlState,
} from "./urlState.ts";

test("an untouched state serializes to an empty query", (): void => {
  expect(serializeTableUrlState(defaultTableUrlState())).toBe("");
});

test("every field round trips", (): void => {
  const state: TableUrlState = {
    filters: { status: "applied", source: "indeed", companyKey: "acme corp" },
    direction: "asc",
    pageIndex: 3,
    pageSize: 50,
  };
  expect(parseTableUrlState(`?${serializeTableUrlState(state)}`)).toEqual(state);
});

test("a handshake source filter round trips", (): void => {
  const state: TableUrlState = {
    ...defaultTableUrlState(),
    filters: { status: "all", source: "handshake", companyKey: null },
  };
  expect(parseTableUrlState(`?${serializeTableUrlState(state)}`)).toEqual(state);
});

test("the url page number is one based", (): void => {
  expect(serializeTableUrlState({ ...defaultTableUrlState(), pageIndex: 2 })).toContain("page=3");
  expect(parseTableUrlState("?page=3").pageIndex).toBe(2);
});

test("unknown values fall back to defaults instead of being coerced", (): void => {
  const parsed = parseTableUrlState("?status=hacked&source=monster&dir=sideways&size=9999&page=abc");
  expect(parsed).toEqual(defaultTableUrlState());
});

test("a page size outside the offered set is rejected", (): void => {
  expect(parseTableUrlState("?size=10").pageSize).toBe(10);
  expect(parseTableUrlState("?size=25").pageSize).toBe(25);
  expect(parseTableUrlState("?size=50").pageSize).toBe(50);
  expect(parseTableUrlState("?size=26").pageSize).toBe(25);
  expect(parseTableUrlState("?size=-50").pageSize).toBe(25);
});

test("a negative or zero page is rejected", (): void => {
  expect(parseTableUrlState("?page=0").pageIndex).toBe(0);
  expect(parseTableUrlState("?page=-4").pageIndex).toBe(0);
});

test("company keys with separators survive encoding", (): void => {
  const state: TableUrlState = {
    ...defaultTableUrlState(),
    filters: { status: "all", source: "all", companyKey: "a&b, inc. ünïcode" },
  };
  const parsed = parseTableUrlState(`?${serializeTableUrlState(state)}`);
  expect(parsed.filters.companyKey).toBe("a&b, inc. ünïcode");
});

test("an absurdly long company key is dropped", (): void => {
  expect(parseTableUrlState(`?company=${"x".repeat(500)}`).filters.companyKey).toBe(null);
});

test("an empty company param is dropped", (): void => {
  expect(parseTableUrlState("?company=").filters.companyKey).toBe(null);
});

test("merging leaves params this module does not own alone", (): void => {
  const merged = mergeTableUrlState(
    { ...defaultTableUrlState(), filters: { status: "applied", source: "all", companyKey: null } },
    "?seed=5000&keepme=1",
  );
  const params = new URLSearchParams(merged);
  expect(params.get("seed")).toBe("5000");
  expect(params.get("keepme")).toBe("1");
  expect(params.get("status")).toBe("applied");
});

test("merging clears an owned param that has returned to its default", (): void => {
  const merged = mergeTableUrlState(defaultTableUrlState(), "?status=applied&seed=10");
  const params = new URLSearchParams(merged);
  expect(params.get("status")).toBe(null);
  expect(params.get("seed")).toBe("10");
});
