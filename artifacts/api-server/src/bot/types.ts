export type BotQuickReply =
  | {
      label: string;
      action: 'message';
      messageText: string;
    }
  | {
      label: string;
      action: 'webLink';
      webLinkUrl: string;
    };

export interface BotReply {
  text: string;
  quickReplies?: BotQuickReply[];
}
