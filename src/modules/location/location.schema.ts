import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import type {
  CityNameTranslations,
  CountryNameTranslations,
} from './types/location.types';

@Schema()
export class Country {
  @Prop({ required: true, unique: true })
  iso: string; // "ES"

  @Prop({ type: Map, of: String, required: true })
  name: CountryNameTranslations;
}

export type CountryDocument = HydratedDocument<Country>;
export const CountrySchema = SchemaFactory.createForClass(Country);

@Schema()
export class City {
  @Prop({ required: true })
  code: string;

  @Prop({ required: true })
  country: string; // iso code: e.g. "ES"

  @Prop({ type: Map, of: String, required: true })
  name: CityNameTranslations;
  // { en: "Madrid", es: "Madrid", ru: "Мадрид" }
}

export type CityDocument = HydratedDocument<City>;
export const CitySchema = SchemaFactory.createForClass(City);

CitySchema.index({ country: 1, code: 1 }, { unique: true });
