/**
 * What the user is looking at, sent with every Bruno message. Only page
 * identity and record ids travel from the client; the server looks the
 * records up itself, scoped to the caller's active workspace.
 */
export interface ScreenContextRequest {
  /** Path (+ query) of the current page, e.g. "/tasks" or "/stats?mode=analyze". */
  route: string;
  /** Human page name as shown in the header, e.g. "Tasks". */
  view: string;
  /** Task open in the editor on the Tasks page. */
  taskId?: number | null;
  /** Event open in the Calendar editor. */
  eventId?: number | null;
  /** Active Messaging channel. */
  channelId?: number | null;
  /** File open in the Code editor. */
  codeFileId?: number | null;
  /** Event open on the Predict page (season + FTC event code). */
  predictSeason?: number | null;
  predictEvent?: string | null;
}
