type CountryIso = string;

export interface Country {
  readonly iso: CountryIso;
}

export interface City {
  readonly code: string;
  readonly country: string;
}
