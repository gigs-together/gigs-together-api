import { Controller, Get, Version } from '@nestjs/common';
import { LocationService } from './location.service';
import type { Country } from './types/location.types';

@Controller('location')
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Version('1')
  @Get('countries')
  getCountriesV1(): Promise<readonly Country[]> {
    return this.locationService.getCountriesV1();
  }
}
