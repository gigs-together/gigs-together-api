export type CountryNameTranslations = Record<string, string>;

export interface Country {
  readonly iso: string;
  readonly name: CountryNameTranslations;
}

export type CityNameTranslations = Record<string, string>;

export interface City {
  readonly code: string;
  readonly country: string;
  readonly name: CityNameTranslations;
}
