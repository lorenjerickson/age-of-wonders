import {
  MapElement,
  mapElementIssue,
  isObject,
  type MapElementData,
} from "./map-element";
import type { EntityOptions } from "./entity";
export class Window extends MapElement {
  private constructor(data: MapElementData, options?: EntityOptions) {
    super("window", data, options);
  }
  static deserializePayload(value: unknown, options?: EntityOptions): Window {
    const issue = mapElementIssue(value, "window");
    if (issue || !isObject(value))
      throw new TypeError(issue ?? "Choose a valid map element.");
    return new Window(value, options);
  }
}
