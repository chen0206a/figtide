export function isEditingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element || typeof element.tagName !== "string") return false;
  if (element.isContentEditable) return true;
  return (
    element.tagName === "INPUT" ||
    element.tagName === "TEXTAREA" ||
    element.tagName === "SELECT"
  );
}
/**
 * Option+A on macOS types "å", so the shortcut is matched by physical key
 * (`code`) and never fires while a field has focus. Callers only reach
 * preventDefault when this returns true.
 */
export function shouldToggleAssistant(event: KeyboardEvent): boolean {
  if (!event.altKey || event.ctrlKey || event.metaKey) return false;
  if (event.code !== "KeyA") return false;
  return !isEditingTarget(event.target);
}