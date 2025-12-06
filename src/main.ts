import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { VersioningType, Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT ?? 3000;
  app.enableVersioning({
    type: VersioningType.URI, // You can use URI, Header, or Media Type
  });
  await app.listen(port);
  Logger.log(`Server is running at http://localhost:${port}`, 'Bootstrap');
}

bootstrap();
