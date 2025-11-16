import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Status } from '../gig/types/status.enum';

@Schema()
export class Gig {
  @Prop({ default: 'Unknown Gig' })
  title: string;

  @Prop()
  date: number;

  @Prop()
  location: string;

  @Prop()
  ticketsUrl: string;

  @Prop({ default: Status.pending })
  status: Status;
}

export type GigDocument = HydratedDocument<Gig>;
export const GigSchema = SchemaFactory.createForClass(Gig);
