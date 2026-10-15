import { ConfigService } from "@nestjs/config";
import { BadRequestException } from "@nestjs/common";
import { Readable } from "node:stream";
import { ObjectStorageService } from "./object-storage.service";

const send = jest
  .fn<Promise<object>, [{ input: { Key: string } }]>()
  .mockResolvedValue({});
jest.mock("@aws-sdk/client-s3", () => ({
  ...jest.requireActual<typeof import("@aws-sdk/client-s3")>(
    "@aws-sdk/client-s3",
  ),
  S3Client: jest.fn().mockImplementation(() => ({ send })),
}));
jest.mock("@aws-sdk/lib-storage", () => ({
  Upload: jest
    .fn()
    .mockImplementation(({ params }: { params: { Body: Readable } }) => ({
      done: async () => {
        for await (const chunk of params.Body) void chunk;
        return { ETag: '"test-etag"' };
      },
    })),
}));

describe("Object storage uploads", () => {
  beforeEach(() => send.mockClear());
  const service = () => new ObjectStorageService(new ConfigService());

  it("rejects an empty upload and cleans up its object before metadata can be persisted", async () => {
    await expect(
      service().upload(
        Readable.from([]),
        "empty.webp",
        "image/webp",
        "maps",
        [],
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].input.Key).toEqual(
      expect.stringContaining(".webp"),
    );
  });

  it("retains nonempty uploaded bytes and metadata", async () => {
    const uploaded = await service().upload(
      Readable.from([Buffer.from("nonempty")]),
      "map.webp",
      "image/webp",
      "maps",
      [],
    );
    expect(uploaded).toMatchObject({
      size: 8,
      originalName: "map.webp",
      mimeType: "image/webp",
      etag: "test-etag",
    });
    expect(send).not.toHaveBeenCalled();
  });
});
