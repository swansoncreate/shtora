/** Dropbox file tag that marks a photo as usable for the feed and chat stills. */
export const SHTORA_PHOTO_TAG = "shtora";

export function isShtoraPhotoTag(tag: string) {
  return tag.trim().toLowerCase() === SHTORA_PHOTO_TAG;
}
