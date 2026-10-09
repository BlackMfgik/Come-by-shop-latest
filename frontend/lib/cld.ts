/**
 * Будує Cloudinary URL з автоматичним WebP + оптимізацією якості.
 *
 * @param publicId  public_id зображення на Cloudinary (напр. "come-by-shop/static/shop-icon")
 * @param opts      додаткові трансформації (ширина, висота, crop тощо)
 */
export function cldUrl(
  publicId: string,
  opts: { w?: number; h?: number; crop?: string } = {},
): string {
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  if (!cloud) {
    console.warn("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME не задано");
    return "";
  }

  const transforms: string[] = ["f_webp", "q_auto:good"];
  if (opts.w) transforms.push(`w_${opts.w}`);
  if (opts.h) transforms.push(`h_${opts.h}`);
  if (opts.crop) transforms.push(`c_${opts.crop}`);

  return `https://res.cloudinary.com/${cloud}/image/upload/${transforms.join(",")}/${publicId}`;
}

/**
 * Публічні ID статичних зображень.
 * Завантаж їх до Cloudinary у папку come-by-shop/static/ з такими іменами.
 */
export const STATIC_IMAGES = {
  logo: "shop-icon_nzkclj",
  hero: "dhaneshdamodaran-fruits-7357732_1920_ozytfx",
  cats: "no-image_ihltyz",
  noImage: "no-image_ihltyz",
} as const;
