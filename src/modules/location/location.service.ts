import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { Country } from './types/country.types';
import type { CountryDocument } from './location.schema';
import { Country as CountrySchema } from './location.schema';
import type { SupportedLanguage } from './types/language.types';
import type { LanguageDocument } from './language.schema';
import { Language as LanguageSchema } from './language.schema';

@Injectable()
export class LocationService {
  constructor(
    @InjectModel(CountrySchema.name)
    private readonly countryModel: Model<CountryDocument>,
    @InjectModel(LanguageSchema.name)
    private readonly languageModel: Model<LanguageDocument>,
  ) {}

  async getCountriesV1(): Promise<readonly Country[]> {
    return this.countryModel
      .find({}, { _id: 0, iso: 1, name: 1 })
      .sort({ iso: 1 })
      .lean()
      .exec();
  }

  async getLanguagesV1(): Promise<readonly SupportedLanguage[]> {
    return this.languageModel
      .find(
        { isActive: true },
        { _id: 0, iso: 1, name: 1, isActive: 1, order: 1 },
      )
      .sort({ order: 1, iso: 1 })
      .lean()
      .exec();
  }
}
