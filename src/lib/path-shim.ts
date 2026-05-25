export const sep = "/";

export function join(...parts: string[]): string {
  return parts.join(sep).replace(/\/+/g, "/");
}

export default { sep, join };
