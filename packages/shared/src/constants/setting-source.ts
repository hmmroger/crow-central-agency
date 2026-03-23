/**
 * Setting sources matching SDK SettingSource type.
 * Controls which SDK configuration sources are included in agent queries.
 */
export const SETTING_SOURCE = {
  USER: "user",
  PROJECT: "project",
  LOCAL: "local",
} as const;

export type SettingSource = (typeof SETTING_SOURCE)[keyof typeof SETTING_SOURCE];

/** Default setting sources for new agent creation */
export const DEFAULT_SETTING_SOURCES: SettingSource[] = [
  SETTING_SOURCE.USER,
  SETTING_SOURCE.PROJECT,
  SETTING_SOURCE.LOCAL,
];
