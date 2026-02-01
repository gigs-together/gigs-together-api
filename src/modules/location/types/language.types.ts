export interface SupportedLanguage {
  readonly iso: string;
  /**
   * Default language name in its own language (e.g. "Русский", "Español").
   */
  readonly name: string;
  readonly isActive: boolean;
  readonly order: number;
}
