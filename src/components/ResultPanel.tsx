import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { IndicatorResult } from "../types";
import { safeMetric } from "../utils/image";

type Props = {
  result: IndicatorResult;
};

export function ResultPanel({ result }: Props) {
  const statusClass = result.reliable ? "good" : result.confidence === "Medium" ? "warn" : "low";
  const Icon = result.reliable ? CheckCircle2 : result.confidence === "Medium" ? Info : AlertTriangle;
  const visibleMetrics = Object.entries(result.metrics ?? {}).filter(([, value]) => value !== null && value !== undefined);

  return (
    <article className={`resultPanel ${statusClass}`}>
      <header>
        <div>
          <p className="eyebrow">{result.indicator}</p>
          <h3>{result.result}</h3>
        </div>
        <Icon size={22} />
      </header>
      <div className="metrics">
        <span>
          <small>Score</small>
          <strong>{safeMetric(result.score)}</strong>
        </span>
        <span>
          <small>Confidence</small>
          <strong>{result.confidence}</strong>
        </span>
        <span>
          <small>Reliable</small>
          <strong>{result.reliable ? "Yes" : "No"}</strong>
        </span>
      </div>
      <p>{result.explanation}</p>
      <p className="meaning">{result.meaning}</p>
      {visibleMetrics.length ? (
        <div className="metricCards">
          {visibleMetrics.map(([key, value]) => (
            <div className="metricCard" key={key}>
              <small>{labelMetric(key)}</small>
              <strong>{formatMetricValue(key, value)}</strong>
            </div>
          ))}
        </div>
      ) : null}
      {result.details?.length ? (
        <ul className="detailList">
          {result.details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      ) : null}
      <details>
        <summary>Technical details</summary>
        <p>{result.limitations}</p>
        {result.metrics ? <pre>{JSON.stringify(result.metrics, null, 2)}</pre> : null}
      </details>
    </article>
  );
}

function labelMetric(key: string): string {
  const labels: Record<string, string> = {
    blurVariance: "Blur check",
    brightness: "Brightness",
    contrast: "Contrast",
    landmarkCount: "Landmarks found",
    faceAreaRatio: "Face size in image",
    centerOffset: "Face centering",
    eyeDistanceRatio: "Eye distance",
    noseWidthRatio: "Nose width",
    faceAspectRatio: "Face height vs width",
    symmetryApproximation: "Left-right balance",
    averageEyeOpeningRatio: "Eye opening",
    mouthWidthRatio: "Mouth width",
    eyebrowSpacingRatio: "Eyebrow spacing",
    leftScore: "Left under-eye",
    rightScore: "Right under-eye",
    leftBrightnessDelta: "Left darkness change",
    rightBrightnessDelta: "Right darkness change",
    verticalEdgeStrength: "Line strength",
    estimatedApparentAge: "Estimated age",
    providedAge: "Entered age",
    ageDelta: "Age difference",
    roiQuality: "Region quality",
    lineStrength: "Crease line strength",
    creaseAngleDegrees: "Crease angle",
  };
  return labels[key] ?? key.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}

function formatMetricValue(key: string, value: string | number | boolean | null): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") return value;
  if (value === null) return "N/A";
  if (key.endsWith("Ratio")) return `${Math.round(value * 100)}%`;
  if (key === "brightness" || key === "contrast" || key === "blurVariance" || key === "lineStrength" || key === "verticalEdgeStrength") return safeMetric(value, 2);
  if (key === "estimatedApparentAge" || key === "providedAge" || key === "ageDelta") return `${safeMetric(value, 1)} yrs`;
  if (key === "faceAreaRatio" || key === "centerOffset" || key === "leftScore" || key === "rightScore") return `${Math.round(value * 100)}%`;
  if (key === "creaseAngleDegrees") return `${safeMetric(value, 1)} deg`;
  return safeMetric(value, 2);
}
