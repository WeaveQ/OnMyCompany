/**
 * Static reference pricing catalog (G2) — not a live bill.
 * Override via data/company/pricing.json when present.
 */

export interface LlmPriceRow {
  channel: string;
  model: string;
  inputPrice: number;
  cachePrice: number;
  outputPrice: number;
  unit?: string;
}

export interface ToolPriceRow {
  service: string;
  price: string;
  description: string;
}

export interface PricingCatalog {
  updatedAt: string;
  note: string;
  llm: LlmPriceRow[];
  tools: ToolPriceRow[];
  /** Optional provenance when resolved via OmniRoute sidecar (B). */
  source?: "omniroute" | "static" | "mixed";
}

export const DEFAULT_PRICING_CATALOG: PricingCatalog = {
  updatedAt: "2026-05-15",
  note: "价格参考，实际扣费以用量明细为准。经 Gateway 的调用才会计入本公司计量。",
  llm: [
    { channel: "oomol", model: "deepseek-chat", inputPrice: 0.17, cachePrice: 0.01, outputPrice: 0.34 },
    { channel: "DeepSeek", model: "deepseek-reasoner", inputPrice: 0.4, cachePrice: 0.04, outputPrice: 0.8 },
    { channel: "DeepSeek", model: "deepseek-v4-flash", inputPrice: 0.17, cachePrice: 0.01, outputPrice: 0.34 },
    { channel: "GLM", model: "glm-4.5", inputPrice: 0.5, cachePrice: 0.5, outputPrice: 2 },
    { channel: "OOMOL", model: "gpt-5.6-luna", inputPrice: 1, cachePrice: 0.1, outputPrice: 6 },
    { channel: "Kimi", model: "kimi-k3", inputPrice: 3, cachePrice: 0.3, outputPrice: 15 },
    { channel: "AlibabaCloud", model: "qwen3.5-plus", inputPrice: 0.3, cachePrice: 0.03, outputPrice: 1.8 },
    { channel: "oomol", model: "oomol-chat", inputPrice: 0.2, cachePrice: 0.02, outputPrice: 0.4 },
  ],
  tools: [
    { service: "fal-nano-banana", price: "0.047 / image", description: "图片生成" },
    { service: "fal-nano-banana-pro", price: "0.18 / image", description: "图片生成" },
    { service: "wanx-image", price: "0.035 / image", description: "图片生成" },
    { service: "tinify-png-shrink", price: "0.009 / image", description: "图片压缩" },
    { service: "qwen-mt-image", price: "0.0005 / image", description: "图片翻译" },
    { service: "jina-reader", price: "search: 0.05 / M tokens · read: 0.05 / M tokens", description: "Jina Reader" },
    { service: "doubao-tts", price: "0.77 / 10k chars", description: "文本转语音" },
    { service: "doubao-stt", price: "0.34 / hour", description: "语音转文本" },
    { service: "qwen-tts", price: "0.144 / 10k chars", description: "文本转语音" },
  ],
};

export function mergePricingCatalog(override: Partial<PricingCatalog> | null | undefined): PricingCatalog {
  if (!override || typeof override !== "object") {
    return structuredClone(DEFAULT_PRICING_CATALOG);
  }
  return {
    updatedAt: typeof override.updatedAt === "string" ? override.updatedAt : DEFAULT_PRICING_CATALOG.updatedAt,
    note: typeof override.note === "string" ? override.note : DEFAULT_PRICING_CATALOG.note,
    llm: Array.isArray(override.llm) ? override.llm : DEFAULT_PRICING_CATALOG.llm,
    tools: Array.isArray(override.tools) ? override.tools : DEFAULT_PRICING_CATALOG.tools,
  };
}
