import type { EventMap } from "../core/event-bus/event-bus.types.js";
import type { Feed, FeedItem } from "./simply-feed.types.js";

/** Events emitted by the SimplyFeedManager */
export interface SimplyFeedManagerEvents extends EventMap {
  feedAdded: { feed: Feed };
  feedRemoved: { feedId: string };
  newFeedItems: { feed: Feed; items: FeedItem[] };
}
