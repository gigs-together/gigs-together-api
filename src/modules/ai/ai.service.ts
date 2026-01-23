import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { buildV1PromptTemplate } from './prompts/v1-template';
import type {
  V1AiGenerateRequestBody,
  V1AiGenerateResponseBody,
} from './types/requests/v1-ai-generate-request';

@Injectable()
export class AiService {
  constructor(private readonly configService: ConfigService) {}

  async generateV1(
    body: V1AiGenerateRequestBody,
  ): Promise<V1AiGenerateResponseBody> {
    const apiKey =
      this.configService.get<string>('OPENAI_API_KEY') ??
      process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new InternalServerErrorException(
        'OPENAI_API_KEY is not set on the server',
      );
    }

    const model =
      this.configService.get<string>('OPENAI_MODEL') ??
      process.env.OPENAI_MODEL;
    if (!model) {
      throw new InternalServerErrorException(
        'OPENAI_MODEL is not set on the server',
      );
    }

    const prompt = buildV1PromptTemplate({
      name: body.name,
      place: body.place,
    });

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
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
        throw new InternalServerErrorException('OpenAI returned empty response');
      }
      return { text };
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const message =
          (err.response?.data as any)?.error?.message ??
          err.message ??
          'OpenAI request failed';
        throw new InternalServerErrorException(
          `OpenAI request failed${status ? ` (HTTP ${status})` : ''}: ${message}`,
        );
      }
      throw err;
    }
  }
}
