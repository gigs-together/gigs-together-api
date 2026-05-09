import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  TGMessage,
  TGSendMessage,
  TGSendPhoto,
  TGChatId,
} from './types/message.types';
import type { GigDocument, GigPost } from '../gig/gig.schema';
import type { TGAnswerCallbackQuery } from './types/update.types';
import { Action } from './types/action.enum';
import { TGChat } from './types/chat.types';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PostType } from '../gig/types/postType.enum';
import { logError } from '../../shared/utils/logging';
import { TelegramBotClient } from './telegram-bot.client';
import { TelegramAuthService } from './telegram-auth.service';
import type { TelegramInitDataParseResult } from './telegram-auth.service';
import type { TelegramLoginWidgetValidationPayload } from './types/telegram-login-widget-validation-payload';
import {
  TelegramPostComposer,
  TelegramGigPostEditKind,
  WeeklyDigestMainChannelSendKind,
  WeeklyDigestMainChannelSendPlan,
} from './telegram-post-composer.service';
import type {
  GetPostUrlPayload,
  PublishPayload,
} from './telegram-post-composer.service';

export { WEEKLY_DIGEST_EMPTY_CHANNEL_MESSAGE_EN } from './telegram-post-composer.service';

interface EditSubmissionFeedbackPayload {
  chatId: TGChatId;
  messageId: number;
  title: string;
  status: string;
  url?: string;
}

interface HandleAfterPublishPayload {
  suggestedBy: GigDocument['suggestedBy'];
  moderationPost: {
    chatId: TGChatId;
    messageId: TGMessage['message_id'];
  };
  publishPost: {
    chatId: TGChatId;
    username: TGChat['username'];
    messageId: TGMessage['message_id'];
  };
  title: string;
  publicId?: string;
}

@Injectable()
export class TelegramService {
  constructor(
    @Inject(CACHE_MANAGER) private cache: Cache,
    private readonly telegramAuthService: TelegramAuthService,
    private readonly telegramBotClient: TelegramBotClient,
    private readonly telegramPostComposer: TelegramPostComposer,
  ) {}

  private readonly logger = new Logger(TelegramService.name);

  private static readonly CHAT_ERROR_TTL_MS = 60_000 * 5;

  async send(
    payload: TGSendMessage | TGSendPhoto,
    gigId?: string,
  ): Promise<TGMessage | undefined> {
    return this.telegramBotClient.send(payload, gigId);
  }

  async sendMessage(payload: TGSendMessage): Promise<TGMessage> {
    return this.telegramBotClient.sendMessage(payload);
  }

  async answerCallbackQuery(payload: TGAnswerCallbackQuery): Promise<void> {
    return this.telegramBotClient.answerCallbackQuery(payload);
  }

  async editModerationPost(
    gig: GigDocument,
    opts?: { updateMedia?: boolean },
  ): Promise<TGMessage | undefined> {
    const composed = this.telegramPostComposer.composeModerationPostEdit(
      gig,
      opts,
    );
    if (!composed) return;

    switch (composed.kind) {
      case TelegramGigPostEditKind.Media:
        return this.telegramBotClient.editMessageMedia(composed.payload);
      case TelegramGigPostEditKind.Caption:
        return this.telegramBotClient.editMessageCaption(composed.payload);
      case TelegramGigPostEditKind.Text:
        return this.telegramBotClient.editMessageText(composed.payload);
    }
  }

  /**
   * Updates an already published post in the main channel (caption/text).
   * Does nothing if the gig has no stored post reference.
   *
   * NOTE: Can optionally update the media (poster) via editMessageMedia.
   */
  async editMainPost(
    gig: GigDocument,
    opts?: { updateMedia?: boolean },
  ): Promise<TGMessage | undefined> {
    const composed = this.telegramPostComposer.composeMainPostEdit(gig, opts);
    if (!composed) return;

    switch (composed.kind) {
      case TelegramGigPostEditKind.Media:
        return this.telegramBotClient.editMessageMedia(composed.payload);
      case TelegramGigPostEditKind.Caption:
        return this.telegramBotClient.editMessageCaption(composed.payload);
      case TelegramGigPostEditKind.Text:
        return this.telegramBotClient.editMessageText(composed.payload);
    }
  }

  parseTelegramInitDataString(initData: string): TelegramInitDataParseResult {
    return this.telegramAuthService.parseTelegramInitDataString(initData);
  }

  validateTelegramInitData(
    dataCheckString: string,
    receivedHash: string,
  ): void {
    return this.telegramAuthService.validateTelegramInitData(
      dataCheckString,
      receivedHash,
    );
  }

  validateTelegramInitDataAuthDate(authDateRaw: string | undefined): void {
    return this.telegramAuthService.validateTelegramInitDataAuthDate(
      authDateRaw,
    );
  }

  validateTelegramLoginWidget(
    payload: TelegramLoginWidgetValidationPayload,
  ): void {
    return this.telegramAuthService.validateTelegramLoginWidget(payload);
  }

  validateTelegramLoginWidgetAuthDate(authDateSec: number): void {
    return this.telegramAuthService.validateTelegramLoginWidgetAuthDate(
      authDateSec,
    );
  }

  pickTgPost(
    posts: GigPost[] | undefined,
    type: PostType,
  ): GigPost | undefined {
    return this.telegramPostComposer.pickTgPost(posts, type);
  }

  private publish(payload: PublishPayload): Promise<TGMessage> {
    const { caption, message, photo, gigId } = payload;

    return this.telegramBotClient.send(
      {
        text: caption,
        caption,
        photo,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...message,
      },
      gigId,
    );
  }

