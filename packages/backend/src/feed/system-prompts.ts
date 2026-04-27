import { MessageRoles } from "../services/content-generation/content-generation.types.js";
import type { MessageTemplate } from "../utils/message-template.types.js";

export const SUMMARY_SYSTEM_PROMPT: MessageTemplate = {
  role: MessageRoles.system,
  content: [
    {
      content: [
        "You are a highly capable assistant that excels at summarizing complex subjects and identifying relevant topics.",
        "Your primary goal is to create concise, accurate summaries and maintain topic consistency across content.",
        "Always keep your responses short, objective, and factual.",
        "Your response MUST be valid JSON format with no additional text or formatting.",
      ],
    },
    {
      content: [`Existing topics for consistency: {topics}`],
      keys: ["topics"],
    },
    {
      content: [`No existing topics yet - you may create new ones as appropriate.`],
      keys: ["noTopics"],
    },
  ],
  keys: ["topics", "noTopics"],
};

export const SUMMARY_USER_PROMPT: MessageTemplate = {
  role: MessageRoles.user,
  content: [
    {
      content: [
        "Please analyze the following content and provide:",
        "1. A concise summary in exactly 100 words or fewer that captures the key points and main message. Avoid speculation and never fabricate data or sources. Keep it short if you do not have enough information.",
        "2. Up to 10 relevant topics that best categorize this content",
        "",
        "Topic guidelines:",
        "- Prefer existing topics when they accurately represent the content",
        "- Create new topics only when existing ones don't fit well",
        "- Include specific subjects when they are central to the content (companies, people, locations, products, etc.)",
        "- Balance specific subjects with broader categorical topics",
        "- Each topic should be 1-3 words, lowercase, no special characters",
        "",
        "Response format: Valid JSON object with 'summary' (string) and 'topics' (array of strings) fields only.",
        "Do NOT return JSON object in code block.",
        "",
        "--- CONTENT TO ANALYZE ---",
        `{text}`,
      ],
      keys: ["text"],
    },
  ],
  keys: ["text"],
};

export const QUERY_USER_PROMPT: MessageTemplate = {
  role: MessageRoles.user,
  content: [
    {
      content: [
        "Please analyze the user query and provide relevant topics that best categorize this query.",
        "Topic guidelines:",
        "- Include specific subjects when they are central to the content (companies, people, locations, products, etc.)",
        "- Balance specific subjects with broader categorical topics",
        "- Each topic should be 1-3 words, lowercase, no special characters",
        "",
        "Response format: Valid JSON object with 'topics' (array of strings) field only.",
        "Do NOT return JSON object in code block.",
        "",
        "--- QUERY TO ANALYZE ---",
        `{text}`,
      ],
      keys: ["text"],
    },
  ],
  keys: ["text"],
};
