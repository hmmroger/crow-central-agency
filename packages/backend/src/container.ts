import { LLM_PROVIDER_TYPE } from "./config/constants.js";
import { env } from "./config/env.js";
import { AppError } from "./core/error/app-error.js";
import { APP_ERROR_CODES } from "./core/error/app-error.types.js";
import { GoogleAIProvider } from "./services/content-generation/provider/google-provider.js";
import { OpenAIProvider } from "./services/content-generation/provider/openai-provider.js";
import type {
  AudioGenerationProviderInterface,
  TextGenerationProviderInterface,
} from "./services/content-generation/content-generation.types.js";

const DEFAULT_API_KEY = "not-needed";

const PROVIDER_BASE_URLS: Partial<Record<string, string>> = {
  [LLM_PROVIDER_TYPE.GOOGLE]: "https://generativelanguage.googleapis.com/v1beta/openai",
  [LLM_PROVIDER_TYPE.ANTHROPIC]: "https://api.anthropic.com/v1",
};

class Container {
  private cache = new Map<string, unknown>();

  private singleton<T>(key: string, factory: () => T): T {
    if (!this.cache.has(key)) {
      this.cache.set(key, factory());
    }

    return this.cache.get(key) as T;
  }

  public get textGenProvider(): TextGenerationProviderInterface {
    return this.singleton("textGen", () => {
      const provider = env.TEXT_GENERATION_PROVIDER;
      const validProviders = new Set<string>(Object.values(LLM_PROVIDER_TYPE));
      const isInvalid =
        !provider ||
        !validProviders.has(provider) ||
        (provider === LLM_PROVIDER_TYPE.CUSTOM && !env.TEXT_GENERATION_BASE_URL) ||
        (provider !== LLM_PROVIDER_TYPE.CUSTOM && !env.TEXT_GENERATION_API_KEY);

      if (isInvalid) {
        throw new AppError("Text generation provider not available", APP_ERROR_CODES.NOT_SUPPORTED);
      }

      const baseUrl = env.TEXT_GENERATION_BASE_URL ?? PROVIDER_BASE_URLS[provider];
      return new OpenAIProvider({ baseUrl, apiKey: env.TEXT_GENERATION_API_KEY ?? DEFAULT_API_KEY });
    });
  }

  public get audioGenProvider(): AudioGenerationProviderInterface {
    return this.singleton("audioGen", () => {
      const provider = env.AUDIO_GENERATION_PROVIDER;
      const apiKey = env.AUDIO_GENERATION_API_KEY;
      if (provider !== LLM_PROVIDER_TYPE.GOOGLE || !apiKey) {
        throw new AppError("Audio generation provider not available", APP_ERROR_CODES.NOT_SUPPORTED);
      }

      return new GoogleAIProvider(apiKey);
    });
  }

  public get feedTextGenProvider(): TextGenerationProviderInterface {
    return this.singleton("feedTextGen", () => {
      const provider = env.FEED_TEXT_GENERATION_PROVIDER;
      const validProviders = new Set<string>(Object.values(LLM_PROVIDER_TYPE));
      const isInvalid =
        !provider ||
        !validProviders.has(provider) ||
        (provider === LLM_PROVIDER_TYPE.CUSTOM && !env.FEED_TEXT_GENERATION_BASE_URL) ||
        (provider !== LLM_PROVIDER_TYPE.CUSTOM && !env.FEED_TEXT_GENERATION_API_KEY);

      if (isInvalid) {
        throw new AppError("Feed text generation provider not available", APP_ERROR_CODES.NOT_SUPPORTED);
      }

      const baseUrl = env.FEED_TEXT_GENERATION_BASE_URL ?? PROVIDER_BASE_URLS[provider];
      return new OpenAIProvider({ baseUrl, apiKey: env.FEED_TEXT_GENERATION_API_KEY ?? DEFAULT_API_KEY });
    });
  }
}

export const container = new Container();
