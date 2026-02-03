import { BadRequestException, Injectable } from '@nestjs/common';
import { LanguageIso, SupportedLanguage } from './types/language.types';
import { InjectModel } from '@nestjs/mongoose';
import { LanguageDocument, Language } from './language.schema';
import { Model } from 'mongoose';
import { Translation, TranslationDocument } from './translation.schema';
import type {
  V1LanguageGetTranslationsRequest,
  V1LanguageGetTranslationsResponseBody,
} from './types/requests/v1-language-get-translations-request';

@Injectable()
export class LanguageService {
  constructor(
    @InjectModel(Language.name)
    private readonly languageModel: Model<LanguageDocument>,
    @InjectModel(Translation.name)
    private readonly translationModel: Model<TranslationDocument>,
  ) {}

  private static readonly DEFAULT_LANGUAGE_ISO: LanguageIso = 'en';
  private static readonly DEFAULT_NAMESPACE = 'default';

  private async resolveLocale(
    acceptLanguageRaw?: string,
  ): Promise<LanguageIso> {
    const requested =
      LanguageService.normalizeAcceptLanguage(acceptLanguageRaw);
    if (!requested) return LanguageService.DEFAULT_LANGUAGE_ISO;

    const supported = await this.languageModel
      .find({ isActive: true }, { _id: 0, iso: 1 })
      .lean<Array<{ readonly iso: LanguageIso }>>()
      .exec();

    const set = new Set(supported.map((x) => x.iso));
    return set.has(requested)
      ? requested
      : LanguageService.DEFAULT_LANGUAGE_ISO;
  }

  private static normalizeAcceptLanguage(
    value?: string,
  ): LanguageIso | undefined {
    if (!value) return undefined;
    const first = value.split(',')[0]?.trim(); // "en-US;q=0.9" or "*"
    if (!first || first === '*') return undefined;
    const withoutQ = first.split(';')[0]?.trim(); // "en-US"
    const primary = withoutQ.split('-')[0]?.trim().toLowerCase(); // "en"
    if (!primary) return undefined;
    return primary as LanguageIso;
  }

  getLanguagesV1(): Promise<readonly SupportedLanguage[]> {
    return this.languageModel
      .find(
        { isActive: true },
        { _id: 0, iso: 1, name: 1, isActive: 1, order: 1 },
      )
      .sort({ order: 1, iso: 1 })
      .lean<SupportedLanguage[]>()
      .exec();
  }

  async getTranslationsV1(
    request: V1LanguageGetTranslationsRequest,
  ): Promise<V1LanguageGetTranslationsResponseBody> {
    const locale = await this.resolveLocale(request.acceptLanguage);

    const namespaces = LanguageService.parseNamespacesQuery(
      request.namespacesQuery,
    );

    const filter: Record<string, unknown> = {
      locale,
      isActive: true,
    };

    if (namespaces !== undefined) {
      const withoutDefault = namespaces.filter(
        (ns) => ns !== LanguageService.DEFAULT_NAMESPACE,
      );
      const includesDefault = namespaces.includes(
        LanguageService.DEFAULT_NAMESPACE,
      );

      if (includesDefault && withoutDefault.length > 0) {
        filter.$or = [
          { namespace: { $in: withoutDefault } },
          { namespace: { $exists: false } },
          { namespace: null },
          { namespace: '' },
        ];
      } else if (includesDefault) {
        filter.$or = [
          { namespace: { $exists: false } },
          { namespace: null },
          { namespace: '' },
        ];
      } else {
        filter.namespace = { $in: withoutDefault };
      }
    }

    const docs = await this.translationModel
      .find(filter, { _id: 0, key: 1, value: 1, namespace: 1, format: 1 })
      .sort({ namespace: 1, key: 1 })
      .lean<
        Array<{
          readonly key: string;
          readonly value: string;
          readonly namespace?: string | null;
          readonly format: TranslationDocument['format'];
        }>
      >()
      .exec();

    const translations: Record<
      string,
      Record<
        string,
        {
          readonly value: string;
          readonly format: TranslationDocument['format'];
        }
      >
    > = {};

    for (const doc of docs) {
      const namespaceRaw = (doc.namespace ?? '')
        .toString()
        .trim()
        .toLowerCase();
      const namespace = namespaceRaw || LanguageService.DEFAULT_NAMESPACE;
      translations[namespace] ??= {};
      translations[namespace][doc.key] = {
        value: doc.value,
        format: doc.format,
      };
    }

    return { locale, translations };
  }

  private static parseNamespacesQuery(
    namespacesQuery: string | readonly string[] | undefined,
  ): readonly string[] | undefined {
    if (namespacesQuery === undefined) return undefined;

    const rawList = Array.isArray(namespacesQuery)
      ? namespacesQuery
      : [namespacesQuery];

    const parts = rawList
      .flatMap((item) => item.split(','))
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0);

    const unique = [...new Set(parts)];
    if (unique.length === 0) return undefined;

    const MAX_NAMESPACES = 50;
    if (unique.length > MAX_NAMESPACES) {
      throw new BadRequestException(
        `Too many namespaces requested (max ${MAX_NAMESPACES}).`,
      );
    }

    const isValid = (ns: string) =>
      ns === LanguageService.DEFAULT_NAMESPACE ||
      /^[a-z0-9][a-z0-9_-]{0,63}$/.test(ns);

    const invalid = unique.filter((ns) => !isValid(ns));
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Invalid namespaces: ${invalid.map((x) => `"${x}"`).join(', ')}`,
      );
    }

    return unique;
  }
}
