import { APP_NAME, APP_VERSION, DISCLAIMER } from "./config";
import type { FullReport, IndicatorResult } from "./types";

export function buildReport(
  imageQuality: IndicatorResult,
  face: FullReport["face"],
  indicators: IndicatorResult[],
): FullReport {
  return {
    app: {
      name: APP_NAME,
      version: APP_VERSION,
      generatedAt: new Date().toISOString(),
    },
    disclaimer: DISCLAIMER,
    imageQuality,
    face,
    indicators,
    overallNotes: [
      "This report is non-diagnostic.",
      "Low confidence results should not be interpreted as reliable measurements.",
      "Image quality, pose, lighting, glasses, shadows, and region visibility affect visual analysis.",
      "No uploaded image data is included in exported reports.",
    ],
  };
}

export function reportBlob(report: FullReport): Blob {
  return new Blob([JSON.stringify(report, null, 2)], {
    type: "application/json;charset=utf-8",
  });
}

export async function pdfBlob(report: FullReport): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({
    unit: "pt",
    format: "a4",
  });

  const margin = 44;
  const width = doc.internal.pageSize.getWidth() - margin * 2;
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = margin;

  const addText = (text: string, size = 11, weight: "normal" | "bold" = "normal") => {
    doc.setFont("helvetica", weight);
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, width);
    const height = lines.length * (size + 3);
    if (y + height > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
    doc.text(lines, margin, y);
    y += height + 6;
  };

  addText(report.app.name, 22, "bold");
  addText(`Version ${report.app.version} | Generated ${new Date(report.app.generatedAt).toLocaleString()}`, 10);
  addText(report.disclaimer, 10);
  addText("How to read this report", 15, "bold");
  report.overallNotes.forEach((note) => addText(`- ${note}`));

  const rows = [report.imageQuality, report.face, ...report.indicators];
  addText("Indicator details", 15, "bold");
  rows.forEach((row) => {
    addText(`${row.indicator}: ${row.result}`, 13, "bold");
    addText(`Confidence: ${row.confidence} | Reliable: ${row.reliable ? "Yes" : "No"} | Score: ${row.score ?? "N/A"}`, 10);
    addText(row.explanation);
    addText(row.meaning);
    row.details?.forEach((detail) => addText(`- ${detail}`, 10));
    if (row.metrics && Object.keys(row.metrics).length) {
      Object.entries(row.metrics)
        .filter(([, value]) => value !== null && value !== undefined)
        .forEach(([key, value]) => addText(`${prettifyMetricLabel(key)}: ${String(value)}`, 10));
    }
    addText(`Limitations: ${row.limitations}`, 10);
  });

  return doc.output("blob");
}

function prettifyMetricLabel(key: string): string {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}
