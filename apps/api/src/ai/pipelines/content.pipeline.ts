import { Injectable } from "@nestjs/common";
import { OpenAiService } from "../openai.service";

export interface PipelineStageResult {
  name: string;
  output: string;
  responseId: string;
}

export interface ContentPipelineResult {
  output: string;
  stages: PipelineStageResult[];
}

@Injectable()
export class ContentPipeline {
  constructor(private readonly openAi: OpenAiService) {}

  async run(topic: string, audience = "a general professional audience") {
    const stages: PipelineStageResult[] = [];

    const outline = await this.openAi.respond({
      instructions:
        "You are a content strategist. Create a factual, useful outline. Return only the outline.",
      input: `Create an outline about "${topic}" for ${audience}.`,
    });
    stages.push({ name: "outline", ...outline });

    const draft = await this.openAi.respond({
      instructions:
        "You are an expert writer. Produce a polished article from the supplied outline. Avoid unsupported claims and filler.",
      input: `Topic: ${topic}\nAudience: ${audience}\n\nOutline:\n${outline.output}`,
    });
    stages.push({ name: "draft", ...draft });

    const review = await this.openAi.respond({
      instructions:
        "You are a meticulous editor. Return the final revised article only. Improve clarity, structure, and accuracy while preserving the author intent.",
      input: `Topic: ${topic}\nAudience: ${audience}\n\nDraft:\n${draft.output}`,
    });
    stages.push({ name: "editorial-review", ...review });

    return { output: review.output, stages } satisfies ContentPipelineResult;
  }
}
