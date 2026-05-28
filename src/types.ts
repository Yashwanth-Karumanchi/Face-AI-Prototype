export type Confidence = "Low" | "Medium" | "High";
export type QualityStatus = "Good" | "Acceptable" | "Poor";

export type Point = {
  x: number;
  y: number;
  z?: number;
};

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type IndicatorResult = {
  indicator: string;
  result: string;
  score: number | null;
  confidence: Confidence;
  reliable: boolean;
  explanation: string;
  meaning: string;
  limitations: string;
  details?: string[];
  metrics?: Record<string, number | string | boolean | null>;
  debug?: Record<string, unknown>;
};

export type ImageAnalysisInput = {
  image: HTMLImageElement;
  canvas: HTMLCanvasElement;
  imageData: ImageData;
  width: number;
  height: number;
};

export type FaceLandmarkResult = IndicatorResult & {
  detected: boolean;
  landmarks: Point[];
  faceBox: Rect | null;
};

export type FullReport = {
  app: {
    name: string;
    version: string;
    generatedAt: string;
  };
  disclaimer: string;
  imageQuality: IndicatorResult;
  face: FaceLandmarkResult;
  indicators: IndicatorResult[];
  overallNotes: string[];
};
