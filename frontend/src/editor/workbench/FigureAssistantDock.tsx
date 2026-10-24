import { type Dataset } from "../../lib/api";
import { AgentAssistant } from "../AgentAssistant";
import { type Config } from "../model";
import type {AssistantSubmission} from '../agentPresentation';
import type {CanvasProposal} from './useProposalCanvas';
import "../styles-library.css";

type FigureAssistantDockProps = {
  project: number;
  chartId: number | null;
  data: Dataset;
  agentOpen: boolean;
  assistantPrompt: string;
  submission?:AssistantSubmission;
  onPreview?:(proposal:CanvasProposal|null)=>void;
  previewVisible?:boolean;
  onTogglePreview?:()=>void;
  id: number | null;
  revision: number;
  c: Config;
  serialized: string;
  setAgentOpen: React.Dispatch<React.SetStateAction<boolean>>;
  saving: boolean;
  change: (value: Config) => void;
  setLogs: React.Dispatch<React.SetStateAction<string[]>>;
  notify: (s: string) => void;
};
export function FigureAssistantDock({
  project,
  chartId,
  data,
  agentOpen,
  assistantPrompt,
  submission,
  onPreview,
  previewVisible,
  onTogglePreview,
  id,
  revision,
  c,
  serialized,
  setAgentOpen,
  saving,
  change,
  setLogs,
  notify,
}: FigureAssistantDockProps) {
  return (
    <AgentAssistant
      key={`${project}:${chartId || "draft"}:${data.id}`}
      docked
      open={agentOpen}
      initialPrompt={submission?.prompt||assistantPrompt}
      initialConsent={submission?.consent}
      autoStart={!!submission}
      submission={submission}
      onPreview={onPreview}
      previewVisible={previewVisible}
      onTogglePreview={onTogglePreview}
      project={project}
      chartId={id}
      revision={revision}
      config={c}
      data={data}
      token={JSON.stringify({ serialized, id, revision })}
      onClose={() => setAgentOpen(false)}
      onApply={(token, config, count) => {
        if (token !== JSON.stringify({ serialized, id, revision }) || saving)
          return false;
        change(config);
        setLogs((l) => [`已确认助手提案 · ${count} 项`, ...l].slice(0, 30));
        notify(`已应用 ${count} 项调整，可撤销`);
        return true;
      }}
    />
  );
}
