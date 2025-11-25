import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Status } from './types/status.enum';

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

  @Prop({ type: String, enum: Status, default: Status.Pending })
  status: Status;
}

export type GigDocument = HydratedDocument<Gig>;
export const GigSchema = SchemaFactory.createForClass(Gig);
