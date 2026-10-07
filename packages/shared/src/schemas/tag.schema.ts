import { z } from "zod";

export const TagSchema = z.object({
  id: z.string().min(1),
  /** Normalized name, unique across tags */
  name: z.string().min(1),
  createdTimestamp: z.number(),
});

export type Tag = z.infer<typeof TagSchema>;
