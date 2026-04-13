import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AiLookupDevStubService } from './ai-lookup-dev-stub.service';
import { buildV1FutureGigLookupPrompt } from './prompts/v1-gig-lookup-prompt';
import {
  applyPerplexityStructuredGigLookupToRequestBody,
  isPerplexityStructuredGigLookupEnabled,
} from './perplexity/perplexity-gig-lookup.request';
import { V1ReceiverCreateGigRequestBodyGig } from '../receiver/types/requests/v1-receiver-create-gig-request';
import { isRecord } from '../../shared/utils/is-record';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly aiLookupDevStubService: AiLookupDevStubService,
  ) {}

  /** When true, logs non-sensitive lookup diagnostics (set AI_LOOKUP_DEBUG=1). */
  private isAiLookupDebugEnabled(): boolean {
    const raw =
      this.configService.get<string>('AI_LOOKUP_DEBUG') ??
      process.env.AI_LOOKUP_DEBUG;
    return raw === '1' || raw === 'true' || raw === 'yes';
  }

  private getAiEndpointOriginForLog(url: string): string {
    try {
      return new URL(url).origin;
    } catch {
      return '(invalid AI_URL)';
    }
  }

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
    const stubGig = this.aiLookupDevStubService.resolveGigOrNull(params);
    if (stubGig) {
      return stubGig;
    }

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

    const perplexityPlainEnv =
      this.configService.get<string>('AI_LOOKUP_PERPLEXITY_PLAIN') ??
      process.env.AI_LOOKUP_PERPLEXITY_PLAIN;
    const usePerplexityStructured = isPerplexityStructuredGigLookupEnabled(
      url,
      perplexityPlainEnv,
    );
    const prompt = buildV1FutureGigLookupPrompt({
      name: params.name,
      place: params.location,
      mode: usePerplexityStructured ? 'structured' : 'plain-json',
    });

    const requestBody: Record<string, unknown> = {
      model,
      messages: [{ role: 'user', content: prompt }],
    };

    if (usePerplexityStructured) {
      applyPerplexityStructuredGigLookupToRequestBody(requestBody);
    }

    try {
      const response = await axios.post(url, requestBody, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      const choice0Unknown: unknown = response.data?.choices?.[0];
      const finishReason =
        isRecord(choice0Unknown) &&
        typeof choice0Unknown.finish_reason === 'string'
          ? choice0Unknown.finish_reason
          : undefined;

      const text: unknown = response.data?.choices?.[0]?.message?.content;

      if (this.isAiLookupDebugEnabled()) {
        const contentForLog =
          typeof text === 'string'
            ? text
            : text === undefined
              ? '(undefined)'
              : JSON.stringify(text);
        const maxLen = 6_000;
        const clipped =
          contentForLog.length > maxLen
            ? `${contentForLog.slice(0, maxLen)}…(truncated)`
            : contentForLog;
        this.logger.log(
          `[AI lookup debug] model=${model} endpoint=${this.getAiEndpointOriginForLog(url)} perplexity_structured=${usePerplexityStructured} finish_reason=${finishReason ?? '(none)'} name=${JSON.stringify(params.name)} place=${JSON.stringify(params.location)} content_type=${typeof text} raw_content=${clipped}`,
        );
      }

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

      if (isRecord(parsed) && typeof parsed.isFound === 'boolean') {
        if (!parsed.isFound) {
          if (this.isAiLookupDebugEnabled()) {
            this.logger.log(
              '[AI lookup debug] not_found_reason=model_set_isFound_false',
            );
          }
          throw new NotFoundException('Future gig not found');
        }
      } else if (parsed === null) {
        if (this.isAiLookupDebugEnabled()) {
          this.logger.log(
            '[AI lookup debug] not_found_reason=model_returned_json_null (prompt allows null when no matching future gig)',
          );
        }
        throw new NotFoundException('Future gig not found');
      }

      const gig = this.normalizeLookUpedGig(parsed);

      const dateRaw = (gig.date ?? '').trim();
      if (!dateRaw) {
        if (this.isAiLookupDebugEnabled()) {
          this.logger.log(
            '[AI lookup debug] not_found_reason=empty_date_after_normalize',
          );
        }
        throw new NotFoundException('Future gig not found');
      }

      const ts = new Date(dateRaw).getTime();
      if (Number.isNaN(ts) || ts <= Date.now()) {
        if (this.isAiLookupDebugEnabled()) {
          this.logger.log(
            `[AI lookup debug] not_found_reason=invalid_or_past_date dateRaw=${JSON.stringify(dateRaw)} ts=${ts}`,
          );
        }
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
