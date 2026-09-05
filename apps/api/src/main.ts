import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { json, type NextFunction, type Request, type Response } from "express";
import { AppModule } from "./app.module";
import { AUTH_COOKIE } from "./auth/auth.types";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const config = app.get(ConfigService);

  app.use(json({ limit: "5mb" }));

  app.setGlobalPrefix("api");
  app.enableCors({
    origin: config.get<string>("WEB_ORIGIN", "http://localhost:5173"),
    credentials: true,
  });
  const webOrigin = config.get<string>("WEB_ORIGIN", "http://localhost:5173");
  app.use((request: Request, response: Response, next: NextFunction) => {
    const unsafe = !["GET", "HEAD", "OPTIONS"].includes(request.method);
    const usesCookie = request.headers.cookie
      ?.split(";")
      .some((pair) => pair.trim().startsWith(`${AUTH_COOKIE}=`));
    if (unsafe && usesCookie && request.headers.origin !== webOrigin) {
      response.status(403).json({ message: "Request origin is not allowed." });
      return;
    }
    next();
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
