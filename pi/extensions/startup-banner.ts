// Startup inventory based on public Pi APIs; it does not enter model context.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text, truncateToWidth } from "@earendil-works/pi-tui";
import { readFileSync } from "node:fs";
import { basename, dirname, extname, relative } from "node:path";

const ENTRY_TYPE = "startup-banner";
const MAX_DESC = 100;

type Item = { name: string; description: string };
type Inventory = { dir?: string; tools: Item[]; extensions: Item[] };
type SourceInfo = { path: string; source: string };

function shortDescription(value?: string): string {
  if (!value) return "";
  let text = value.replace(/[\x00-\x1f\x7f-\x9f]/g, " ").replace(/\s+/g, " ").trim();
  const dot = text.indexOf(". ");
  if (dot > 0 && dot < MAX_DESC) text = text.slice(0, dot);
  text = text.replace(/\.$/, "");
  return text.length > MAX_DESC ? `${text.slice(0, MAX_DESC - 1).trimEnd()}…` : text;
}

// Only attribute a manifest to an extension when it declares Pi extensions.
function packageFor(file: string): { root: string; name: string; description: string } | undefined {
  if (!file.startsWith("/")) return undefined;
  let dir = dirname(file);
  while (true) {
    try {
      const manifest = JSON.parse(readFileSync(`${dir}/package.json`, "utf8"));
      if (typeof manifest.name === "string" && Array.isArray(manifest.pi?.extensions)) {
        return { root: dir, name: manifest.name, description: shortDescription(manifest.description) };
      }
    } catch {
      // The parent need not contain a readable package manifest.
    }
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function inventory(pi: ExtensionAPI): Inventory {
  const active = new Set(pi.getActiveTools());
  const allTools = pi.getAllTools();
  const tools = allTools
    .filter((tool) => active.has(tool.name))
    .map((tool) => ({ name: tool.name, description: shortDescription(tool.description) }));

  // Pi exposes provenance for registered tools and commands, not all loaded extensions.
  const sources = new Map<string, { source: SourceInfo; tools: string[]; commands: string[] }>();
  const add = (source: SourceInfo, kind: "tools" | "commands", name: string) => {
    if (!source || source.source === "builtin" || source.source === "sdk" || !source.path) return;
    let group = sources.get(source.path);
    if (!group) {
      group = { source, tools: [], commands: [] };
      sources.set(source.path, group);
    }
    group[kind].push(name);
  };
  for (const tool of allTools) add(tool.sourceInfo, "tools", tool.name);
  for (const command of pi.getCommands()) {
    if (command.source === "extension") add(command.sourceInfo, "commands", `/${command.name}`);
  }

  const records = [...sources.values()].map((group) => {
    const pkg = packageFor(group.source.path);
    const file = basename(group.source.path);
    const name = pkg?.name ?? (file.startsWith("index.") ? basename(dirname(group.source.path)) : basename(file, extname(file)));
    const capabilities = [
      group.tools.length ? `tool: ${group.tools.sort().join(", ")}` : "",
      group.commands.length ? `comandi: ${group.commands.sort().join(", ")}` : "",
    ].filter(Boolean).join("; ");
    return { name, path: group.source.path, root: pkg?.root, description: pkg?.description || capabilities || "descrizione non disponibile" };
  });
  const counts = new Map<string, number>();
  for (const record of records) counts.set(record.name, (counts.get(record.name) ?? 0) + 1);
  const extensions = records.map((record) => ({
    name: (counts.get(record.name) ?? 0) > 1
      ? `${record.name} (${record.root ? relative(record.root, record.path) : record.path})`
      : record.name,
    description: record.description,
  }));
  extensions.push({ name: "startup-banner", description: "Mostra directory agente, tool ed estensioni rilevate" });
  return { dir: process.env.PI_CODING_AGENT_DIR, tools, extensions };
}

function listLines(items: Item[], theme: { fg: (color: "dim", text: string) => string }): string[] {
  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));
  const width = Math.min(Math.max(...sorted.map((item) => item.name.length), 0), 32);
  return sorted.map((item) => theme.fg("dim", `  ${item.name.padEnd(width)} — ${item.description}`));
}

export default function (pi: ExtensionAPI) {
  pi.registerEntryRenderer<Inventory>(ENTRY_TYPE, (entry, _state, theme) => {
    const data = entry.data ?? { tools: [], extensions: [] };
    const lines = [
      theme.fg("mdHeading", "[Agent Dir]"),
      theme.fg("dim", `  ${data.dir ?? "(non impostato)"}`),
      "",
      theme.fg("mdHeading", "[Tools]"),
      ...listLines(data.tools, theme),
      "",
      theme.fg("mdHeading", "[Extensions]"),
      ...listLines(data.extensions, theme),
    ];
    return {
      render(width: number) { return lines.map((line) => truncateToWidth(line, width)); },
      invalidate() {},
    };
  });

  // Hide legacy entries when resuming sessions created by the two old banners.
  for (const legacy of ["tools-banner", "agent-dir-banner"]) {
    pi.registerEntryRenderer(legacy, () => new Text("", 0, 0));
  }

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    if (ctx.sessionManager.getEntries().some((entry) => entry.type === "custom" && entry.customType === ENTRY_TYPE)) return;
    pi.appendEntry(ENTRY_TYPE, inventory(pi));
  });
}
