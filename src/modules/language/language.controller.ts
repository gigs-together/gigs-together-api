import { Controller, Get, Headers, Query, Version } from '@nestjs/common';
import { LanguageService } from './language.service';
import type { LanguageIso, SupportedLanguage } from './types/language.types';

@Controller('language')
export class LanguageController {
  constructor(private readonly languageService: LanguageService) {}

  @Version('1')
  @Get()
  getLanguagesV1(): Promise<readonly SupportedLanguage[]> {
    return this.languageService.getLanguagesV1();
  }

  @Version('1')
  @Get('translations')
  getTranslationsV1(
    @Query('namespaces')
    namespacesQuery: string | readonly string[] | undefined,
    @Headers('accept-language') acceptLanguage: LanguageIso | undefined,
  ) {
    return this.languageService.getTranslationsV1({
      acceptLanguage,
      namespacesQuery,
    });
  }
}
