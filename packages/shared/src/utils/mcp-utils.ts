export function normalizeMcpName(name: string): string {
  return name.toLowerCase().replaceAll(" ", "_");
}
