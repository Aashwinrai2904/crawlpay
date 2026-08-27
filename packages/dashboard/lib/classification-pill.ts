/**
 * Fixed, non-cycled color assignment for the bot-classification vocabulary
 * (see CVD validation in the Phase 6 restyle commit) -- unknown-bot uses a
 * neutral gray "other" treatment rather than a fourth saturated hue, since
 * blue/cyan/pink/green fails CVD separation at that classification.
 */
const PILL_CLASS: Record<string, string> = {
  human: "pill-blue",
  "search-crawler": "pill-cyan",
  "ai-crawler": "pill-pink",
  "unknown-bot": "pill-gray",
};

export function classificationPillClass(classification: string): string {
  return PILL_CLASS[classification] ?? "pill-gray";
}
