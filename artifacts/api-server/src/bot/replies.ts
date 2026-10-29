import type { BotQuickReply } from './types';

/** Joins the configured web app base URL with a path, or null when unset. */
export const appLink = (appUrl: string | undefined, path: string): string | null => {
  if (!appUrl) {
    return null;
  }

  const base = appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl;
  return `${base}${path}`;
};

export const webLink = (
  label: string,
  appUrl: string | undefined,
  path: string,
): BotQuickReply | null => {
  const url = appLink(appUrl, path);
  return url ? { label, action: 'webLink', webLinkUrl: url } : null;
};

export const messageQuickReply = (
  label: string,
  messageText: string,
): BotQuickReply => ({ label, action: 'message', messageText });

export const compact = (
  items: Array<BotQuickReply | null>,
): BotQuickReply[] =>
  items.filter((item): item is BotQuickReply => item !== null);
