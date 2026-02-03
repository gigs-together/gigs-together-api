import type { LanguageIso } from '../language.types';
import type { TranslationFormat } from '../../translation.schema';

export interface V1LanguageGetTranslationsRequest {
  readonly acceptLanguage: LanguageIso | undefined;
  readonly namespacesQuery: string | readonly string[] | undefined;
}

export interface V1TranslationValue {
  readonly value: string;
  readonly format: TranslationFormat;
}

export interface V1LanguageGetTranslationsResponseBody {
  /**
   * Effective locale used for the response.
   * May differ from the requested `accept-language` if it's unsupported/inactive.
   */
  readonly locale: LanguageIso;
  /**
   * Grouped by namespace.
   * Translations without an explicit namespace are placed under "default".
   */
  readonly translations: Readonly<
    Record<string, Readonly<Record<string, V1TranslationValue>>>
  >;
}
