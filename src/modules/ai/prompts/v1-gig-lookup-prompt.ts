export function buildV1FutureGigLookupPrompt(params: {
  name: string;
  place: string;
}): string {
  const { name, place } = params;

  // Prompt for extracting a future gig draft.
  // The model MUST return a single JSON value: either `null` or an object matching the gig draft schema below.
  return [
    'You are an assistant helping to create a gig draft for an app.',
    'Your task: find gig details based on the provided query.',
    'IMPORTANT: Return ONLY facts that you have found in sources. Do not infer, guess, estimate, or fill gaps.',
    '',
    '## Input',
    `Name: ${name}`,
    `Place: ${place}`,
    '',
    '## Output format (STRICT)',
    '- Return ONLY valid JSON. No markdown, no code fences, no extra text.',
    '- If you cannot find a FUTURE concert that matches this query, return the JSON literal: null',
    '- Otherwise, return a single JSON object that matches this schema exactly:',
    '{',
    '  "title": string;',
    '  "date": string;',
    '  "city": string;',
    '  "country": string;',
    '  "venue": string;',
    '  "ticketsUrl": string;',
    '  "posterUrl"?: string;',
    '}',
    '',
    '## Rules',
    '- Only include information you found. If you did not find a value, set it to "".',
    '- `date` must be a string. Prefer ISO 8601, e.g. "2026-01-23T19:30:00+03:00". If unknown, set "".',
    '- We only care about FUTURE concerts.',
    '- Do NOT return past gigs. If you only find past dates, return null.',
    '- `ticketsUrl` rules (STRICT):',
    '  - You MUST NOT include ticket links from any ticketing sites except this allowlist:',
    '    - ticketmaster.<tld> (any Ticketmaster country domain, incl. subdomains)',
    '    - axs.com (incl. subdomains)',
    '    - livenation.com (incl. subdomains)',
    '  - If you can find a valid link on the allowlisted domains, set `ticketsUrl` to that URL.',
    '  - If you CANNOT find a valid link on the allowlisted domains, then try to find the OFFICIAL WEBSITE of the artist/performer and set `ticketsUrl` to that URL.',
    '  - If you cannot find the official artist website either, set "".',
    '- `posterUrl` must be a URL string or "".',
    '- `city` must be a city name or "".',
    '- `country` must be an ISO 3166-1 alpha-2 code (uppercase), e.g. "ES", "US", or "".',
    '- `venue` should be the venue name (not the city and not the address). If unknown, set "".',
    '- Do NOT invent facts. Do not fabricate links.',
  ].join('\n');
}
