import { expect, test } from "bun:test";

import { sectionize } from "../content/boundaries.ts";

function root(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host;
}

test("headings split prose, requirements and benefits", (): void => {
  const sections = sectionize(
    root(`
      <p>We are hiring a platform engineer.</p>
      <h3>Requirements</h3>
      <ul><li>5+ years of TypeScript</li><li>Experience with Kubernetes</li></ul>
      <h3>Benefits</h3>
      <ul><li>Health coverage</li><li>Four weeks vacation</li></ul>
    `),
  );

  expect(sections.description).toContain("platform engineer");
  expect(sections.requirements).toEqual(["5+ years of TypeScript", "Experience with Kubernetes"]);
  expect(sections.benefits).toEqual(["Health coverage", "Four weeks vacation"]);
  expect(sections.description).not.toContain("Health coverage");
});

test("a bolded lone line counts as a heading", (): void => {
  const sections = sectionize(
    root(`
      <p>About the role.</p>
      <div><strong>What you'll need</strong></div>
      <ul><li>Go</li></ul>
    `),
  );
  expect(sections.requirements).toEqual(["Go"]);
});

test("qualifications are kept apart from requirements", (): void => {
  const sections = sectionize(
    root(`
      <h2>Qualifications</h2>
      <ul><li>BSc in Computer Science</li></ul>
      <h2>Requirements</h2>
      <ul><li>Must be eligible to work in Canada</li></ul>
    `),
  );
  expect(sections.qualifications).toEqual(["BSc in Computer Science"]);
  expect(sections.requirements).toEqual(["Must be eligible to work in Canada"]);
});

test("a posting with no headings degrades to all-description", (): void => {
  const sections = sectionize(
    root("<p>Join our team.</p><p>You will write code and ship features.</p>"),
  );
  expect(sections.description).toBe("Join our team.\nYou will write code and ship features.");
  expect(sections.requirements).toEqual([]);
});

test("a bolded lead-in inside a paragraph is not recorded twice", (): void => {
  const sections = sectionize(
    root(`
      <h3>Requirements</h3>
      <p><strong>Note:</strong> must be eligible to work in Canada</p>
    `),
  );
  expect(sections.requirements).toEqual(["Note: must be eligible to work in Canada"]);
});

test("dash-delimited lists without list items still split", (): void => {
  const sections = sectionize(
    root(`
      <h3>Requirements</h3>
      <div>- Build data pipelines - Own the billing service</div>
    `),
  );
  expect(sections.requirements).toEqual(["Build data pipelines", "Own the billing service"]);
});

test("an empty root does not throw", (): void => {
  expect(sectionize(root(""))).toEqual({
    description: "",
    requirements: [],
    qualifications: [],
    benefits: [],
  });
});

test("responsibilities headings stay in the description", (): void => {
  const sections = sectionize(
    root(`
      <h3>Responsibilities</h3>
      <ul><li>Own the billing service</li></ul>
      <h3>Requirements</h3>
      <ul><li>Rust</li></ul>
    `),
  );
  expect(sections.description).toContain("Own the billing service");
  expect(sections.requirements).toEqual(["Rust"]);
});
