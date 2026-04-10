/** Hostname for Perplexity Sonar chat API (OpenAI-compatible). */
export const PERPLEXITY_API_HOSTNAME = 'api.perplexity.ai';

/**
 * JSON Schema for Perplexity `response_format` (structured gig lookup).
 * Top-level value is always an object — no JSON `null` in `message.content`.
 */
export const GIG_LOOKUP_PERPLEXITY_JSON_SCHEMA = {
  name: 'gig_lookup',
  strict: false,
  schema: {
    type: 'object',
    properties: {
      isFound: {
        type: 'boolean',
        description:
          'True if a matching upcoming concert exists; false otherwise.',
      },
      title: { type: 'string' },
      date: { type: 'string' },
      endDate: { type: 'string' },
      city: { type: 'string' },
      country: { type: 'string' },
      venue: { type: 'string' },
      ticketsUrl: { type: 'string' },
      posterUrl: { type: 'string' },
    },
    required: [
      'isFound',
      'title',
      'date',
      'endDate',
      'city',
      'country',
      'venue',
      'ticketsUrl',
      'posterUrl',
    ],
    additionalProperties: false,
  },
};

export function isPerplexityApiUrl(url: string): boolean {
  try {
    return new URL(url).hostname === PERPLEXITY_API_HOSTNAME;
  } catch {
    return false;
  }
}

/**
 * Structured output + search options for gig lookup, unless opted out with
 * AI_LOOKUP_PERPLEXITY_PLAIN=1|true|yes.
 */
export function isPerplexityStructuredGigLookupEnabled(
  aiUrl: string,
  perplexityPlainEnv: string | undefined,
): boolean {
  if (!isPerplexityApiUrl(aiUrl)) {
    return false;
  }
  const raw = perplexityPlainEnv?.trim().toLowerCase();
  return raw !== '1' && raw !== 'true' && raw !== 'yes';
}

/** Mutates `body` — adds Perplexity-only chat completion fields. */
export function applyPerplexityStructuredGigLookupToRequestBody(
  body: Record<string, unknown>,
): void {
  body.web_search_options = {
    search_context_size: 'high',
    search_type: 'pro',
  };
  body.enable_search_classifier = false;
  body.response_format = {
    type: 'json_schema',
    json_schema: GIG_LOOKUP_PERPLEXITY_JSON_SCHEMA,
  };
}
