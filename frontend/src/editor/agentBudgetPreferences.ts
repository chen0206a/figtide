export type RoleBudgetShares = { coordinator: number; data: number; plotter: number; reviewer: number };
export type AgentBudgetPreferences = { runLimit: number; roles: RoleBudgetShares | null };
export const budgetPreferenceKey = 'figtide-agent-budget-v1';
export function budgetPreferenceError(p: AgentBudgetPreferences): string {
  if (!Number.isInteger(p.runLimit) || p.runLimit < 2000 || p.runLimit > 60000) return '单次用量额度须为 2,000–60,000 的整数。';
  if (p.roles) {
    if (Object.keys(p.roles).length!==4) return '角色配额需要四个角色，总和为 100%。';
    const values = [p.roles.coordinator, p.roles.data, p.roles.plotter, p.roles.reviewer];
    if (values.some(v => !Number.isInteger(v) || v < 1 || v > 100) || values.reduce((a,b) => a+b,0) !== 100) return '四个角色的百分比须为正整数，总和为 100%。';
  }
  return '';
}
export function readBudgetPreferences(): AgentBudgetPreferences {
  try { const raw=localStorage.getItem(budgetPreferenceKey);if(raw){const value=JSON.parse(raw);if(!budgetPreferenceError(value))return value;} } catch { /* Optional local preference. */ }
  return {runLimit:60000,roles:null};
}
export function storeBudgetPreferences(value: AgentBudgetPreferences) {
  if (budgetPreferenceError(value)) return;
  try { localStorage.setItem(budgetPreferenceKey,JSON.stringify(value)); } catch { /* Still usable in this page. */ }
}
