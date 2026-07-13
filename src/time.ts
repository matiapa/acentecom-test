export function formatAsOf(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

export function weekWindowLabel(tz: string): string {
  return `this week (Mon–now, ${tz})`;
}
