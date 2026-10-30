import type { AppDatabase } from '@workspace/db';

import { HttpError } from '../lib/errors';
import { handleBotMessage } from './handler';

const MAX_ROOM_LENGTH = 80;
const MAX_SENDER_LENGTH = 40;
const MAX_TEXT_LENGTH = 200;

const requireField = (
  value: unknown,
  label: string,
  maxLength: number,
): string => {
  const text = typeof value === 'string' ? value.trim() : '';

  if (!text) {
    throw new HttpError(400, `${label} 값이 필요합니다.`);
  }

  return text.slice(0, maxLength);
};

/**
 * Stable key for a person inside a chat room.
 *
 * A device bot (MessengerBot R and similar) only sees the room title and the
 * sender nickname, never the Kakao `botUserKey`, so the room/nickname pair
 * stands in for it. Changing the nickname creates a new key, which is why the
 * operator can rename or deactivate members from the admin screen.
 */
export const deviceBridgeKey = (room: string, sender: string): string =>
  `device:${room.trim()}:${sender.trim()}`;

export interface DeviceMessage {
  room: unknown;
  sender: unknown;
  text: unknown;
}

export interface DeviceBridgeOptions {
  appUrl?: string;
  now?: Date;
}

/**
 * Handles one message captured by a device bot and returns the plain reply text.
 *
 * Routing, commands and database writes are the same code the official Kakao
 * skill uses, so `!가입`, `!출석`, `!내정보`, `!이벤트`, `!이벤트참여` and
 * `!사용법` behave identically in both setups.
 */
export const handleDeviceMessage = async (
  message: DeviceMessage,
  database: AppDatabase | null,
  options: DeviceBridgeOptions = {},
): Promise<string> => {
  const room = requireField(message.room, '방', MAX_ROOM_LENGTH);
  const sender = requireField(message.sender, '보낸 사람', MAX_SENDER_LENGTH);
  const text = requireField(message.text, '메시지', MAX_TEXT_LENGTH);

  const reply = await handleBotMessage(
    {
      utterance: text,
      botUserKey: deviceBridgeKey(room, sender),
      displayName: sender,
      appUrl: options.appUrl,
      now: options.now,
    },
    database,
  );

  return reply.text;
};
