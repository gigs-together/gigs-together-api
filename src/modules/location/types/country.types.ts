export interface CountryNameTranslations {
  readonly en: string;
  readonly es: string;
  readonly ru: string;
}

export interface Country {
  readonly iso: string;
  readonly name: CountryNameTranslations;
}
