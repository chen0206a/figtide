export const agentSuggestions = ["图例放到右侧", "隐藏网格线", "整体字号改为 18"];
export const agentConsent = "允许把图表配置和字段摘要（字段名、类型、缺失数、数值范围）发送给你配置的模型服务。不发送原始数据行和文件名；模型服务可能计费。";
export type AssistantSubmission = {id:string;prompt:string;consent:boolean};
