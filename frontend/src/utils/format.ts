export function formatTTL(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`
  const h = seconds / 3600
  return `${Number.isInteger(h) ? h : h.toFixed(1)} h`
}
