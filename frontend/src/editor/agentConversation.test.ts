import { expect, it } from "vitest";
import { conversationPrompt, type ConversationTurn } from "./agentConversation";
const turn: ConversationTurn = {
  id: "1",
  prompt: "调整范围",
  text: "请问 X 轴还是 Y 轴？",
  outcome: "answered",
};
it("carries a clarification into the next user message while keeping current config authoritative", () => {
  const result = conversationPrompt([turn], "Y 轴");
  expect(result.prompt).toContain("请问 X 轴还是 Y 轴？");
  expect(result.prompt).toContain("本轮需求：\nY 轴");
  expect(result.prompt).toContain("以工作台提供的当前配置为准");
  expect(result.included).toBe(1);
});
it("never exceeds the server envelope and explicitly reports omitted history", () => {
  const turns = Array.from({ length: 8 }, (_, i) => ({
    ...turn,
    id: String(i),
    text: "回复".repeat(120),
  }));
  const result = conversationPrompt(turns, "范围".repeat(300));
  expect(result.prompt.length).toBeLessThanOrEqual(2000);
  expect(result.omitted).toBeGreaterThan(0);
  const long = conversationPrompt(turns, "字".repeat(2000));
  expect(long.prompt).toHaveLength(2000);
  expect(long.included).toBe(0);
  expect(long.omitted).toBe(8);
});
it("a new conversation includes no old content", () => {
  expect(conversationPrompt([], "字号18")).toEqual({
    prompt: "字号18",
    included: 0,
    omitted: 0,
  });
});
