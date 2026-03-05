import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { TGChatId, TGMessage } from '../telegram/types/message.types';
import { GigService } from '../gig/gig.service';
import {
  CreateGigInput,
  GigFormDataByPublicId,
  GigId,
} from '../gig/types/gig.types';
import { Status } from '../gig/types/status.enum';
import type { TGCallbackQuery } from '../telegram/types/update.types';
import { TelegramService } from '../telegram/telegram.service';
import { Action } from '../telegram/types/action.enum';
import { getBiggestTgPhotoFileId } from '../telegram/utils/photo';
import { V1ReceiverCreateGigRequestBodyValidated } from './types/requests/v1-receiver-create-gig-request';
import { CalendarService } from '../calendar/calendar.service';
import { Messenger } from '../gig/types/messenger.enum';
import { PostType } from '../gig/types/postType.enum';
import type { UpdateQuery } from 'mongoose';
import type { Gig } from '../gig/gig.schema';
import type {
  V1ReceiverGetGigForEditRequestBodyValidated,
  V1ReceiverUpdateGigByPublicIdResponseBody,
} from './types/requests/v1-receiver-gig-by-public-id-request';
// import { NodeHttpHandler } from '@smithy/node-http-handler';

enum Command {
  Start = 'start',
}

interface HandleGigApprovePayload {
  gigId: GigId;
  moderationPost: {
    chatId: TGChatId;
    messageId: TGMessage['message_id'];
  };
}

