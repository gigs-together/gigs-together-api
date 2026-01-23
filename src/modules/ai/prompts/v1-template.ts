export function buildV1PromptTemplate(params: {
  name: string;
  place: string;
}): string {
  const { name, place } = params;

  // TODO: fill this template later
  return [
    'You are an assistant. Follow the instructions strictly.',
    '',
    `Name: ${name}`,
    `Place: ${place}`,
    '',
    'TODO: put your real prompt here.',
  ].join('\n');
}

