import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import type { CountryNameTranslations } from './types/country.types';

@Schema()
export class Country {
  @Prop({ required: true, unique: true })
  iso: string; // "ES"

  @Prop({
    type: {
      en: { type: String, required: true },
      es: { type: String, required: true },
      ru: { type: String, required: true },
    },
    required: true,
  })
  name: CountryNameTranslations;
}

export type CountryDocument = HydratedDocument<Country>;
export const CountrySchema = SchemaFactory.createForClass(Country);
