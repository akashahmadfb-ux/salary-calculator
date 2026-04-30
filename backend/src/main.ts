import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // Global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS
  app.enableCors({
    origin: (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000').split(','),
    credentials: true,
  });

  // Swagger docs
  const config = new DocumentBuilder()
    .setTitle("IOKNBO Finance Tracker API")
    .setDescription("Backend API for the It's Okay to Not Be Okay finance tracker")
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.BACKEND_PORT ?? 4000;
  await app.listen(port);
  console.log(`🌙 IOKNBO backend listening on http://localhost:${port}`);
  console.log(`📖 API docs available at http://localhost:${port}/docs`);
}

bootstrap();
