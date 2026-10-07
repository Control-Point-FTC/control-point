// Who may change a chat message (pure, so it's unit-tested).
//
// - Authors may delete their own messages (with the usual broadcast), and
//   edit them ("edit-own": everyone sees the change, marked "edited").
// - Deleting someone else's message, deleting silently (no broadcast), and
//   editing (the silent moderation edit in Settings → Admin) need moderator
//   rights: the manage_members permission, or '*' (which legacy
//   account_type='admin' members get).

export type MessageAction = "delete" | "silent-delete" | "edit" | "edit-own";

export function isMessageModerator(perms: Set<string>): boolean {
  return perms.has("*") || perms.has("manage_members");
}

export function messageActionAllowed({ action, isAuthor, moderator }: { action: MessageAction; isAuthor: boolean; moderator: boolean }): boolean {
  if (action === "edit-own") return isAuthor;
  if (moderator) return true;
  return action === "delete" && isAuthor;
}
