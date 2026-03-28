import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { buildV1FutureGigLookupPrompt } from './prompts/v1-gig-lookup-prompt';
import { V1ReceiverCreateGigRequestBodyGig } from '../receiver/types/requests/v1-receiver-create-gig-request';
import { isRecord } from '../../shared/utils/is-record';

@Injectable()
export class AiService {
  constructor(private readonly configService: ConfigService) {}

  private getAxiosNestedErrorMessage(rawData: unknown): string | undefined {
    if (!isRecord(rawData)) return undefined;
    const err = rawData.error;
    if (!isRecord(err)) return undefined;
    const msg = err.message;
    return typeof msg === 'string' && msg.trim() ? msg.trim() : undefined;
  }

  private normalizeLookUpedGig(
    raw: unknown,
  ): V1ReceiverCreateGigRequestBodyGig {
    if (!isRecord(raw)) {
      throw new InternalServerErrorException(
        'Invalid AI response: expected a JSON object',
      );
    }
    const obj: Record<string, unknown> = raw;

    const title = typeof obj.title === 'string' ? obj.title : '';
    const city = typeof obj.city === 'string' ? obj.city : '';
    const rawCountry = typeof obj.country === 'string' ? obj.country : '';
    const normalizedCountry = rawCountry.trim().toUpperCase();
    const country = /^[A-Z]{2}$/.test(normalizedCountry)
      ? normalizedCountry
      : '';
    const venue = typeof obj.venue === 'string' ? obj.venue : '';
    const ticketsUrl = typeof obj.ticketsUrl === 'string' ? obj.ticketsUrl : '';
    const posterUrl = typeof obj.posterUrl === 'string' ? obj.posterUrl : '';
    const endDateRaw = typeof obj.endDate === 'string' ? obj.endDate : '';

    let date = '';
    if (typeof obj.date === 'string') date = obj.date;
    else if (typeof obj.date === 'number' && Number.isFinite(obj.date)) {
      date = new Date(obj.date).toISOString();
    }

    const endDate = endDateRaw.trim() ? endDateRaw : undefined;

    return {
      title,
      date,
      ...(endDate ? { endDate } : {}),
      city,
      country,
      venue,
      ticketsUrl,
      posterUrl: posterUrl.trim() ? posterUrl : undefined,
    };
  }

  async lookupGigV1(params: {
    name: string;
    location: string;
  }): Promise<V1ReceiverCreateGigRequestBodyGig> {
    const apiKey =
      this.configService.get<string>('AI_API_KEY') ?? process.env.AI_API_KEY;
    if (!apiKey) {
      throw new InternalServerErrorException(
        'AI_API_KEY is not set on the server',
      );
    }

    const model =
      this.configService.get<string>('AI_MODEL') ?? process.env.AI_MODEL;
    if (!model) {
      throw new InternalServerErrorException(
        'AI_MODEL is not set on the server',
      );
    }

    const url = this.configService.get<string>('AI_URL') ?? process.env.AI_URL;
    if (!url) {
      throw new InternalServerErrorException('AI_URL is not set on the server');
    }

    const prompt = buildV1FutureGigLookupPrompt({
      name: params.name,
      place: params.location,
    });

    try {
      const response = await axios.post(
        url,
        {
          model,
          messages: [{ role: 'user', content: prompt }],
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const text: unknown = response.data?.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || text.trim() === '') {
        throw new InternalServerErrorException('AI returned empty response');
      }

      const trimmed = text.trim();
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        // Try to recover if model wrapped JSON in extra text.
        const start = trimmed.indexOf('{');
        const end = trimmed.lastIndexOf('}');
        if (start >= 0 && end > start) {
          parsed = JSON.parse(trimmed.slice(start, end + 1));
        } else {
          throw new InternalServerErrorException(
            'Model did not return valid JSON',
          );
        }
      }

      if (parsed === null) {
        throw new NotFoundException('Future gig not found');
      }

      const gig = this.normalizeLookUpedGig(parsed);

      const dateRaw = (gig.date ?? '').trim();
      if (!dateRaw) {
        throw new NotFoundException('Future gig not found');
      }

      const ts = new Date(dateRaw).getTime();
      if (Number.isNaN(ts) || ts <= Date.now()) {
        throw new NotFoundException('Future gig not found');
      }

      return gig;
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const nested =
          this.getAxiosNestedErrorMessage(err.response?.data) ?? undefined;
        const message = nested ?? err.message ?? 'AI request failed';
        throw new InternalServerErrorException(
          `AI request failed${status ? ` (HTTP ${status})` : ''}: ${message}`,
        );
      }
      throw err;
    }
  }
}
