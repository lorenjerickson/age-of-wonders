import type { Request } from "express";
import type { StoredUpload } from "./object-storage.service";

export interface MediaUploadRequest extends Request {
  storedUpload?: StoredUpload;
}
