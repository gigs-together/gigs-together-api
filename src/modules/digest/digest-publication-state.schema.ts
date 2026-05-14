import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * Latest successful digest Telegram publish for this API (single-row snapshot, not history).
 */
@Schema()
export class DigestPublicationState {
  @Prop({ type: Date, required: true })
  publishedAt: Date;

  @Prop({ type: String, required: true })
  postUrl: string;
}

export type DigestPublicationStateDocument =
  HydratedDocument<DigestPublicationState>;

export const DigestPublicationStateSchema = SchemaFactory.createForClass(
  DigestPublicationState,
);