  async publishWeeklyDigestToMainChannel(
    gigs: readonly GigDocument[],
  ): Promise<void> {
    const chatIdRaw = process.env.MAIN_CHANNEL_ID;
    const chatId =
      chatIdRaw !== undefined && chatIdRaw !== null
        ? String(chatIdRaw).trim()
        : '';

    if (!chatId) {
      this.logger.warn(
        'publishWeeklyDigestToMainChannel skipped: MAIN_CHANNEL_ID is empty',
      );
      return;
    }

    try {
      const plan: WeeklyDigestMainChannelSendPlan =
        this.telegramPostComposer.composeWeeklyDigestMainChannelSendPlan({
          chatId,
          gigs,
        });

      switch (plan.kind) {
        case WeeklyDigestMainChannelSendKind.SendMessage:
          await this.telegramBotClient.sendMessage(plan.payload);
          return;
        case WeeklyDigestMainChannelSendKind.SendPhoto:
          await this.telegramBotClient.sendPhoto(plan.payload);
          return;
        case WeeklyDigestMainChannelSendKind.SendMediaGroup:
          await this.telegramBotClient.sendMediaGroup(plan.payload);
          return;
      }
    } catch (e: unknown) {
      logError(this.logger, {
        error: e,
        note: 'Weekly digest publish to main channel failed',
        context: TelegramService.name,
      });
      throw e;
    }
  }

  publishMain(gig: GigDocument): Promise<TGMessage> {
    return this.publish(this.telegramPostComposer.composeMainPost(gig));
  }

  async sendToModeration(gig: GigDocument): Promise<TGMessage> {
    return this.publish(this.telegramPostComposer.composeModerationPost(gig));
  }

  async handleAfterPublish(payload: HandleAfterPublishPayload) {
    const { suggestedBy, moderationPost, publishPost, title, publicId } =
      payload;
    const editGigUrl = publicId
      ? this.telegramPostComposer.buildEditGigUrl(publicId)
      : undefined;

    const publishPostChatIdUrl = this.telegramPostComposer.getPostUrl({
      messageId: publishPost.messageId,
      chatId: publishPost.chatId,
    });

    const replyButtons = [
      publishPostChatIdUrl
        ? {
            text: '🔗 Post',
            url: publishPostChatIdUrl,
          }
        : undefined,
      editGigUrl
        ? {
            text: '✏️ Edit',
            url: editGigUrl,
          }
        : undefined,
    ].filter(Boolean);

    const replyMarkup =
      replyButtons.length > 0
        ? {
            inline_keyboard: [replyButtons],
          }
        : undefined;

    // Clean moderation post content & keep only Edit button.
    // NOTE: Telegram can't remove media from a photo message via edit APIs,
    // so the poster will remain, but the caption/text will be cleaned.
    await this.telegramBotClient.editMessageCaption({
      chatId: moderationPost.chatId,
      messageId: moderationPost.messageId,
      caption: title,
      parseMode: 'HTML',
      disableWebPagePreview: true,
      replyMarkup,
    });

    const publishPostUsernameUrl = this.telegramPostComposer.getPostUrl({
      chatUsername: publishPost.username,
      messageId: publishPost.messageId,
    });

    await this.editSubmissionFeedback({
      chatId: suggestedBy.userId,
      messageId: suggestedBy.feedbackMessageId,
      title,
      status: 'Published',
      url: publishPostUsernameUrl,
    });
  }

  async handlePostReject({ suggestedBy, moderationMessage, gigId, title }) {
    await this.telegramBotClient.editMessageReplyMarkup({
      chatId: moderationMessage.chatId,
      messageId: moderationMessage.messageId,
      replyMarkup: {
        inline_keyboard: [
          [
            {
              text: '❌ Rejected',
              callback_data: `${Action.Rejected}:${gigId}`,
            },
          ],
        ],
        // TODO: reason for rejection
        // force_reply: true,
        // input_field_placeholder: 'Reason?',
      },
    });

    await this.editSubmissionFeedback({
      chatId: suggestedBy.userId,
      messageId: suggestedBy.feedbackMessageId,
      title,
      status: 'Rejected',
    });
  }

  private editSubmissionFeedback(
    payload: EditSubmissionFeedbackPayload,
  ): Promise<TGMessage> {
    const { chatId, messageId, title, status, url } = payload;
    if (!chatId || !messageId) return;

    return this.telegramBotClient.editMessageCaption({
      chatId,
      messageId,
      caption: `${title} is ${status}`,
      replyMarkup: url
        ? {
            inline_keyboard: [
              [
                {
                  text: '🔗 Post',
                  url,
                },
              ],
            ],
          }
        : undefined,
    });
  }

  async sendSubmissionFeedback(
    gig: GigDocument,
    chatId: TGChatId,
  ): Promise<TGMessage> {
    return this.publish(
      this.telegramPostComposer.composeSubmissionFeedbackPost(gig, chatId),
    );
  }

  public async getChatUsername(
    chatId: TGChat['id'],
  ): Promise<TGChat['username']> {
    const chatKey = `chat:${chatId}`;
    const errorKey = `chat-error:${chatId}`;

    const cachedChat = await this.cache.get<TGChat>(chatKey);
    if (cachedChat) return cachedChat.username;

    const cachedError = await this.cache.get<boolean>(errorKey);
    if (cachedError) return undefined;

    try {
      const chat = await this.telegramBotClient.getChat(chatId);
      await this.cache.set(chatKey, chat);
      return chat.username;
    } catch (e: unknown) {
      logError(this.logger, {
        error: e,
        note: 'Error getting chat username',
        context: TelegramService.name,
        meta: { chatId },
      });
      await this.cache.set(errorKey, true, TelegramService.CHAT_ERROR_TTL_MS);
      return undefined;
    }
  }

  getPostUrl(payload: GetPostUrlPayload): string | undefined {
    return this.telegramPostComposer.getPostUrl(payload);
  }
}
