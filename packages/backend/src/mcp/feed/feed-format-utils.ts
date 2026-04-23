import type { Feed, FeedItem } from "../../feed/simply-feed.types.js";
import { FeedItemTypes } from "../../feed/simply-feed.types.js";
import { formatLocalDateTime } from "../../utils/date-utils.js";

const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_MINUTE = 60;

const formatDurationSeconds = (totalSeconds: number): string => {
  const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR);
  const minutes = Math.floor((totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const seconds = Math.floor(totalSeconds % SECONDS_PER_MINUTE);
  const paddedSeconds = seconds.toString().padStart(2, "0");
  if (hours > 0) {
    const paddedMinutes = minutes.toString().padStart(2, "0");
    return `${hours}:${paddedMinutes}:${paddedSeconds}`;
  }

  return `${minutes}:${paddedSeconds}`;
};

/**
 * Formats a FeedItem as a natural language string for tool responses.
 *
 * @param feedItem - The feed item to format
 * @param feedName - Optional feed name to include
 * @param timeZone - Optional timezone for formatting the published time (defaults to UTC)
 * @returns Formatted natural language string
 */
export const formatFeedItemSummary = (feedItem: FeedItem, feedName?: string, timeZone?: string): string => {
  const publishedTime = formatLocalDateTime(feedItem.publishedTime, timeZone);
  const lines: string[] = [];

  lines.push(`Title: ${feedItem.title}`);
  lines.push(`ID: ${feedItem.id} | Feed ID: ${feedItem.feedId}`);
  if (feedName) {
    lines.push(`Feed: ${feedName}`);
  }

  if (feedItem.author) {
    lines.push(`Author: ${feedItem.author}`);
  }

  lines.push(`Published: ${publishedTime}`);
  lines.push(`Link: ${feedItem.link}`);

  if (feedItem.feedItemType === FeedItemTypes.Podcast && feedItem.duration !== undefined) {
    lines.push(`Duration: ${formatDurationSeconds(feedItem.duration)}`);
  }

  if (feedItem.topics?.length) {
    lines.push(`Topics: ${feedItem.topics.join(", ")}`);
  } else if (feedItem.categories?.length) {
    lines.push(`Categories: ${feedItem.categories.join(", ")}`);
  }

  if (feedItem.summary) {
    lines.push(`Summary: ${feedItem.summary}`);
  } else if (feedItem.description) {
    lines.push(`Description: ${feedItem.description}`);
  }

  return lines.join("\n");
};

/**
 * Formats a Feed as a natural language string for tool responses.
 *
 * @param feed - The feed object to format
 * @returns Formatted natural language string
 */
export const formatFeed = (feed: Feed, timeZone?: string): string => {
  const latestPublished = formatLocalDateTime(feed.latestItemPublishedTime, timeZone);
  return `- ${feed.title} (ID: ${feed.id}) - Latest item published: ${latestPublished}`;
};