@Injectable()
export class ReceiverService {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly gigService: GigService,
    private readonly calendarService: CalendarService,
  ) {}

  private readonly logger = new Logger(ReceiverService.name);

  private formatCallbackQueryError(e: any): string {
    const data = e?.response?.data;
    const tgDescription: string | undefined = data?.description;
    if (tgDescription) return `Failed: ${tgDescription}`;

    if (e instanceof BadRequestException) {
      const res = e.getResponse() as unknown;
      const msg =
        typeof res === 'string'
          ? res
          : typeof res === 'object' && res !== null && 'message' in res
            ? Array.isArray((res as { message?: unknown }).message)
              ? (res as { message: string[] }).message.join(', ')
              : String((res as { message?: unknown }).message ?? e.message)
            : e.message;
      return `Failed: ${String(msg)}`;
    }

    if (e instanceof Error) return `Failed: ${e.message}`;
    return 'Failed: unknown error';
  }

  async handleMessage(message: TGMessage): Promise<void> {
    const chatId = message?.chat?.id;
    if (!chatId) {
      return;
    }

    const text = message.text || '';

    if (text.charAt(0) !== '/') {
      await this.telegramService.sendMessage({
        chat_id: chatId,
        text: `At the moment, the bot can't receive messages. If you have an issue, feel free to contact the admins here: `,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'Contact "Gigs Together!"',
                url: process.env.DIRECT_MESSAGES_URL,
              },
            ],
          ],
        },
      });
      return;
    }

    const command = text.substring(1).toLowerCase();
    await this.handleCommand(command, chatId);
  }

  private async handleCommand(command: string, chatId: number) {
    switch (command) {
      case Command.Start: {
        await this.telegramService.sendMessage({
          chat_id: chatId,
          text: `Hi! I'm a Gigs Together bot. I am still in development...`,
        });
        break;
      }
      default: {
        await this.telegramService.sendMessage({
          chat_id: chatId,
          text: `Hey there, I don't know that command.`,
        });
      }
    }
  }

  // TODO: move to telegram module and use dependency injection?
  private async processCallbackQueryOrThrow(
    callbackQuery: TGCallbackQuery,
  ): Promise<void> {
    const [action, data] = callbackQuery.data.split(':');
    // TODO: some more security?
    switch (action) {
      case Action.Approve: {
        await this.handleGigApprove({
          gigId: data,
          moderationPost: {
            messageId: callbackQuery.message.message_id,
            chatId: callbackQuery.message.chat.id,
          },
        });
        break;
      }
      case Action.Reject: {
        await this.handleGigReject({
          gigId: data,
          messageId: callbackQuery.message.message_id,
          chatId: callbackQuery.message.chat.id,
        });
        break;
      }
      case Action.Rejected: {
        const text = "There's no action for Rejected yet.";
        await this.telegramService.answerCallbackQuery({
          callback_query_id: callbackQuery.id,
          text,
          show_alert: false,
        });
        return;
      }
      case Action.Status: {
        await this.telegramService.answerCallbackQuery({
          callback_query_id: callbackQuery.id,
          text: data ? `Status is ${data}` : undefined,
          show_alert: false,
        });
        return;
      }
      default: {
        await this.telegramService.answerCallbackQuery({
          callback_query_id: callbackQuery.id,
          text: 'Something unexpected happened, I dunno what to do',
          show_alert: true,
        });
        return;
      }
    }

    await this.telegramService.answerCallbackQuery({
      callback_query_id: callbackQuery.id,
      text: 'Done!',
      show_alert: false,
    });
  }

  async handleCallbackQuery(callbackQuery: TGCallbackQuery): Promise<void> {
    try {
      await this.processCallbackQueryOrThrow(callbackQuery);
    } catch (e) {
      this.logger.warn(
        `handleCallbackQuery failed: ${JSON.stringify(
          e?.response?.data ?? e?.message ?? e,
        )}`,
      );
      await this.telegramService.answerCallbackQuery({
        callback_query_id: callbackQuery.id,
        text: this.formatCallbackQueryError(e),
        show_alert: true,
      });
    }
  }

  async handleGigSubmit(
    body: V1ReceiverCreateGigRequestBodyValidated,
    posterFile: Express.Multer.File | undefined,
  ): Promise<void> {
    const date = new Date(body.gig.date);
    const yyyyMmDd = date.toISOString().split('T')[0];
    const publicId = await this.gigService.generateUniquePublicId({
      title: body.gig.title,
      yyyyMmDd,
    });

    const explicitPosterUrl = (body.gig.posterUrl ?? '').trim() || undefined;
    const defaultPosterUrl =
      (process.env.DEFAULT_GIG_POSTER_URL ?? '').trim() || undefined;
    const posterUrl =
      explicitPosterUrl ?? (posterFile ? undefined : defaultPosterUrl);

    const poster = await this.gigService.uploadPoster({
      url: posterUrl,
      file: posterFile,
      context: {
        date: body.gig.date,
        city: body.gig.city,
        country: body.gig.country,
        publicId,
      },
    });

    const gig: CreateGigInput = {
      publicId,
      title: body.gig.title,
      date: body.gig.date,
      city: body.gig.city,
      country: body.gig.country,
      venue: body.gig.venue,
      ticketsUrl: body.gig.ticketsUrl,
      poster,
      suggestedBy: { userId: body.user.tgUser.id },
    };

    if (body.gig.endDate && body.gig.endDate !== body.gig.date) {
      gig.endDate = body.gig.endDate;
    }

    const savedGig = await this.gigService.saveGig(gig);
    let res: TGMessage | undefined;
    try {
      res = await this.telegramService.sendToModeration(savedGig);
    } catch (e) {
      // Publishing to Telegram shouldn't block gig creation.
      this.logger.warn(
        `publishDraft failed: ${JSON.stringify(e?.response?.data ?? e?.message ?? e)}`,
      );
      res = undefined;
    }

    const biggestTgPhotoFileId = getBiggestTgPhotoFileId(res?.photo);

    const moderationChatId = res?.sender_chat?.id ?? res?.chat?.id;
    const moderationMessageId = res?.message_id;

    const updateGigPayload: UpdateQuery<Gig> = {
      status: Status.Pending,
    };

    if (moderationChatId && moderationMessageId) {
      updateGigPayload.$push = {
        posts: {
          id: moderationMessageId,
          chatId: moderationChatId,
          fileId: biggestTgPhotoFileId,
          to: Messenger.Telegram,
          type: PostType.Moderation,
        },
      };
    }

    // Notify the author in DM.
    // NOTE: Telegram may reject sending DMs if the user hasn't started the bot.
    const authorTelegramId = body.user?.tgUser?.id;
    if (authorTelegramId) {
      try {
        const res: TGMessage =
          await this.telegramService.sendSubmissionFeedback(
            savedGig,
            authorTelegramId,
          );
        updateGigPayload['suggestedBy.feedbackMessageId'] = res.message_id;
      } catch (e) {
        // DM notification shouldn't block gig creation.
        this.logger.warn(
          `notifyAuthorInDm failed: ${JSON.stringify(e?.response?.data ?? e?.message ?? e)}`,
        );
      }
    }

    try {
      await this.gigService.updateGig(savedGig._id, updateGigPayload);
    } catch (e) {
      this.logger.error(
        'updateGig failed',
        e instanceof Error ? e.stack : undefined,
      );
    }
  }

  getGigForEdit(
    payload: V1ReceiverGetGigForEditRequestBodyValidated,
  ): Promise<GigFormDataByPublicId> {
    if (payload.user?.isAdmin !== true) {
      throw new ForbiddenException('Admin privileges required');
    }
    return this.gigService.getGigFormDataByPublicId(payload.publicId);
  }

  async updateGigByPublicId(payload: {
    publicId: string;
    body: V1ReceiverCreateGigRequestBodyValidated;
    posterFile: Express.Multer.File | undefined;
  }): Promise<V1ReceiverUpdateGigByPublicIdResponseBody> {
    const { publicId, body, posterFile } = payload;

    if (body.user?.isAdmin !== true) {
      throw new ForbiddenException('Admin privileges required');
    }

    const dateMs = new Date(body.gig.date).getTime();

    const endDateMs =
      body.gig.endDate && body.gig.endDate !== body.gig.date
        ? new Date(body.gig.endDate).getTime()
        : undefined;

    const poster = await this.gigService.uploadPoster({
      url: body.gig.posterUrl,
      file: posterFile,
      context: {
        date: body.gig.date,
        city: body.gig.city,
        country: body.gig.country,
        publicId,
      },
    });

    const update: UpdateQuery<Gig> = {
      title: body.gig.title,
      date: dateMs,
      city: body.gig.city,
      country: body.gig.country,
      venue: body.gig.venue,
      ticketsUrl: body.gig.ticketsUrl,
    };

    if (endDateMs) {
      update.endDate = endDateMs;
    } else {
      update.$unset = { ...(update.$unset ?? {}), endDate: 1 };
    }

    if (poster) {
      update.poster = poster;
    }

    const updatedGig = await this.gigService.updateGigByPublicId(
      publicId,
      update,
    );

    switch (updatedGig.status) {
      case Status.New:
      case Status.Rejected:
      case Status.Approved:
      case Status.Pending: {
        try {
          const edited = await this.telegramService.editModerationPost(
            updatedGig,
            {
              updateMedia: !!poster,
            },
          );

          if (poster && edited?.photo?.length) {
            const newFileId = getBiggestTgPhotoFileId(edited.photo);
            if (newFileId) {
              try {
                await this.gigService.updateTelegramPostFileId({
                  gigId: updatedGig._id,
                  type: PostType.Moderation,
                  fileId: newFileId,
                });
              } catch (e) {
                this.logger.warn(
                  `updateTelegramPostFileId (Moderation) failed for publicId=${publicId}: ${JSON.stringify(
                    e?.response?.data ?? e?.message ?? e,
                  )}`,
                );
              }
            }
          }
        } catch (e) {
          // Telegram failures must not break the update flow.
          this.logger.warn(
            `editModerationPost failed for publicId=${publicId}: ${JSON.stringify(
              e?.response?.data ?? e?.message ?? e,
            )}`,
          );
        }
        break;
      }
      case Status.Published: {
        try {
          const edited = await this.telegramService.editMainPost(updatedGig, {
            updateMedia: !!poster,
          });

          if (poster && edited?.photo?.length) {
            const newFileId = getBiggestTgPhotoFileId(edited.photo);
            if (newFileId) {
              try {
                await this.gigService.updateTelegramPostFileId({
                  gigId: updatedGig._id,
                  type: PostType.Publish,
                  fileId: newFileId,
                });
              } catch (e) {
                this.logger.warn(
                  `updateTelegramPostFileId (Publish) failed for publicId=${publicId}: ${JSON.stringify(
                    e?.response?.data ?? e?.message ?? e,
                  )}`,
                );
              }
            }
          }
        } catch (e) {
          // Telegram failures must not break the update flow.
          this.logger.warn(
            `editMainPost failed for publicId=${publicId}: ${JSON.stringify(
              e?.response?.data ?? e?.message ?? e,
            )}`,
          );
        }
        break;
      }
    }
    return { publicId };
  }

  async handleGigApprove(payload: HandleGigApprovePayload): Promise<void> {
    const { gigId, moderationPost } = payload;
    const updatedGig = await this.gigService.updateGigStatus(
      gigId,
      Status.Approved,
    );
    const tgPublishPost = await this.telegramService.publishMain(updatedGig);

    const publishedChatId =
      tgPublishPost.sender_chat?.id ?? tgPublishPost.chat?.id;
    const publishedMessageId = tgPublishPost.message_id;
    const publishedFileId = getBiggestTgPhotoFileId(tgPublishPost.photo); // but should be the same as in moderation one

    const updateGigPayload: UpdateQuery<Gig> = {
      status: Status.Published,
    };

    if (publishedChatId && publishedMessageId) {
      updateGigPayload.$push = {
        posts: {
          id: publishedMessageId,
          chatId: publishedChatId,
          fileId: publishedFileId,
          to: Messenger.Telegram,
          type: PostType.Publish,
        },
      };
    }

    await this.gigService.updateGig(gigId, updateGigPayload);
    this.logger.log(`Gig #${gigId} approved`);

    // Optional: update the feed cache on the frontend (ISR on-demand).
    await this.revalidateFrontendFeed({
      country: updatedGig.country,
      city: updatedGig.city,
    });

    await this.telegramService.handleAfterPublish({
      title: updatedGig.title,
      publicId: updatedGig.publicId,
      suggestedBy: updatedGig.suggestedBy,
      moderationPost,
      publishPost: {
        username: tgPublishPost.chat.username,
        chatId: tgPublishPost.chat.id,
        messageId: tgPublishPost.message_id,
      },
    });

    const calendarGig = this.gigService.gigToCalendarPayload(updatedGig);
    await this.calendarService.addEvent(calendarGig);
  }

  private buildFeedPath(input: { country: string; city: string }): string {
    const country = (input.country ?? '').trim().toLowerCase();
    const city = (input.city ?? '').trim().toLowerCase();
    if (!country || !city) {
      throw new Error('Missing country/city for feed path');
    }
    return `/feed/${encodeURIComponent(country)}/${encodeURIComponent(city)}`;
  }

  private async revalidateFrontendFeed(input: {
    readonly country?: string;
    readonly city?: string;
  }): Promise<void> {
    const baseUrl = (process.env.APP_BASE_URL ?? '').trim();
    const secret = (process.env.REVALIDATE_SECRET ?? '').trim();
    if (!baseUrl || !secret) return;

    if (!/^https?:\/\//i.test(baseUrl)) {
      this.logger.warn(
        `APP_BASE_URL must be an absolute http(s) URL for revalidation (got "${baseUrl}")`,
      );
      return;
    }

    const url = new URL('/api/revalidate/feed', baseUrl).toString();
    let path: string | undefined;
    try {
      if (input.country && input.city) {
        path = this.buildFeedPath({ country: input.country, city: input.city });
      }
    } catch (e) {
      this.logger.warn(
        `Failed to build feed path for revalidation: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      path = undefined;
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-revalidate-secret': secret,
        },
        body: JSON.stringify(path ? { paths: [path] } : {}),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.warn(
          `Frontend revalidate failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ''}`,
        );
      }
    } catch (e) {
      this.logger.warn(
        `Frontend revalidate request failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  async handleGigReject(payload: {
    gigId: GigId;
    chatId: TGChatId;
    messageId: TGMessage['message_id'];
  }): Promise<void> {
    const { gigId, chatId, messageId } = payload;
    const updatedGig = await this.gigService.updateGigStatus(
      gigId,
      Status.Rejected,
    );
    this.logger.log(`Gig #${gigId} rejected`);

    await this.telegramService.handlePostReject({
      suggestedBy: updatedGig.suggestedBy,
      moderationMessage: { chatId, messageId },
      gigId,
      title: updatedGig.title,
    });
  }
}
