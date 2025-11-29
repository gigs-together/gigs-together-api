import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Status } from './types/status.enum';

@Schema({ _id: false })
export class GigPhoto {
  @Prop({ type: String, required: false })
  url?: string;

  @Prop({ type: String, required: false })
  tgFileId?: string;
}

export const GigPhotoSchema = SchemaFactory.createForClass(GigPhoto);

@Schema()
export class Gig {
  @Prop({ type: String, default: 'Unknown Gig' })
  title: string;

  @Prop({ type: Number })
  date: number;

  @Prop({ type: String })
  location: string;

  @Prop({ type: String })
  ticketsUrl: string;

  @Prop({
    type: GigPhotoSchema,
    required: false,
    validate: {
      validator: (v?: GigPhoto) => {
        if (!v) return true;
        return !!v.url || !!v.tgFileId;
      },
      message: 'photo must have at least one of: url or tgFileId',
    },
  })
  photo?: GigPhoto;

  @Prop({ type: String, enum: Status, default: Status.New })
  status: Status;
}

export type GigDocument = HydratedDocument<Gig>;
export const GigSchema = SchemaFactory.createForClass(Gig);
