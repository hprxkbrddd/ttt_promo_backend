import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const allowed = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://tttpromofrontend.vercel.app',
  ];

  app.enableCors({
    origin: (origin, callback) => {
      // origin может быть undefined (например curl/postman) — разрешаем
      if (!origin) return callback(null, true);

      const isAllowedExact = allowed.includes(origin);
      const isVercelPreview = /^https:\/\/tttpromofrontend-.*\.vercel\.app$/.test(origin);

      if (isAllowedExact || isVercelPreview) return callback(null, true);

      return callback(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    credentials: false,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port, '0.0.0.0');
}
bootstrap();
