import type {ToolOperation} from './figureTools';
export type ReviewIssue={id:string;rule:string;severity:'error'|'warning'|'info';title:string;detail:string;fixable:boolean;fix:ToolOperation[];anchor:{kind:string;ref:string|number};number?:number};
export type ReviewResult={protocol_version:1;rules_version:string;journal:string;issues:ReviewIssue[];passed:string[];skipped:{rule:string;reason:string}[];review_hash?:string};
export function selectedOperations(report:ReviewResult|null,selected:ReadonlySet<string>,ignored:ReadonlySet<string>=new Set()):ToolOperation[]{
  return report?.issues.filter(issue=>issue.fixable&&selected.has(issue.id)&&!ignored.has(issue.id)).flatMap(issue=>issue.fix)||[];
}
