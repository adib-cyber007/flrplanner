import { ReferenceSchema, type Brief, type ReferenceImage } from "./model";
import { siteEnvelope } from "./site";
export function createReference(
  name: string,
  dataUrl: string,
  pixelWidth: number,
  pixelHeight: number,
  brief: Brief,
) {
  if (
    !Number.isFinite(pixelWidth) ||
    !Number.isFinite(pixelHeight) ||
    pixelWidth <= 0 ||
    pixelHeight <= 0 ||
    pixelWidth * pixelHeight > 40_000_000
  )
    throw Error("Choose a readable reference image under 40 megapixels.");
  const envelope = siteEnvelope(brief);
  if (envelope.width <= 0 || envelope.depth <= 0)
    throw Error(
      "Correct the plot dimensions and setbacks before placing a reference.",
    );
  const scale = Math.min(
    envelope.width / pixelWidth,
    envelope.depth / pixelHeight,
  );
  const result = ReferenceSchema.safeParse({
    name: name.slice(0, 200),
    dataUrl,
    x: 0,
    y: 0,
    w: pixelWidth * scale,
    h: pixelHeight * scale,
    rotation: 0,
    opacity: 0.35,
    visible: true,
  });
  if (!result.success)
    throw Error(
      "This image format or aspect ratio is not supported for tracing.",
    );
  return result.data;
}
export type ImagePoint = { x: number; y: number };
export function calibrateReference(
  reference: ReferenceImage,
  a: ImagePoint,
  b: ImagePoint,
  meters: number,
) {
  if (
    ![a.x, a.y, b.x, b.y].every((v) => Number.isFinite(v) && v >= 0 && v <= 1)
  )
    throw Error("Choose both points inside the reference image.");
  const measured = Math.hypot(
    (b.x - a.x) * reference.w,
    (b.y - a.y) * reference.h,
  );
  if (measured < 0.01 || !Number.isFinite(meters) || meters <= 0)
    throw Error(
      "Choose two distinct points and enter a positive known distance.",
    );
  const scale = meters / measured,
    w = reference.w * scale,
    h = reference.h * scale;
  const angle = (reference.rotation * Math.PI) / 180;
  const offset = {
    x: (a.x - 0.5) * (reference.w - w),
    y: (a.y - 0.5) * (reference.h - h),
  };
  const cx =
    reference.x +
    reference.w / 2 +
    offset.x * Math.cos(angle) -
    offset.y * Math.sin(angle);
  const cy =
    reference.y +
    reference.h / 2 +
    offset.x * Math.sin(angle) +
    offset.y * Math.cos(angle);
  const result = ReferenceSchema.safeParse({
    ...reference,
    x: cx - w / 2,
    y: cy - h / 2,
    w,
    h,
  });
  if (!result.success)
    throw Error(
      "That scale would place the reference beyond the supported size or position limits. Check the chosen points and distance.",
    );
  return result.data;
}
