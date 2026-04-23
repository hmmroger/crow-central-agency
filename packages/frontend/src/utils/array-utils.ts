/** Order-independent equality check for primitive arrays. */
export function arraysEqual<T>(arrayA: T[], arrayB: T[]): boolean {
  if (arrayA.length !== arrayB.length) {
    return false;
  }

  const sortedA = [...arrayA].sort();
  const sortedB = [...arrayB].sort();
  return sortedA.every((value, index) => value === sortedB[index]);
}
