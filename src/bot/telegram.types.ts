export type TelegramUser = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

export type TelegramChat = {
  id: number;
  type: string;
  title?: string;
};

export type TelegramVideoNote = {
  file_id: string;
  file_unique_id?: string;
  length: number;
  duration: number;
  file_size?: number;
};

export type TelegramPhotoSize = {
  file_id: string;
  file_unique_id?: string;
  width: number;
  height: number;
  file_size?: number;
};

export type TelegramContact = {
  phone_number: string;
  first_name: string;
  last_name?: string;
  user_id?: number;
  vcard?: string;
};

export type TelegramMessage = {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  contact?: TelegramContact;
  video_note?: TelegramVideoNote;
  photo?: TelegramPhotoSize[];
};

export type TelegramCallbackQuery = {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};
