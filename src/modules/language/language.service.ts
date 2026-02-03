import { Injectable } from '@nestjs/common';
import { SupportedLanguage } from './types/language.types';
import { InjectModel } from '@nestjs/mongoose';
import { LanguageDocument, Language } from './language.schema';
import { Model } from 'mongoose';

@Injectable()
export class LanguageService {
  constructor(
    @InjectModel(Language.name)
    private readonly languageModel: Model<LanguageDocument>,
  ) {}

  getLanguagesV1(): Promise<readonly SupportedLanguage[]> {
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
