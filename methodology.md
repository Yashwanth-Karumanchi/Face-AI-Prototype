# Methodology

## 1. Goal

The goal of this prototype is not diagnosis. The goal is to demonstrate how a local AI system can analyze visible facial indicators in a conservative, explainable, modular way while keeping user consent, limitations, and uncertainty explicit.

## 2. System Overview

The system uses:

- React + TypeScript for the local user interface
- Node + Express for orchestration and image analysis
- `@vladmandic/human` for local face detection and dense face landmarks
- `DeepFace` for local apparent age estimation through a small Python helper
- Classical computer vision measurements for region-specific analysis

Processing is in-memory only.

## 3. Processing Pipeline

1. User provides consent.
2. User uploads or captures a primary face image.
3. Optional left and right ear images may also be provided.
4. The React app sends images to the local Node API.
5. The backend decodes the image and evaluates image quality.
6. The backend runs local face detection and dense landmarks.
7. Landmark-driven measurements are computed:
   - facial geometry ratios
   - facial feature measurements
   - under-eye visual darkness
   - glabella vertical line visibility
8. Apparent face age is estimated by calling the local DeepFace helper on a face crop.
9. Optional ear images are processed separately.
10. The backend returns a structured report with explanations, meanings, details, metrics, and limitations.

## 4. Why These Model Choices

### Human for face detection and landmarks

`@vladmandic/human` was selected because it provides a practical local Node-compatible stack for:

- face detection
- dense face landmarks
- local execution

This was a better fit for the final Node + React architecture than keeping the previous Python/Streamlit path.

### DeepFace for apparent age

DeepFace was retained for apparent age because:

- it already worked reasonably in earlier prototype iterations
- it provides a stronger age-estimation path than the lightweight JavaScript fallback we tried
- it can be isolated to one helper script while keeping the main application in Node

Only age estimation is used. No emotion, gender, or identity tasks are enabled.

## 5. Image Quality Logic

The image quality module estimates:

- blur from Laplacian-style variance
- brightness from grayscale mean
- contrast from grayscale standard deviation

The output is:

- `Good`
- `Acceptable`
- `Poor`

This stage does not block all downstream analysis, but it reduces confidence when image conditions are weak.

## 6. Face Landmark Logic

The system detects a single face and extracts dense landmarks. These landmarks are used only for visual region placement.

The system takes a conservative stance:

- no face:
  - returns `Not reliably assessed`
- multiple faces:
  - returns `Not reliably assessed`

The prototype does not identify the person.

## 7. Facial Geometry And Feature Measurements

Two related modules are used:

### Facial geometry ratios

- eye distance ratio
- nose width ratio
- face aspect ratio
- approximate left-right symmetry

### Facial feature measurements

- eye opening relative to eye width
- nose width relative to face width
- mouth width relative to face width
- eyebrow spacing relative to face width

These are visible-image proportions only. They are not health, identity, or demographic indicators.

## 8. Under-Eye Visual Darkness

The under-eye module:

- places a region below each lower eyelid
- places a nearby cheek baseline region
- compares the two regions using brightness and Lab-space differences

The result is reported as:

- `Low visual under-eye darkness`
- `Moderate visual under-eye darkness`
- `High visual under-eye darkness`

Low-confidence versions are allowed when the measurement exists but the image conditions reduce trust.

## 9. Glabella Vertical Line Visibility

The glabella module:

- crops the region between the eyebrows
- estimates vertical edge strength
- uses a conservative score to describe visible line intensity

The result is reported as:

- `Mild`
- `Moderate`
- `Strong`

Again, low-confidence versions are returned when measurement quality is limited.

## 10. Apparent Face Age

The backend creates a face crop from the detected face box and sends it to `server/deepface_age.py`.

That helper:

- decodes the face crop
- runs `DeepFace.analyze(..., actions=["age"])`
- returns only apparent age

This keeps the output narrow and avoids enabling unrelated or ethically sensitive inference tasks.

## 11. Optional Earlobe Crease-Like Visibility

The ear module runs only when optional side-view ear images are supplied.

It uses:

- ROI quality checks
- diagonal line evidence
- local edge strength
- dark-line contrast

It reports only visible crease-like patterns and avoids medical language.

## 12. Confidence And Reliability

Confidence is influenced by:

- image quality
- face framing
- landmark availability
- region visibility
- region-specific artifacts

Reliability is intentionally conservative. The system prefers reduced certainty over confident over-claiming.

## 13. Practical Trade-Offs

This prototype favors:

- local execution
- interpretable measurements
- modular analyzers
- explicit uncertainty

over:

- opaque end-to-end prediction
- aggressive automation
- high-stakes claims

That choice makes the system more explainable and ethically aligned, but less clinically expressive and less robust to uncontrolled capture conditions.
