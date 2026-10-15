// Typing never moves you (J3). Every global key listener of the page asks this first: a key typed in a text box
// (the chat, the builder's inspector, any future form) belongs to that box, not to the world. Listeners added later
// (other branches, features' action keys) must use it too.
export function escribiendo(e: Event): boolean {
  const t = e.target as HTMLElement | null;
  if (!t || typeof t.tagName !== "string") return false;
  return t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT";
}
