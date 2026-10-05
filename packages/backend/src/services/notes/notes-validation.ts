import { NOTE_NAME_MAX_LENGTH } from "@crow-central-agency/shared";
import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";

/** Characters that are invalid in a filename on at least one supported platform */
const INVALID_NAME_CHARACTERS = /[<>:"/\\|?*]/;

const FIRST_PRINTABLE_CHARACTER_CODE = 0x20;
const DELETE_CHARACTER_CODE = 0x7f;

function hasControlCharacter(name: string): boolean {
  for (const character of name) {
    const code = character.codePointAt(0) ?? 0;
    if (code < FIRST_PRINTABLE_CHARACTER_CODE || code === DELETE_CHARACTER_CODE) {
      return true;
    }
  }

  return false;
}

/**
 * Validate a user-supplied note or folder name. Names are never normalized or
 * auto-resolved — an unusable name is rejected so the user renames it.
 *
 * @throws AppError(INVALID_FILENAME)
 */
export function assertValidNoteName(name: string): void {
  if (!name.trim()) {
    throw new AppError("Name cannot be empty", APP_ERROR_CODES.INVALID_FILENAME);
  }

  if (name !== name.trim()) {
    throw new AppError("Name cannot start or end with whitespace", APP_ERROR_CODES.INVALID_FILENAME);
  }

  // Dotfiles are valid on Unix, so the character check alone would let them through.
  if (name.startsWith(".")) {
    throw new AppError("Name cannot start with a dot", APP_ERROR_CODES.INVALID_FILENAME);
  }

  if (INVALID_NAME_CHARACTERS.test(name)) {
    throw new AppError(`Name cannot contain any of < > : " / \\ | ? *`, APP_ERROR_CODES.INVALID_FILENAME);
  }

  if (hasControlCharacter(name)) {
    throw new AppError("Name cannot contain control characters", APP_ERROR_CODES.INVALID_FILENAME);
  }

  if (Array.from(name).length > NOTE_NAME_MAX_LENGTH) {
    throw new AppError(`Name cannot exceed ${NOTE_NAME_MAX_LENGTH} characters`, APP_ERROR_CODES.INVALID_FILENAME);
  }
}
