/** Maps short numeric IDs ↔ full filesystem paths to stay within Telegram's 64-byte callback_data limit. */

let nextId = 1;
const idToPath = new Map<number, string>();
const pathToId = new Map<string, number>();

export function registerPath(path: string): number {
  const existing = pathToId.get(path);
  if (existing !== undefined) return existing;

  const id = nextId++;
  idToPath.set(id, path);
  pathToId.set(path, id);
  return id;
}

export function resolvePath(id: number): string | undefined {
  return idToPath.get(id);
}
