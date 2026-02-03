import { Controller, Get, Headers, Query, Version } from '@nestjs/common';
import { LanguageService } from './language.service';
import type { SupportedLanguage } from './types/language.types';
import { V1LanguageGetTranslationsResponseBody } from './types/requests/v1-language-get-translations-request';

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
    @Headers('accept-language') acceptLanguage: string | undefined,
  ): Promise<V1LanguageGetTranslationsResponseBody> {
    return this.languageService.getTranslationsV1({
      acceptLanguage,
      namespacesQuery,
    });
  }
}
