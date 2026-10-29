const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** Returns the current Korea Standard Time date as YYYY-MM-DD. */
export const kstDate = (date: Date = new Date()): string =>
  new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);

/** Returns the current Korea Standard Time as minutes since midnight. */
export const kstMinutes = (date: Date = new Date()): number => {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
};

/** Parses "HH:MM" or "HH:MM:SS" into minutes since midnight. */
export const timeToMinutes = (value: string): number | null => {
  const match = /^([01][0-9]|2[0-3]):([0-5][0-9])/.exec(value);
  if (!match) {
    return null;
  }
  return Number(match[1]) * 60 + Number(match[2]);
};

/** Distance in minutes between two clock times, wrapping at midnight. */
export const minutesApart = (first: number, second: number): number => {
  const difference = Math.abs(first - second);
  return Math.min(difference, 24 * 60 - difference);
};
