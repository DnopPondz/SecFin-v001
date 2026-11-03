const ICT_OFFSET_MS = 7 * 60 * 60 * 1000;

// Thai calendar date (UTC+7, no DST) as YYYY-MM-DD.
export function thaiDate(ms: number): string {
  return new Date(ms + ICT_OFFSET_MS).toISOString().slice(0, 10);
}

// Workers AI and the other free quotas reset at 00:00 UTC, so Neuron metering uses the UTC day.
export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
