// Finds the stored files a deleted record pointed at, so they can be removed
// with it. Files are referenced by URL ("/api/files/<id>") in plain columns
// (messages.file_path) and in JSON (tasks.completion_images and the images of
// each tasks.completion_history entry).

const FILE_URL = /^\/api\/files\/(\d+)$/;

export function fileIdFromUrl(url: unknown): number | null {
  const m = FILE_URL.exec(String(url ?? "").trim());
  return m ? Number(m[1]) : null;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string" || !value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

/** Proof-photo file ids of a task: its current photos and every past finish's. */
export function taskProofFileIds(task: { completion_images?: unknown; completion_history?: unknown }): number[] {
  const ids = new Set<number>();
  const add = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const url of list) {
      const id = fileIdFromUrl(url);
      if (id != null) ids.add(id);
    }
  };
  add(parseJson(task.completion_images));
  const history = parseJson(task.completion_history);
  if (Array.isArray(history)) for (const entry of history) add((entry as any)?.images);
  return [...ids];
}

/** A LIKE pattern matching a JSON value that contains this file's URL. */
export function fileUrlJsonPattern(id: number): string {
  return `%"/api/files/${id}"%`;
}
