import { Download, FileText, Play, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { APP_NAME, CONSENT_TEXT, DISCLAIMER } from "./config";
import { CameraCapture } from "./components/CameraCapture";
import { FileInput } from "./components/FileInput";
import { ReportTable } from "./components/ReportTable";
import { ResultPanel } from "./components/ResultPanel";
import { pdfBlob, reportBlob } from "./report";
import type { FullReport } from "./types";

type ImageSlot = {
  blob: Blob;
  preview: string;
  source: string;
};

function makeSlot(file: File | Blob, source: string): ImageSlot {
  return {
    blob: file,
    preview: URL.createObjectURL(file),
    source,
  };
}

function revokePreview(slot: ImageSlot | null) {
  if (slot) URL.revokeObjectURL(slot.preview);
}

type ApiArtifacts = {
  report: FullReport;
  overlays: Record<string, string | null>;
};

export default function App() {
  const [consent, setConsent] = useState(false);
  const [actualAge, setActualAge] = useState<string>("");
  const [faceImage, setFaceImage] = useState<ImageSlot | null>(null);
  const [leftEar, setLeftEar] = useState<ImageSlot | null>(null);
  const [rightEar, setRightEar] = useState<ImageSlot | null>(null);
  const [includeEars, setIncludeEars] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<ApiArtifacts | null>(null);

  useEffect(() => {
    return () => {
      revokePreview(faceImage);
      revokePreview(leftEar);
      revokePreview(rightEar);
    };
  }, [faceImage, leftEar, rightEar]);

  const canAnalyze = useMemo(() => {
    if (!consent || !faceImage || running) return false;
    if (includeEars && (!leftEar || !rightEar)) return false;
    return true;
  }, [consent, faceImage, includeEars, leftEar, rightEar, running]);

  function replaceSlot(nextKind: "face" | "leftEar" | "rightEar", nextSlot: ImageSlot) {
    // Revoke the previous object URL when a slot is replaced so previews do not leak memory.
    if (nextKind === "face") {
      revokePreview(faceImage);
      setFaceImage(nextSlot);
    }
    if (nextKind === "leftEar") {
      revokePreview(leftEar);
      setLeftEar(nextSlot);
    }
    if (nextKind === "rightEar") {
      revokePreview(rightEar);
      setRightEar(nextSlot);
    }
  }

  function clearSlot(kind: "face" | "leftEar" | "rightEar") {
    if (kind === "face") {
      revokePreview(faceImage);
      setFaceImage(null);
    }
    if (kind === "leftEar") {
      revokePreview(leftEar);
      setLeftEar(null);
    }
    if (kind === "rightEar") {
      revokePreview(rightEar);
      setRightEar(null);
    }
  }

  function setSlot(kind: "face" | "leftEar" | "rightEar", file: File | Blob, source: string) {
    setError(null);
    const slot = makeSlot(file, source);
    replaceSlot(kind, slot);
    setArtifacts(null);
  }

  async function analyze() {
    if (!canAnalyze || !faceImage) return;
    setRunning(true);
    setError(null);
    try {
      const parsedAge = actualAge.trim() ? Number(actualAge) : undefined;
      // Keep the API payload narrow: only the current face image, optional age, and optional ear images.
      const formData = new FormData();
      formData.append("faceImage", faceImage.blob, "face-image.png");
      if (Number.isFinite(parsedAge)) formData.append("actualAge", String(parsedAge));
      if (includeEars && leftEar) formData.append("leftEarImage", leftEar.blob, "left-ear.png");
      if (includeEars && rightEar) formData.append("rightEarImage", rightEar.blob, "right-ear.png");
      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? `Analysis API failed with status ${response.status}.`);
      }
      const result = (await response.json()) as ApiArtifacts;
      setArtifacts(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed unexpectedly.");
    } finally {
      setRunning(false);
    }
  }

  function downloadJson() {
    if (!artifacts) return;
    const url = URL.createObjectURL(reportBlob(artifacts.report));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "face-ai-prototype-report.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function downloadPdf() {
    if (!artifacts) return;
    const url = URL.createObjectURL(await pdfBlob(artifacts.report));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "face-ai-prototype-report.pdf";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="appShell">
      <section className="topBar">
        <div>
          <p className="eyebrow">Local non-diagnostic research prototype</p>
          <h1>{APP_NAME}</h1>
        </div>
        <div className="privacyPill">
          <ShieldCheck size={18} />
          <span>In-memory processing</span>
        </div>
      </section>

      <section className="notice">
        <strong>{DISCLAIMER}</strong>
        <span>No identity recognition, no sensitive inference, no disease prediction, and no image storage by default.</span>
      </section>

      <div className="workspace">
        <aside className="controlPanel">
          <label className="consentBox">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.currentTarget.checked)} />
            <span>{CONSENT_TEXT}</span>
          </label>

          <div className="section">
            <h2>Primary face image</h2>
            <FileInput
              label="Upload face image"
              helper="Use a clear, single-person frontal image."
              onFile={(file) => void setSlot("face", file, "upload")}
            />
            <CameraCapture label="Live face capture" onCapture={(blob) => void setSlot("face", blob, "camera")} />
            {faceImage ? (
              <ImagePreview title={`Face image (${faceImage.source})`} src={faceImage.preview} onClear={() => clearSlot("face")} />
            ) : null}
          </div>

          <div className="section">
            <h2>Optional apparent age delta</h2>
            <input
              className="textInput"
              inputMode="numeric"
              placeholder="Actual age, optional"
              value={actualAge}
              onChange={(event) => setActualAge(event.currentTarget.value.replace(/[^\d]/g, ""))}
            />
          </div>

          <div className="section">
            <label className="toggleRow">
              <input type="checkbox" checked={includeEars} onChange={(event) => setIncludeEars(event.currentTarget.checked)} />
              <span>Include optional side-view ear analysis</span>
            </label>
            <p className="helperText">
              This module only checks whether a diagonal crease-like pattern is visually present in side-view ear images.
            </p>
            {includeEars ? (
              <>
                <FileInput
                  label="Upload left ear image"
                  helper="Side-view or close-up ear image."
                  onFile={(file) => void setSlot("leftEar", file, "upload")}
                />
                <CameraCapture label="Live left ear capture" onCapture={(blob) => void setSlot("leftEar", blob, "camera")} />
                {leftEar ? <ImagePreview title={`Left ear (${leftEar.source})`} src={leftEar.preview} onClear={() => clearSlot("leftEar")} /> : null}

                <FileInput
                  label="Upload right ear image"
                  helper="Side-view or close-up ear image."
                  onFile={(file) => void setSlot("rightEar", file, "upload")}
                />
                <CameraCapture label="Live right ear capture" onCapture={(blob) => void setSlot("rightEar", blob, "camera")} />
                {rightEar ? <ImagePreview title={`Right ear (${rightEar.source})`} src={rightEar.preview} onClear={() => clearSlot("rightEar")} /> : null}
              </>
            ) : null}
          </div>

          <button className="runButton" type="button" disabled={!canAnalyze} onClick={() => void analyze()}>
            <Play size={18} />
            {running ? "Analyzing..." : "Run analysis"}
          </button>
          {!consent ? <p className="inlineWarning">Consent is required before processing.</p> : null}
          {includeEars && (!leftEar || !rightEar) ? <p className="inlineWarning">Add both left and right ear images before running optional ear analysis.</p> : null}
          {error ? <p className="inlineError">{error}</p> : null}
        </aside>

        <section className="resultsArea">
          {!artifacts ? (
            <div className="emptyState">
              <h2>Ready when you are</h2>
              <p>Choose a face image, confirm consent, then run the local visual analysis. Results will appear here with confidence, meaning, and limitations.</p>
            </div>
          ) : (
            <>
              <div className="resultHeader">
                <div>
                  <p className="eyebrow">Structured report</p>
                  <h2>Visual indicator results</h2>
                </div>
                <div className="buttonStack">
                  <button className="secondaryButton" type="button" onClick={downloadPdf}>
                    <FileText size={18} />
                    PDF
                  </button>
                  <button className="secondaryButton" type="button" onClick={downloadJson}>
                    <Download size={18} />
                    JSON
                  </button>
                </div>
              </div>

              <section className="guidePanel">
                <h3>How to read this report</h3>
                <p>Each section explains what the app measured, what the score means in simple language, and how reliable that result is for this image.</p>
                <ul className="detailList">
                  <li>Scores closer to 1 usually mean a stronger visual signal in that specific region.</li>
                  <li>Low confidence means the app measured something, but lighting, blur, framing, or visibility may be affecting it.</li>
                  <li>Face measurements like eye distance, nose width, and eyebrow spacing are only visual proportions from this photo.</li>
                  <li>Apparent age is a model estimate of how old the face looks in the image, not a factual or biological age.</li>
                </ul>
              </section>

              <ReportTable report={artifacts.report} />
              <ResultPanel result={artifacts.report.imageQuality} />
              <ResultPanel result={artifacts.report.face} />
              {artifacts.report.indicators.map((result) => (
                <ResultPanel key={result.indicator} result={result} />
              ))}

              <div className="overlayGrid">
                {Object.entries(artifacts.overlays)
                  .filter(([, src]) => Boolean(src))
                  .map(([name, src]) => (
                    <figure key={name}>
                      <img src={src ?? ""} alt={`${name} analysis overlay`} />
                      <figcaption>{name} overlay</figcaption>
                    </figure>
                  ))}
              </div>

              <section className="notice compact">
                <strong>{DISCLAIMER}</strong>
                <span>{artifacts.report.overallNotes.join(" ")}</span>
              </section>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function ImagePreview({ title, src, onClear }: { title: string; src: string; onClear: () => void }) {
  return (
    <figure className="preview">
      <img src={src} alt={title} />
      <figcaption>
        <span>{title}</span>
        <button className="iconButton" type="button" onClick={onClear} title="Remove image">
          <Trash2 size={16} />
        </button>
      </figcaption>
    </figure>
  );
}
