/** The shape of public/build.json, read by the build and by the worker. */
export type BuildStamp = { id: string };

export function stampIdOf(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const id = (value as Partial<BuildStamp>).id;
  return typeof id === "string" && id !== "" ? id : null;
}
