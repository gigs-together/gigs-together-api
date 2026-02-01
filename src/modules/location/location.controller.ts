import { Controller, Get, Version } from '@nestjs/common';
import { LocationService } from './location.service';
import type { Country } from './types/location.types';
import type { SupportedLanguage } from './types/language.types';

@Controller('location')
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Version('1')
  @Get('countries')
  getCountriesV1(): Promise<readonly Country[]> {
    return this.locationService.getCountriesV1();
  }

  @Version('1')
  @Get('languages')
  getLanguagesV1(): Promise<readonly SupportedLanguage[]> {
    return this.locationService.getLanguagesV1();
  }
}
