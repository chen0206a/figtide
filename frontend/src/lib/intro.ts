export function introSeen(): boolean {
  try { return localStorage.getItem("labflow-intro-seen") === "1"; }
  catch { return true; }
}
export function markIntroSeen() {
  try { localStorage.setItem("labflow-intro-seen", "1"); } catch { /* workspace remains available */ }
}
