import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { VersioningType } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT ?? 3000;

  // CORS (needed when a separate frontend domain calls this API or uses presigned URLs).
  //
  // Config:
  // - If CORS_ORIGINS="reflect" (or "all") → allow all origins (reflect request origin), with credentials
  // - Else if CORS_ORIGINS="*" → allow all origins, no credentials
  // - Else if CORS_ORIGINS is a comma-separated list → allow those origins, with credentials
  // - Else (unset) → keep permissive (reflect request origin) so public pages work out of the box
  const corsOriginsRaw = (process.env.CORS_ORIGINS ?? '').trim();
  const corsOriginsMode = corsOriginsRaw.toLowerCase();

  if (corsOriginsMode === 'reflect' || corsOriginsMode === 'all') {
    app.enableCors({ origin: true, credentials: true });
  } else if (corsOriginsRaw === '*') {
    app.enableCors({ origin: '*', credentials: false });
  } else if (corsOriginsRaw) {
    const origins = corsOriginsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    app.enableCors({ origin: origins, credentials: true });
  } else {
    app.enableCors({ origin: true, credentials: true });
  }

  app.enableVersioning({
    type: VersioningType.URI, // You can use URI, Header, or Media Type
  });
  await app.listen(port);
  console.log(`Server is running at http://localhost:${port}`);
}

bootstrap();
