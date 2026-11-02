import type en from './locales/en';

/** A plain string, or plural forms chosen by Intl.PluralRules from the `n` parameter. */
export type Message = string | ({ other: string } & Partial<Record<Intl.LDMLPluralRule, string>>);

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, Message>;

/**
 * A message stored for later translation, e.g. in the activity log, so it is shown in the
 * language chosen when it is read rather than when it was written.
 */
export interface Msg {
  k: MessageKey;
  p?: Record<string, MsgParam>;
}
export type MsgParam = string | number | Msg;

export const msg = (k: MessageKey, p?: Msg['p']): Msg => (p ? { k, p } : { k });
