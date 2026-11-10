const APPLE_PLATFORM_PATTERN = /Mac|iPhone|iPad|iPod/;

/** Apple platforms use Cmd for app commands and keep Ctrl for text navigation. */
export function isApplePlatform(): boolean {
  return APPLE_PLATFORM_PATTERN.test(navigator.platform);
}

/** The platform's command modifier is held: Cmd on Apple platforms, Ctrl elsewhere. */
export function hasCommandModifier(event: KeyboardEvent): boolean {
  return isApplePlatform() ? event.metaKey : event.ctrlKey;
}
