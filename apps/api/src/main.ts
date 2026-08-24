import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix("api");
  app.enableCors({
    origin: config.get<string>("WEB_ORIGIN", "http://localhost:5173"),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Age of Wonders API")
    .setDescription(
      "CRUD endpoints for the Age of Wonders domain model and OpenAI generation endpoints",
    )
    .setVersion("0.1.0")
    .build();
  SwaggerModule.setup("api/docs", app, () =>
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  await app.listen(config.get<number>("PORT", 3000), "0.0.0.0");
}

void bootstrap();
