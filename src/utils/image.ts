import type { ImageAnalysisInput, Point, Rect } from "../types";

export async function fileToImage(file: File | Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function imageToInput(image: HTMLImageElement): ImageAnalysisInput {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = get2d(canvas);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return {
    image,
    canvas,
    imageData: context.getImageData(0, 0, canvas.width, canvas.height),
    width: canvas.width,
    height: canvas.height,
  };
}

export function get2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Canvas 2D context is not available.");
  }
  return context;
}

export function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

export function rectFromPoints(points: Point[], pad = 0, width: number, height: number): Rect {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.max(0, Math.min(...xs) - pad);
  const minY = Math.max(0, Math.min(...ys) - pad);
  const maxX = Math.min(width, Math.max(...xs) + pad);
  const maxY = Math.min(height, Math.max(...ys) + pad);
  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

export function expandRect(rect: Rect, scaleX: number, scaleY: number, width: number, height: number): Rect {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const nextWidth = rect.width * scaleX;
  const nextHeight = rect.height * scaleY;
  return clipRect(
    {
      x: cx - nextWidth / 2,
      y: cy - nextHeight / 2,
      width: nextWidth,
      height: nextHeight,
    },
    width,
    height,
  );
}

export function clipRect(rect: Rect, width: number, height: number): Rect {
  const x = clamp(rect.x, 0, width);
  const y = clamp(rect.y, 0, height);
  const right = clamp(rect.x + rect.width, 0, width);
  const bottom = clamp(rect.y + rect.height, 0, height);
  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y),
  };
}

export function rectPixels(imageData: ImageData, rect: Rect): number[] {
  const values: number[] = [];
  const startX = Math.max(0, Math.floor(rect.x));
  const endX = Math.min(imageData.width, Math.ceil(rect.x + rect.width));
  const startY = Math.max(0, Math.floor(rect.y));
  const endY = Math.min(imageData.height, Math.ceil(rect.y + rect.height));
  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      values.push((y * imageData.width + x) * 4);
    }
  }
  return values;
}

export function grayAt(data: Uint8ClampedArray, offset: number): number {
  return 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
}

export function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function stdev(values: number[], avg = mean(values)): number {
  if (!values.length) return 0;
  return Math.sqrt(values.reduce((total, value) => total + (value - avg) ** 2, 0) / values.length);
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function safeMetric(value: number | null | undefined, digits = 3): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return value.toFixed(digits);
}

export function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png");
}

export function drawRect(ctx: CanvasRenderingContext2D, rect: Rect, color: string, label: string): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  ctx.font = "600 15px Inter, system-ui, sans-serif";
  ctx.fillStyle = color;
  ctx.fillText(label, rect.x + 6, Math.max(18, rect.y - 8));
  ctx.restore();
}
