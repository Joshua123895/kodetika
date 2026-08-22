// Turning a chosen file into a small square avatar and putting it in storage.
// Browser-only (canvas, File); the pure naming rules live in profile.js.

import { supabase } from "./supabase";

export const AVATAR_SIZE = 256;

/**
 * Squares and shrinks an image to AVATAR_SIZE on a canvas, as PNG. A phone
 * photo is several megabytes; an avatar is a 256px square, and the bucket
 * refuses anything over half a megabyte, so the resize happens here first.
 */
export function squareImage(file, size = AVATAR_SIZE) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const sx = (img.naturalWidth - side) / 2;
      const sy = (img.naturalHeight - side) / 2;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      canvas.getContext("2d").drawImage(img, sx, sy, side, side, 0, 0, size, size);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Could not read that image."))),
        "image/png"
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file is not an image the browser can open."));
    };
    img.src = url;
  });
}

/**
 * Uploads the squared image to avatars/<uid>/avatar.png and returns its public
 * URL. Upserted, so changing the photo overwrites rather than piles up; the
 * query string busts the old cached copy in every <img> that held it.
 */
export async function uploadAvatar(userId, file) {
  if (!supabase) throw new Error("Not configured for the cloud.");
  const blob = await squareImage(file);
  const path = `${userId}/avatar.png`;
  const { error } = await supabase.storage
    .from("avatars")
    .upload(path, blob, { upsert: true, contentType: "image/png", cacheControl: "3600" });
  if (error) throw error;
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}
