import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Status } from './types/status.enum';

@Schema({ _id: false })
export class GigPoster {
  @Prop({ type: String, required: false })
  bucketPath?: string;

  // Original external URL (if uploaded from a remote source)
  @Prop({ type: String, required: false })
  externalUrl?: string;

  @Prop({ type: String, required: false })
  tgFileId?: string;
}

export const GigPosterSchema = SchemaFactory.createForClass(GigPoster);

@Schema()
export class Gig {
  /**
   * Public stable identifier for URLs/anchors.
   *
   * IMPORTANT:
   * - This is NOT MongoDB `_id`.
   * - We keep it ASCII-friendly (slug + YYYY-MM-DD).
   */
  @Prop({ type: String, required: true })
  publicId: string;

  @Prop({ type: String, default: 'Unknown Gig' })
  title: string;

  @Prop({ type: Number })
  date: number; // timestamp

  @Prop({ type: String })
  city: string; // city code

  /**
   * ISO 3166-1 alpha-2 code (uppercase), e.g. "ES", "US".
   */
  @Prop({ type: String })
  country: string;

  @Prop({ type: String })
  venue: string; // venue name

  @Prop({ type: String })
  ticketsUrl: string;

  @Prop({
    type: GigPosterSchema,
    required: false,
    validate: {
      validator: (v?: GigPoster) => {
        if (!v) return true;
        return !!v.bucketPath || !!v.tgFileId;
      },
      message: 'poster must have at least one of: bucketPath or tgFileId',
    },
  })
  poster?: GigPoster;

  @Prop({ type: String, enum: Status, default: Status.New })
  status: Status;
}

export type GigDocument = HydratedDocument<Gig>;
export const GigSchema = SchemaFactory.createForClass(Gig);

// Unique public id for anchoring/sharing.
GigSchema.index({ publicId: 1 }, { unique: true });

GigSchema.index(
  { country: 1, city: 1 },
  { collation: { locale: 'en', strength: 2 } },
);
