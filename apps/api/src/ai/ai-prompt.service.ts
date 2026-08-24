import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

@Injectable()
export class AiPromptService {
  constructor(private readonly config: ConfigService) {}

  async read(fileName: string, configuredPathKey?: string): Promise<string> {
    const configured = configuredPathKey
      ? this.config.get<string>(configuredPathKey)
      : undefined;
    const configuredPath = configured
      ? isAbsolute(configured)
        ? configured
        : resolve(process.cwd(), configured)
      : undefined;
    const paths = configuredPath
      ? [
          fileName === configuredPath.split("/").at(-1)
            ? configuredPath
            : resolve(dirname(configuredPath), fileName),
        ]
      : [
          resolve(process.cwd(), "src/ai/prompts", fileName),
          resolve(process.cwd(), "prompts", fileName),
          resolve(process.cwd(), "../../prompts", fileName),
        ];

    for (const path of paths) {
      try {
        return await readFile(path, "utf8");
      } catch {
        // Continue through the supported source and packaged locations.
      }
    }
    throw new ServiceUnavailableException(
      `AI prompt dependency '${fileName}' is unavailable. Add it to src/ai/prompts or configure ${configuredPathKey ?? "its prompt path"}.`,
    );
  }
}
