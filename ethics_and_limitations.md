# Ethics And Limitations

## Non-Diagnostic Position

This project is a non-diagnostic research prototype. It is not a medical device, does not provide medical advice, and should not be used for clinical decision-making.

## Consent Before Processing

No analysis should run unless the user explicitly confirms consent and permission to analyze the image.

## Local Processing

Images are processed locally through the React + Node application stack. The backend analyzes images in memory and returns only structured results and optional overlays.

The system does not store uploaded images by default.

## No Identity Recognition

The face stack is used only for landmark-driven region placement and visual measurement. The application does not identify, recognize, compare, or verify people.

## No Sensitive Attribute Inference

The system must not infer:

- race
- ethnicity
- emotion
- attractiveness
- identity
- any other sensitive personal attribute

## Narrow Use Of Models

- Human is used for face detection and dense landmarks.
- DeepFace is used only for apparent face age.

DeepFace is not used here for identity, verification, emotion, or demographic claims.

## Conservative Reporting

False certainty is more harmful than uncertainty in this setting. Low-confidence or low-visibility conditions should lead to:

- lower confidence
- lower reliability
- `Not assessed`
- `Not reliably assessed`

## Practical Failure Modes

The prototype can be affected by:

- poor lighting
- blur
- compression artifacts
- head pose
- partial occlusion
- glasses
- facial hair
- makeup
- image cropping
- side-view quality

## Fairness And Validation Limits

This system has not undergone formal clinical validation, demographic calibration, or fairness benchmarking across broad capture conditions and populations.

Any serious real-world use would require:

- curated evaluation datasets
- uncertainty calibration
- subgroup robustness analysis
- external review
- clearly defined intended use

## Output Boundaries

The output is a visual prototype report. It should be interpreted as:

- descriptive
- non-diagnostic
- limited to the specific image provided

It should not be interpreted as:

- a diagnosis
- a risk score
- proof of age
- proof of health
- proof of identity
