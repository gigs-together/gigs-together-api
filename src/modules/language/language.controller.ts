import { Controller, Get, Version } from '@nestjs/common';
import { LanguageService } from './language.service';
import type { SupportedLanguage } from './types/language.types';

@Controller('language')
export class LanguageController {
  constructor(private readonly languageService: LanguageService) {}

  @Version('1')
  @Get()
  getLanguagesV1(): Promise<readonly SupportedLanguage[]> {
    return this.languageService.getLanguagesV1();
  }
}
