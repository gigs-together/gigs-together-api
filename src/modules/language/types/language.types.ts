export type LanguageIso = 'en' | 'es' | 'ru';

export interface SupportedLanguage {
  readonly iso: LanguageIso;
  /**
   * Default language name in its own language (e.g. "Русский", "Español").
   */
  readonly name: string;
  readonly isActive: boolean;
  readonly order: number;
}
