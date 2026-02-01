import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { Country } from './types/country.types';
import type { CountryDocument } from './location.schema';
import { Country as CountrySchema } from './location.schema';

@Injectable()
export class LocationService {
  constructor(
    @InjectModel(CountrySchema.name)
    private readonly countryModel: Model<CountryDocument>,
  ) {}

  async getCountriesV1(): Promise<readonly Country[]> {
    return this.countryModel
      .find({}, { _id: 0, iso: 1, name: 1 })
      .sort({ iso: 1 })
      .lean()
      .exec();
  }
}
