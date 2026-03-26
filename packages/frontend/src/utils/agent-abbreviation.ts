/**
 * Generate a short abbreviation from an agent name for display in command strip pills.
 * Examples: "Agent 7" → "A-7", "Email Draft" → "E-D", "Scanner" → "S-R"
 *
 * @param name - The agent's display name
 * @returns An uppercase abbreviation like "A-7" or "E-D"
 */
export function getAgentAbbreviation(name: string): string {
  const trimmed = name.trim();

  if (!trimmed) {
    return "--";
  }

  const words = trimmed.split(/\s+/);

  if (words.length === 1) {
    const word = words[0];
    const first = word[0].toUpperCase();
    const last = word[word.length - 1].toUpperCase();

    return `${first}-${last}`;
  }

  const first = words[0][0].toUpperCase();
  const last = words[words.length - 1][0].toUpperCase();

  return `${first}-${last}`;
}
