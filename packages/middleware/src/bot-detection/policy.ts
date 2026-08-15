import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { parse as parseYaml } from "yaml";
import { PolicyConfigSchema } from "./types";
import type { BotClassification, PolicyAction, PolicyConfig } from "./types";

export function resolvePolicy(
  classification: BotClassification,
  config: PolicyConfig,
): PolicyAction {
  return config[classification];
}

/** Loads a policy config from JSON or YAML, picked by file extension. */
export function loadPolicyConfig(filePath: string): PolicyConfig {
  const raw = readFileSync(filePath, "utf8");
  const ext = extname(filePath).toLowerCase();
  const parsed = ext === ".yaml" || ext === ".yml" ? parseYaml(raw) : JSON.parse(raw);
  return PolicyConfigSchema.parse(parsed);
}
