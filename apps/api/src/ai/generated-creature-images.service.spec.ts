import {
  GeneratedCreatureImagesService,
  MAP_TOKEN_COMPOSITION,
} from "./generated-creature-images.service";

it("keeps profession scenery out of both token prompts while preserving portrait composition", async () => {
  const generateImage = jest
    .fn()
    .mockResolvedValue({
      buffer: Buffer.from("mock"),
      mimeType: "image/webp",
      width: 1024,
      height: 1024,
      responseId: "response",
    });
  const service = new GeneratedCreatureImagesService(
    { generateImage } as never,
    { upload: jest.fn().mockResolvedValue({ key: "upload" }) } as never,
    { create: jest.fn().mockResolvedValue({ id: "asset" }) } as never,
  );
  const scene =
    "Blacksmith working at an anvil beside a glowing forge, with scattered tools and sparks.";
  await service.generate(
    {
      name: "Blacksmith",
      extensions: {
        "aow:image-briefs": {
          sharedVisualIdentity: scene,
          portrait: { imageGenerationPrompt: scene },
          overheadToken: { imageGenerationPrompt: scene },
          paperDollToken: { imageGenerationPrompt: scene },
        },
      },
    },
    "world",
  );
  expect(generateImage).toHaveBeenCalledTimes(3);
  const portrait = (generateImage.mock.calls as unknown as [string, unknown][])[0][0];
  expect(portrait).toContain(scene);
  expect(portrait).not.toContain(MAP_TOKEN_COMPOSITION);
  for (const index of [1, 2]) {
    const prompt = (generateImage.mock.calls as unknown as [string, unknown][])[index][0];
    expect(prompt.endsWith(MAP_TOKEN_COMPOSITION)).toBe(true);
    expect(prompt).toContain("Do not invent occupational accessories");
    expect(prompt).toContain("must not include an anvil, forge");
    expect(prompt).toContain(
      "Every pixel outside the character and permitted worn or held equipment must be transparent",
    );
    expect((generateImage.mock.calls as unknown as [string, unknown][])[index][1]).toMatchObject({
      background: "transparent",
      size: "1024x1024",
    });
  }
});
