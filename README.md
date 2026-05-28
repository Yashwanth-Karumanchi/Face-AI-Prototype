# Face AI Prototype

`Face AI Prototype` is a local, non-diagnostic face analysis research prototype built with a React frontend and a Node backend. It is designed to demonstrate ethical AI framing, practical computer vision reasoning, modular system design, and user-facing explainability without making medical or identity claims.

## What This Prototype Does

- Runs only after user consent.
- Processes a primary face image in memory through a local Node API.
- Uses a local face detector and dense face landmarks to measure visible facial regions.
- Reports image quality, face visibility, facial geometry, facial feature measurements, under-eye visual darkness, glabella vertical line visibility, apparent face age, and optional earlobe crease-like visibility.
- Exports a readable PDF report and a structured JSON report.

## What It Does Not Do

- No diagnosis, prognosis, or clinical decision support.
- No disease or risk prediction.
- No identity recognition, face verification, or person matching.
- No race, ethnicity, emotion, attractiveness, or other sensitive attribute inference.
- No default image storage.
- No model training on uploaded images.

## Models And Methods

### Local Node analysis

- `@vladmandic/human`
  - Face detector: local BlazeFace-based face detection.
  - Face mesh: local dense face landmark extraction.
- `sharp`
  - Image decoding, rotation handling, and cropping on the server.

### Local Python helper

- `DeepFace`
  - Used only for apparent face age estimation.
  - Called from the Node backend through `server/deepface_age.py`.

### Classical CV logic

- Image quality:
  - blur via Laplacian-style variance
  - brightness via grayscale mean
  - contrast via grayscale standard deviation
- Under-eye visual darkness:
  - compares under-eye regions against nearby cheek baseline regions using Lab-space differences
- Glabella vertical line visibility:
  - measures vertical edge strength in the region between the eyebrows
- Earlobe crease-like visibility:
  - optional side-view ear analysis using conservative diagonal-line evidence

## Architecture

- Frontend: React + TypeScript + Vite
- Backend: Node + Express
- Age helper: Python + DeepFace
- Processing mode: local and in-memory

Flow:

1. User uploads or captures a face image.
2. React sends the image to the local Node API.
3. Node decodes the image and runs Human face detection and face mesh.
4. Node runs region-based analyzers for geometry, under-eye, glabella, and optional ear images.
5. Node calls the local Python DeepFace helper for apparent face age.
6. React renders the returned report with plain-language explanations, visible measurements, confidence, and limitations.

## Result Design

Each module returns:

- `result`
- `score`
- `confidence`
- `reliable`
- `explanation`
- `meaning`
- `limitations`
- optional `details`
- optional `metrics`

This keeps the UI simple while preserving enough structure for later API wrapping, batch processing, or evaluation tooling.

## Setup

### Prerequisites

- Node.js 20+
- npm 10+
- Python 3.11
- A local Python virtual environment at `.venv` for the age helper

### JavaScript dependencies

Install frontend and backend JavaScript dependencies:

```bash
npm install
```

### Python age-helper dependencies

Create the local Python environment used by the apparent-age helper:

```bash
py -3.11 -m venv .venv
```

Windows PowerShell:

```bash
.venv\Scripts\activate
pip install -r server/requirements-age.txt
```

macOS/Linux:

```bash
source .venv/bin/activate
pip install -r server/requirements-age.txt
```

The checked-in Python dependency file is:

- `server/requirements-age.txt`
  - `deepface==0.0.100`
  - `tensorflow==2.19.0`
  - `tf-keras==2.19.0`
  - `opencv-python`
  - `numpy<2`

Notes:

- `.venv/` is intentionally ignored by Git and should not be committed.
- The repo contains the DeepFace integration code and dependency file, not the installed environment itself.
- If the Python helper dependencies are missing, the main app still runs, but the apparent-age module will return `Not assessed`.
- If `pip install -r server/requirements-age.txt` says it cannot find `tensorflow`, the virtual environment is almost certainly using the wrong Python version. Recreate it with Python 3.11.

## Run

From a clean clone, the usual sequence is:

```bash
npm install
py -3.11 -m venv .venv
.venv\Scripts\activate
pip install -r server/requirements-age.txt
npm run build
npm run dev
```

This starts:

- React UI at `http://127.0.0.1:5173`
- Node API at `http://127.0.0.1:3001`

## Downloadable Outputs

- PDF report:
  - user-friendly narrative export
- JSON report:
  - structured machine-readable export

Neither export includes raw image data.

## Repository Structure

- `src/`
  - React UI
- `server/index.js`
  - local API entrypoint
- `server/analyzer.js`
  - main visual analysis pipeline
- `server/deepface_age.py`
  - local DeepFace age helper
- `server/requirements-age.txt`
  - reproducible Python dependencies for the age helper
- `sample_outputs/`
  - sample structured output
- `ethics_and_limitations.md`
  - safety boundaries
- `methodology.md`
  - technical methodology

## Known Limitations

- Landmark-dependent results can drift with pose, blur, occlusion, glasses, shadows, expression, and image compression.
- Apparent age is a model estimate, not factual or biological age.
- A fresh clone needs the local Python age-helper environment installed or apparent age will return `Not assessed`.
- Earlobe analysis only makes sense for side-view or close-up ear images.
- The prototype is not clinically validated.
- Confidence and reliability are heuristic, not calibration-certified.

## Research-Oriented Future Improvements

- Add a formal evaluation set with controlled variation across lighting, device quality, pose, glasses, facial hair, and makeup.
- Benchmark multiple local landmark stacks against the same face-region tasks to quantify measurement stability.
- Add confidence calibration against an annotated reference set instead of relying only on heuristic thresholds.
- Introduce repeated-capture consistency scoring so unstable measurements across multiple captures can be flagged automatically.
- Add multi-view fusion for front, left-oblique, and right-oblique images to improve region visibility and measurement robustness.
- Build a small offline regression test suite with canonical expected outputs for quality, under-eye, glabella, and ear modules.
- Add fairness and robustness review across age ranges, skin tones, accessories, and capture environments.
- Separate model configuration and evaluation artifacts into a lightweight model registry for versioned comparisons.
