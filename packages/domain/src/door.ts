import {
  MapElement,
  mapElementIssue,
  isObject,
  type MapElementData,
} from "./map-element";
import type { EntityOptions } from "./entity";
export class Door extends MapElement {
  private constructor(data: MapElementData, options?: EntityOptions) {
    super("door", data, options);
  }
  static deserializePayload(value: unknown, options?: EntityOptions): Door {
    const issue = mapElementIssue(value, "door");
    if (issue || !isObject(value))
      throw new TypeError(issue ?? "Choose a valid map element.");
    return new Door(value, options);
  }
}
