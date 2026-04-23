import { z } from "zod";

/** API-facing feed information returned by the backend */
export interface FeedInfo {
  id: string;
  title: string;
  feedUrl: string;
  description?: string;
  link?: string;
  imageUrl?: string;
  language?: string;
  categories?: string[];
  isUnreachable?: boolean;
  latestItemPublishedTime: number;
  lastUpdateTime: number;
}

/** Input schema for adding a new feed by URL */
export const AddFeedInputSchema = z.object({
  feedUrl: z.url(),
});

export type AddFeedInput = z.infer<typeof AddFeedInputSchema>;

/** Input schema for detecting feeds advertised on a page */
export const DetectFeedsInputSchema = z.object({
  url: z.url(),
});

export type DetectFeedsInput = z.infer<typeof DetectFeedsInputSchema>;
