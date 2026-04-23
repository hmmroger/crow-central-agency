export type FeedItemType = keyof typeof FeedItemTypes;
export const FeedItemTypes = {
  Post: "Post",
  Podcast: "Podcast",
} as const;

export interface FeedItemGuid {
  guid: string;
  isLink?: boolean;
}

export interface RefLink {
  title?: string;
  url: string;
}

export interface Feed {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  feedUrl: string;

  language?: string;
  link?: string;
  imageUrl?: string;

  author?: string;
  ownerName?: string;
  ownerEmail?: string;

  copyright?: string;
  generator?: string;

  isExplicit?: boolean;
  isUnreachable?: boolean;

  categories?: string[];

  latestItemPublishedTime: number;
  firstItemPublishedTime: number;
  lastUpdateTime: number;

  [key: string]: unknown;
}

export interface FeedItem {
  id: string;
  feedId: string;
  feedItemType: FeedItemType;
  title: string;
  subtitle: string;
  description: string;
  author?: string;
  content: string;
  imageUrl?: string;
  link: string;
  guid?: FeedItemGuid;
  categories?: string[];

  // podcast
  enclosureUrl?: string;
  transcriptUrl?: string;
  duration?: number;
  season?: number;
  episode?: number;
  isExplicit?: boolean;

  // simply feed annotations
  summary?: string;
  topics?: string[];
  refLinks?: RefLink[];

  publishedTime: number;
  lastUpdateTime: number;
}

export type FeedIndexItem = Pick<FeedItem, "id" | "feedItemType" | "title" | "guid" | "publishedTime">;
