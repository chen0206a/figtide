import type {ToolOperation} from './figureTools';
export type ReviewIssue<Operation=ToolOperation>={id:string;rule:string;severity:'error'|'warning'|'info';title:string;detail:string;fixable:boolean;fix:Operation[];anchor:{kind:string;ref:string|number};number?:number};
export type ReviewResult<Operation=ToolOperation>={protocol_version:1;rules_version:string;journal:string;issues:ReviewIssue<Operation>[];passed:string[];skipped:{rule:string;reason:string}[];review_hash?:string};
export function selectedOperations<Operation=ToolOperation>(report:ReviewResult<Operation>|null,selected:ReadonlySet<string>,ignored:ReadonlySet<string>=new Set()):Operation[]{
  return report?.issues.filter(issue=>issue.fixable&&selected.has(issue.id)&&!ignored.has(issue.id)).flatMap(issue=>issue.fix)||[];
}
