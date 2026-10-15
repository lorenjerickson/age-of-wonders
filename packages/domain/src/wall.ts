import {
  MapElement,
  mapElementIssue,
  isObject,
  type MapElementData,
} from "./map-element";
import type { EntityOptions } from "./entity";
export class Wall extends MapElement {
  private constructor(data: MapElementData, options?: EntityOptions) {
    super("wall", data, options);
  }
  static deserializePayload(value: unknown, options?: EntityOptions): Wall {
    const issue = mapElementIssue(value, "wall");
    if (issue || !isObject(value))
      throw new TypeError(issue ?? "Choose a valid map element.");
    return new Wall(value, options);
  }
}
