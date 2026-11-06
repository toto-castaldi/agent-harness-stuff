import registerQuestionTools from "../pi/extensions/question-tool/index.ts";
import { writeFileSync } from "node:fs";

export default function (pi: any) {
  const definitions = new Map<string, any>();
  registerQuestionTools({ registerTool(tool: any) { definitions.set(tool.name, tool); } } as any);
  pi.on("session_start", async (_event: any, ctx: any) => {
    const tools = pi.getAllTools().filter((tool: any) => ["question", "questionnaire"].includes(tool.name));
    writeFileSync(`${ctx.cwd}/inventory.json`, JSON.stringify(tools.map((tool: any) => ({ name: tool.name, path: tool.sourceInfo.path }))));
  });
  pi.registerCommand("synthetic-question", { handler: async (_args: string, ctx: any) => {
    await definitions.get("question").execute("synthetic", { question: "Synthetic question?", options: [{ label: "Alpha" }] }, undefined, undefined, ctx);
  } });
  pi.registerCommand("synthetic-questionnaire", { handler: async (_args: string, ctx: any) => {
    await definitions.get("questionnaire").execute("synthetic", { questions: [{ id: "q", prompt: "Synthetic prompt?", options: [{ label: "Alpha", value: "a" }] }] }, undefined, undefined, ctx);
  } });
}
