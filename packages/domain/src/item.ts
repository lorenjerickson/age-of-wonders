import {
  Entity,
  type EntityOptions,
  type ValidationContext,
  type DeepReadonly,
  type EntityTransition,
  type CommandInvocation,
} from "./entity";
import { ITEM_QUALITIES } from "@aow/common";
export type RuntimeItemData = Record<string, unknown>;
export type ItemCommands = {
  quantity: { params: { quantity: number }; context: Record<string, never> };
};
export class Item extends Entity<
  RuntimeItemData,
  ItemCommands,
  { changed: { quantity: number } },
  ValidationContext
> {
  private constructor(data: RuntimeItemData, options?: EntityOptions) {
    super("item", data, ["changed"], { mode: "runtime" }, options);
    this.validate({ mode: "runtime" });
  }
  static deserialize(value: unknown, options?: EntityOptions): Item {
    const v = object(value);
    if (v.type === "item") {
      if (v.schemaVersion !== 1)
        throw new TypeError("Unsupported Item version.");
      return Item.deserializePayload(v.data, options);
    }
    if (!Object.keys(v).length)
      throw new TypeError("An Item requires an object.");
    return new Item(v, options);
  }
  static deserializePayload(value: unknown, options?: EntityOptions): Item {
    const v = object(value);
    if (!Object.keys(v).length)
      throw new TypeError("An Item requires an object.");
    return new Item(v, options);
  }
  serializePayload() {
    return this.serialize().data;
  }
  protected validateState(data: DeepReadonly<RuntimeItemData>) {
    const valid =
      typeof data.id === "string" &&
      typeof data.definitionId === "string" &&
      Number.isSafeInteger(data.quantity) &&
      Number(data.quantity) > 0 &&
      ITEM_QUALITIES.includes(data.quality as never) &&
      typeof object(data.location).kind === "string";
    return valid
      ? []
      : [
          {
            code: "item-runtime-invalid",
            message:
              "The Item identity, quantity, quality or location is invalid.",
          },
        ];
  }
  protected handleCommand<K extends keyof ItemCommands>(
    name: K,
    invocation: CommandInvocation<ItemCommands[K]>,
  ): EntityTransition<RuntimeItemData, { changed: { quantity: number } }> {
    if (
      name !== "quantity" ||
      !Number.isSafeInteger(invocation.params.quantity) ||
      invocation.params.quantity < 1
    )
      throw new TypeError("Provide a positive whole Item quantity.");
    const data = {
      ...this.serializePayload(),
      quantity: invocation.params.quantity,
    };
    return {
      data,
      events: [
        { name: "changed", context: { quantity: invocation.params.quantity } },
      ],
    };
  }
}
function object(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}
