export function buildV1FutureGigLookupPrompt(params: {
  name: string;
  place: string;
}): string {
  const { name, place } = params;

  // Prompt for extracting a future gig draft.
  // The model MUST return a single JSON value: either `null` or an object matching `GigDto`.
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
    '- Otherwise, return a single JSON object that matches this schema exactly (GigDto):',
    '{',
    '  "title": string,',
    '  "date": string,',
    '  "location": string,',
    '  "ticketsUrl": string,',
    '  "photo"?: { "url"?: string }',
    '}',
    '',
    '## Rules',
    '- Only include information you found. If you did not find a value, set it to "".',
    '- `date` must be a string. Prefer ISO 8601, e.g. "2026-01-23T19:30:00+03:00". If unknown, set "".',
    '- We only care about FUTURE concerts.',
    '- Do NOT return past gigs. If you only find past dates, return null.',
    '- `ticketsUrl` must be a URL string or "".',
    '- When selecting `ticketsUrl`, prefer verified/official sources (Ticketmaster, AXS, Live Nation, and similar official ticketing platforms). Avoid unofficial resellers if an official link exists.',
    '- If you do not have a photo URL, omit "photo" entirely.',
    '- Do NOT invent facts. Do not fabricate links.',
  ].join('\n');
}
