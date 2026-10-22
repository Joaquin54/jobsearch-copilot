import { expect, test } from "bun:test";

import { isDisplayableJobUrl } from "./safeUrl.ts";

test("accepts https job board hosts and their subdomains", (): void => {
  expect(isDisplayableJobUrl("https://www.linkedin.com/jobs/view/4012345678")).toBe(true);
  expect(isDisplayableJobUrl("https://linkedin.com/jobs/1")).toBe(true);
  expect(isDisplayableJobUrl("https://ca.indeed.com/viewjob?jk=abc")).toBe(true);
  expect(isDisplayableJobUrl("https://indeed.com/x")).toBe(true);
});

test("rejects anything that is not https", (): void => {
  expect(isDisplayableJobUrl("http://linkedin.com/jobs/1")).toBe(false);
  expect(isDisplayableJobUrl("javascript:alert(1)")).toBe(false);
  expect(isDisplayableJobUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
  expect(isDisplayableJobUrl("file:///etc/passwd")).toBe(false);
});

/** A substring check would let every one of these through. */
test("rejects lookalike hosts", (): void => {
  expect(isDisplayableJobUrl("https://evil-linkedin.com/jobs/1")).toBe(false);
  expect(isDisplayableJobUrl("https://linkedin.com.evil.net/jobs/1")).toBe(false);
  expect(isDisplayableJobUrl("https://notindeed.com/x")).toBe(false);
  expect(isDisplayableJobUrl("https://indeed.com.attacker.io/x")).toBe(false);
  expect(isDisplayableJobUrl("https://fakelinkedin.com/x")).toBe(false);
});

test("rejects unparseable input", (): void => {
  expect(isDisplayableJobUrl("")).toBe(false);
  expect(isDisplayableJobUrl("not a url")).toBe(false);
  expect(isDisplayableJobUrl("//linkedin.com/x")).toBe(false);
});

test("host matching ignores case", (): void => {
  expect(isDisplayableJobUrl("https://WWW.LinkedIn.COM/jobs/1")).toBe(true);
});
