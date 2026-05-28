import sharp from "sharp";
import "@tensorflow/tfjs-backend-cpu";
import { spawn } from "node:child_process";
import HumanModule from "../node_modules/@vladmandic/human/dist/human.node-wasm.js";

export const DISCLAIMER =
  "This prototype is not a medical device, does not provide medical advice, and should not be used for clinical decision-making.";

export const LIMITATIONS = {
  visual:
    "Lighting, shadows, pose, facial expression, camera quality, image compression, glasses, hair, makeup, and landmark placement may affect this non-diagnostic visual observation.",
  ear:
    "This is a non-diagnostic visual observation. Lighting, skin folds, wrinkles, earrings, hair, pose, image resolution, and shadows may affect the result. This does not indicate or rule out any medical condition.",
};

let humanPromise = null;
export function initHuman(modelBasePath) {
  if (!humanPromise) {
    const human = new HumanModule.Human({
      debug: false,
      backend: "cpu",
      modelBasePath,
      cacheSensitivity: 0,
      face: {
        enabled: true,
        detector: { enabled: true, modelPath: "blazeface.json", maxDetected: 2, minConfidence: 0.2 },
        mesh: { enabled: true, modelPath: "facemesh.json" },
        description: { enabled: false },
        emotion: { enabled: false },
        iris: { enabled: false },
        antispoof: { enabled: false },
        liveness: { enabled: false },
      },
      body: { enabled: false },
      hand: { enabled: false },
      object: { enabled: false },
      gesture: { enabled: false },
    });
    humanPromise = human.load().then(() => human);
  }
  return humanPromise;
}

export async function analyzeReport({ human, faceBuffer, leftEarBuffer, rightEarBuffer, actualAge }) {
  const faceImage = await decodeImage(faceBuffer);
  const imageQuality = assessImageQuality(faceImage);
  const face = await detectFace(human, faceImage);
  // The geometry and region-scoring modules are synchronous, while age and ear analysis can run in parallel.
  const baseIndicators = [
    analyzeFacialGeometry(face),
    analyzeFacialFeatureDetails(face),
    analyzeUnderEye(faceImage, face, imageQuality.reliable),
    analyzeGlabella(faceImage, face, imageQuality.reliable),
  ];
  const [ageIndicator, leftEarIndicator, rightEarIndicator, underEyeOverlay, glabellaOverlay] = await Promise.all([
    estimateApparentAge(faceImage, face, actualAge),
    analyzeEar(leftEarBuffer, "left"),
    analyzeEar(rightEarBuffer, "right"),
    face.detected ? drawRegionOverlay(faceImage, underEyeRects(face).flatMap((pair) => [pair.under, pair.cheek]), "under-eye / cheek") : Promise.resolve(null),
    face.detected ? drawRegionOverlay(faceImage, [glabellaRect(face)], "glabella region") : Promise.resolve(null),
  ]);
  const indicators = [...baseIndicators, ageIndicator, leftEarIndicator, rightEarIndicator];

  return {
    report: {
      app: {
        name: "Face AI Prototype",
        version: "1.1.0",
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
    },
    overlays: {
      underEye: underEyeOverlay,
      glabella: glabellaOverlay,
    },
  };
}

async function decodeImage(buffer) {
  const decoded = await sharp(buffer).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return {
    data: new Uint8Array(decoded.data),
    width: decoded.info.width,
    height: decoded.info.height,
    channels: decoded.info.channels,
    originalBuffer: buffer,
  };
}

function indicator(base) {
  return {
    score: null,
    confidence: "Low",
    reliable: false,
    metrics: {},
    debug: {},
    ...base,
  };
}

function grayAt(image, x, y) {
  const ix = Math.max(0, Math.min(image.width - 1, Math.round(x)));
  const iy = Math.max(0, Math.min(image.height - 1, Math.round(y)));
  const offset = (iy * image.width + ix) * image.channels;
  return 0.299 * image.data[offset] + 0.587 * image.data[offset + 1] + 0.114 * image.data[offset + 2];
}

function rgbAt(image, x, y) {
  const ix = Math.max(0, Math.min(image.width - 1, Math.round(x)));
  const iy = Math.max(0, Math.min(image.height - 1, Math.round(y)));
  const offset = (iy * image.width + ix) * image.channels;
  return [image.data[offset], image.data[offset + 1], image.data[offset + 2]];
}

function mean(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function stdev(values, avg = mean(values)) {
  return values.length ? Math.sqrt(values.reduce((a, b) => a + (b - avg) ** 2, 0) / values.length) : 0;
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function assessImageQuality(image) {
  const values = [];
  for (let y = 0; y < image.height; y += 3) {
    for (let x = 0; x < image.width; x += 3) values.push(grayAt(image, x, y));
  }
  const brightness = mean(values);
  const contrast = stdev(values, brightness);
  const laplacian = [];
  for (let y = 1; y < image.height - 1; y += 3) {
    for (let x = 1; x < image.width - 1; x += 3) {
      laplacian.push(-4 * grayAt(image, x, y) + grayAt(image, x - 1, y) + grayAt(image, x + 1, y) + grayAt(image, x, y - 1) + grayAt(image, x, y + 1));
    }
  }
  const blur = stdev(laplacian) ** 2;
  const score = clamp(0.45 * clamp((blur - 35) / 180) + 0.3 * clamp(1 - Math.abs(brightness - 128) / 110) + 0.25 * clamp((contrast - 18) / 55));
  const result = score < 0.42 || blur < 35 || brightness < 40 || brightness > 225 || contrast < 15 ? "Poor" : score < 0.68 ? "Acceptable" : "Good";
  return indicator({
    indicator: "Image quality",
    result,
    score: round(score),
    confidence: result === "Good" ? "High" : result === "Acceptable" ? "Medium" : "Low",
    reliable: result !== "Poor",
    explanation: qualityExplanation(result, blur, brightness, contrast),
    meaning: result === "Good" ? "Good means the image is likely usable for visual measurements in this prototype." : result === "Acceptable" ? "Acceptable means analysis can run, but confidence may be reduced." : "Poor means visual measurements may be unstable.",
    limitations: "This quality score is a computer-vision usability check, not a judgment about the person or the image content.",
    details: qualityDetails(blur, brightness, contrast),
    metrics: { blurVariance: round(blur, 2), brightness: round(brightness, 2), contrast: round(contrast, 2) },
  });
}

function qualityExplanation(result, blur, brightness, contrast) {
  const comments = [];
  if (blur < 75) comments.push("the image is a little soft");
  if (brightness < 55) comments.push("the image is somewhat dark");
  if (brightness > 205) comments.push("the image is very bright");
  if (contrast < 25) comments.push("the image has low contrast");
  if (!comments.length) return "The image has enough focus, brightness, and contrast for prototype visual analysis.";
  return `${result} quality because ${comments.join(", ")}. The app can still analyze visible regions, but confidence may be lower.`;
}

function qualityDetails(blur, brightness, contrast) {
  return [
    blur >= 75 ? "Focus looks usable for this prototype." : "Focus looks soft, so small lines and edges may be harder to measure.",
    brightness >= 55 && brightness <= 205 ? "Brightness is in a usable range." : "Brightness is outside the ideal range, so shadows or glare may affect results.",
    contrast >= 25 ? "Contrast is enough to separate many facial regions." : "Low contrast can make landmarks and fine lines less stable.",
  ];
}

async function detectFace(human, image) {
  const tensor = human.tf.tensor3d(image.data, [image.height, image.width, image.channels]);
  try {
    const result = await human.detect(tensor);
    if (!result.face?.length) return faceFailure("Face not detected. Please upload a clear frontal face image.");
    if (result.face.length > 1) return faceFailure("Multiple faces were detected. Please use a single-person image for this prototype.", { faceCount: result.face.length });
    const detected = result.face[0];
    const mesh = detected.mesh ?? [];
    const box = detected.box ? { x: detected.box[0], y: detected.box[1], width: detected.box[2], height: detected.box[3] } : boxFromPoints(mesh, image);
    const faceArea = (box.width * box.height) / (image.width * image.height);
    const centerOffset = Math.abs(box.x + box.width / 2 - image.width / 2) / image.width;
    const suitable = mesh.length >= 468 && faceArea > 0.05 && faceArea < 0.78;
    // Persist only the coordinates we need downstream so the returned report stays compact and serializable.
    return {
      indicator: "Face detection and landmarks",
      result: suitable ? "Face detected" : "Face detected with framing limitations",
      score: round(detected.score ?? detected.faceScore ?? 0),
      confidence: suitable ? "High" : "Medium",
      reliable: suitable,
      detected: true,
      landmarks: mesh.map((p) => ({ x: p[0], y: p[1], z: p[2] ?? 0 })),
      faceBox: box,
      explanation: "A single face was detected on the Node backend and face mesh landmarks were extracted for visual indicator analysis.",
      meaning: "Face detected means the app found one face and can use landmark geometry. It does not identify or recognize the person.",
      limitations: LIMITATIONS.visual,
      metrics: { landmarkCount: mesh.length, faceAreaRatio: round(faceArea), centerOffset: round(centerOffset) },
    };
  } finally {
    human.tf.dispose(tensor);
  }
}

function faceFailure(message, debug = {}) {
  return {
    indicator: "Face detection and landmarks",
    result: "Not reliably assessed",
    score: null,
    confidence: "Low",
    reliable: false,
    detected: false,
    landmarks: [],
    faceBox: null,
    explanation: message,
    meaning: "Not reliably assessed means the prototype does not have enough face landmark information to continue facial-region analysis.",
    limitations: LIMITATIONS.visual,
    debug,
  };
}

function boxFromPoints(points, image) {
  if (!points.length) return null;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x = Math.max(0, Math.min(...xs));
  const y = Math.max(0, Math.min(...ys));
  return { x, y, width: Math.min(image.width, Math.max(...xs)) - x, height: Math.min(image.height, Math.max(...ys)) - y };
}

function analyzeFacialGeometry(face) {
  if (!face.detected || face.landmarks.length < 468) {
    return indicator({
      indicator: "Facial geometry ratios",
      result: "Not reliably assessed",
      explanation: "Facial geometry ratios require reliable face landmarks.",
      meaning: "Not reliably assessed means geometry was not measured.",
      limitations: LIMITATIONS.visual,
    });
  }
  const p = (i) => face.landmarks[i];
  const faceWidth = dist(p(234), p(454));
  const faceHeight = dist(p(10), p(152));
  const eyeDistanceRatio = dist(p(33), p(263)) / Math.max(faceWidth, 1);
  const noseWidthRatio = dist(p(98), p(327)) / Math.max(faceWidth, 1);
  const symmetry = 1 - Math.min(1, Math.abs(dist(p(234), p(1)) - dist(p(1), p(454))) / Math.max(dist(p(234), p(1)), dist(p(1), p(454)), 1));
  return indicator({
    indicator: "Facial geometry ratios",
    result: "Measured",
    score: round((symmetry + clamp(eyeDistanceRatio / 0.48) + clamp(noseWidthRatio / 0.28)) / 3),
    confidence: face.reliable ? "High" : "Medium",
    reliable: face.reliable,
    explanation: "Neutral ratios were computed from facial landmarks.",
    meaning: "Measured means geometric proportions were calculated only as visual measurements. They are not health, identity, attractiveness, or ancestry indicators.",
    limitations: LIMITATIONS.visual,
    details: [
      `Eye distance is about ${percent(eyeDistanceRatio)} of face width in this image.`,
      `Nose width is about ${percent(noseWidthRatio)} of face width in this image.`,
      `Face height is about ${round(faceHeight / Math.max(faceWidth, 1), 2)} times the measured face width.`,
      `Left-right balance is ${symmetry >= 0.94 ? "very similar" : symmetry >= 0.88 ? "fairly similar" : "less even"}, based only on landmark positions.`,
    ],
    metrics: { eyeDistanceRatio: round(eyeDistanceRatio), noseWidthRatio: round(noseWidthRatio), faceAspectRatio: round(faceHeight / Math.max(faceWidth, 1)), symmetryApproximation: round(symmetry) },
  });
}

function analyzeFacialFeatureDetails(face) {
  if (!face.detected || face.landmarks.length < 468) {
    return indicator({
      indicator: "Facial feature measurements",
      result: "Not reliably assessed",
      explanation: "Feature measurements require reliable face landmarks.",
      meaning: "Not reliably assessed means the app could not place enough points on the face.",
      limitations: LIMITATIONS.visual,
    });
  }
  const p = (i) => face.landmarks[i];
  const faceWidth = dist(p(234), p(454));
  const leftEyeWidth = dist(p(33), p(133));
  const leftEyeOpen = dist(p(159), p(145));
  const rightEyeWidth = dist(p(362), p(263));
  const rightEyeOpen = dist(p(386), p(374));
  const avgEyeOpenRatio = ((leftEyeOpen / Math.max(leftEyeWidth, 1)) + (rightEyeOpen / Math.max(rightEyeWidth, 1))) / 2;
  const noseWidthRatio = dist(p(98), p(327)) / Math.max(faceWidth, 1);
  const mouthWidthRatio = dist(p(61), p(291)) / Math.max(faceWidth, 1);
  const browDistanceRatio = dist(p(70), p(300)) / Math.max(faceWidth, 1);
  const eyeShape = avgEyeOpenRatio >= 0.34 ? "more open/rounded" : avgEyeOpenRatio >= 0.22 ? "balanced/almond-like" : "narrower in this photo";
  return indicator({
    indicator: "Facial feature measurements",
    result: "Measured",
    score: null,
    confidence: face.reliable ? "High" : "Medium",
    reliable: face.reliable,
    explanation: "The app measured simple landmark distances for eyes, nose, mouth, and eyebrow spacing.",
    meaning: "These are plain visual measurements from this image only. They do not identify the person or describe health.",
    limitations: LIMITATIONS.visual,
    details: [
      `Eye shape appears ${eyeShape}, based on eye opening compared with eye width.`,
      `Nose width is ${percent(noseWidthRatio)} of measured face width.`,
      `Mouth width is ${percent(mouthWidthRatio)} of measured face width.`,
      `Eyebrow spacing is ${percent(browDistanceRatio)} of measured face width.`,
    ],
    metrics: {
      averageEyeOpeningRatio: round(avgEyeOpenRatio),
      noseWidthRatio: round(noseWidthRatio),
      mouthWidthRatio: round(mouthWidthRatio),
      eyebrowSpacingRatio: round(browDistanceRatio),
    },
  });
}

function analyzeUnderEye(image, face, qualityReliable) {
  if (!face.detected || face.landmarks.length < 468) {
    return indicator({
      indicator: "Under-eye visual darkness",
      result: "Not reliably assessed",
      explanation: "Under-eye analysis requires reliable face landmarks.",
      meaning: "Not reliably assessed means the region could not be measured with enough reliability.",
      limitations: LIMITATIONS.visual,
    });
  }
  const pairs = underEyeRects(face);
  const scores = pairs.map(({ under, cheek }) => {
    const underLab = avgLab(image, under);
    const cheekLab = avgLab(image, cheek);
    const brightnessDelta = cheekLab[0] - underLab[0];
    const colorDelta = Math.hypot(cheekLab[0] - underLab[0], cheekLab[1] - underLab[1], cheekLab[2] - underLab[2]);
    return { score: clamp(0.65 * clamp(brightnessDelta / 28) + 0.35 * clamp(colorDelta / 24)), brightnessDelta, colorDelta };
  });
  const score = (scores[0].score + scores[1].score) / 2;
  const reliable = qualityReliable && face.reliable;
  const category = score >= 0.5 ? "High visual under-eye darkness" : score >= 0.25 ? "Moderate visual under-eye darkness" : "Low visual under-eye darkness";
  return indicator({
    indicator: "Under-eye visual darkness",
    result: reliable ? category : `${category}, low confidence`,
    score: round(score),
    confidence: reliable ? "Medium" : "Low",
    reliable,
    explanation: reliable ? "Under-eye regions were compared with nearby cheek baseline regions using brightness and Lab color differences." : "A visual contrast score was computed, but image quality, framing, glasses/glare, or landmark placement may reduce reliability.",
    meaning: "Low, Moderate, and High describe how much darker or different the under-eye area looks compared with nearby cheek skin in this image only. They are not medical findings.",
    limitations: LIMITATIONS.visual,
    details: [
      "High usually means the under-eye region measured darker or more color-different than the cheek baseline.",
      "Moderate means there was some visible difference from the cheek baseline.",
      "Low means the under-eye and cheek baseline looked more similar in this image.",
      reliable ? "The region placement looked usable." : "Confidence is low because image quality, framing, glasses, glare, or landmark placement may affect this measurement.",
    ],
    metrics: { leftScore: round(scores[0].score), rightScore: round(scores[1].score), leftBrightnessDelta: round(scores[0].brightnessDelta, 2), rightBrightnessDelta: round(scores[1].brightnessDelta, 2) },
  });
}

function underEyeRects(face) {
  return ["left", "right"].map((side) => {
    const ids = side === "left" ? [33, 133, 159, 145] : [362, 263, 386, 374];
    const pts = ids.map((id) => face.landmarks[id]);
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    const maxY = Math.max(...pts.map((p) => p.y));
    const minY = Math.min(...pts.map((p) => p.y));
    const eyeWidth = maxX - minX;
    const eyeHeight = Math.max(8, maxY - minY);
    return {
      under: { x: minX + eyeWidth * 0.05, y: maxY + eyeHeight * 0.45, width: eyeWidth * 0.9, height: eyeHeight * 1.25, color: "#5aa9ff" },
      cheek: { x: minX + (side === "left" ? -eyeWidth * 0.08 : eyeWidth * 0.08), y: maxY + eyeHeight * 2.15, width: eyeWidth * 0.82, height: eyeHeight * 1.35, color: "#38d488" },
    };
  });
}

function analyzeGlabella(image, face, qualityReliable) {
  if (!face.detected || face.landmarks.length < 468) {
    return indicator({
      indicator: "Glabella vertical line visibility",
      result: "Not reliably assessed",
      explanation: "Glabella analysis requires reliable face landmarks.",
      meaning: "Not reliably assessed means the between-eyebrow region could not be measured.",
      limitations: LIMITATIONS.visual,
    });
  }
  const rect = glabellaRect(face);
  let vertical = 0;
  let count = 0;
  for (let y = rect.y + 1; y < rect.y + rect.height - 1; y += 1) {
    for (let x = rect.x + 1; x < rect.x + rect.width - 1; x += 1) {
      const gx = Math.abs(grayAt(image, x + 1, y) - grayAt(image, x - 1, y));
      const gy = Math.abs(grayAt(image, x, y + 1) - grayAt(image, x, y - 1));
      vertical += gx > gy * 1.15 ? gx : 0;
      count += 1;
    }
  }
  const score = clamp(vertical / Math.max(count * 42, 1));
  const reliable = qualityReliable && face.reliable;
  const category = score >= 0.58 ? "Strong" : score >= 0.34 ? "Moderate" : "Mild";
  return indicator({
    indicator: "Glabella vertical line visibility",
    result: reliable ? category : `${category}, low confidence`,
    score: round(score),
    confidence: reliable ? "Medium" : "Low",
    reliable,
    explanation: "The region between the eyebrows was measured for vertical edge strength.",
    meaning: "Mild, Moderate, and Strong describe how visible vertical between-eyebrow lines look in this image only. They are not medical or age findings.",
    limitations: LIMITATIONS.visual,
    details: [
      "Strong usually means the between-eyebrow area had clearer vertical edges or darker narrow lines.",
      "Moderate means some vertical line pattern was visible.",
      "Mild means little vertical line contrast was measured.",
      reliable ? "The region placement looked usable." : "Confidence is low because lighting, glasses, expression, or landmark placement may affect this measurement.",
    ],
    metrics: { verticalEdgeStrength: round(score) },
  });
}

function glabellaRect(face) {
  const left = face.landmarks[55];
  const right = face.landmarks[285];
  const top = face.landmarks[9];
  const center = face.landmarks[168];
  const width = Math.max(24, Math.abs(right.x - left.x) * 0.72);
  const height = Math.max(22, Math.abs(center.y - top.y) * 1.45);
  return { x: (left.x + right.x) / 2 - width / 2, y: top.y + height * 0.1, width, height, color: "#ffb84d" };
}

async function estimateApparentAge(image, face, actualAge) {
  if (!face.detected || !face.faceBox) {
    return indicator({
      indicator: "Apparent face age estimate",
      result: "Not assessed",
      explanation: "Apparent age requires a detected face region.",
      meaning: "Not assessed means the app did not have enough face information to estimate apparent age.",
      limitations: "Apparent age estimation can be inaccurate and must not be interpreted as biological age, health status, identity, or clinical information.",
      metrics: { providedAge: actualAge ?? null, ageDelta: null },
    });
  }
  try {
    const crop = await buildFaceCrop(image.originalBuffer, face.faceBox, image.width, image.height);
    const age = await estimateAgeWithDeepFace(crop);
    const delta = Number.isFinite(actualAge) ? round(age - actualAge, 1) : null;
    return indicator({
      indicator: "Apparent face age estimate",
      result: `${Math.round(age)} years apparent age`,
      score: round(age, 1),
      confidence: face.reliable ? "Medium" : "Low",
      reliable: face.reliable,
      explanation: "A local DeepFace age model estimated apparent age from the detected face crop.",
      meaning: "This is only how old the face appears to this model in this image. It is not biological age, health age, or identity.",
      limitations: "Apparent age estimation can be inaccurate and is affected by lighting, pose, camera quality, expression, facial hair, glasses, and model bias.",
      details: [
        `Estimated apparent age: about ${Math.round(age)} years.`,
        delta === null ? "No actual age was entered, so no age delta was calculated." : `Compared with the age you entered, the model estimate is ${Math.abs(delta)} years ${delta >= 0 ? "higher" : "lower"}.`,
        "Use this only as a prototype model output, not as a factual age statement.",
      ],
      metrics: { estimatedApparentAge: round(age, 1), providedAge: actualAge ?? null, ageDelta: delta },
    });
  } catch (error) {
    return indicator({
      indicator: "Apparent face age estimate",
      result: "Not assessed",
      explanation: "The apparent-age model could not run in this local session.",
      meaning: "Not assessed means no usable apparent-age estimate was produced.",
      limitations: "Apparent age estimation can be inaccurate and must not be interpreted as biological age, health status, identity, or clinical information.",
      metrics: { providedAge: actualAge ?? null, ageDelta: null },
      debug: { error: error instanceof Error ? error.message : String(error) },
    });
  }
}

async function buildFaceCrop(buffer, faceBox, imageWidth, imageHeight) {
  const left = Math.max(0, Math.floor(faceBox.x - faceBox.width * 0.1));
  const top = Math.max(0, Math.floor(faceBox.y - faceBox.height * 0.12));
  const width = Math.max(32, Math.min(imageWidth - left, Math.floor(faceBox.width * 1.2)));
  const height = Math.max(32, Math.min(imageHeight - top, Math.floor(faceBox.height * 1.24)));
  return sharp(buffer)
    .rotate()
    .extract({ left, top, width, height })
    .png()
    .toBuffer();
}

async function estimateAgeWithDeepFace(faceCropBuffer) {
  const payload = JSON.stringify({
    image_base64: faceCropBuffer.toString("base64"),
  });

  return new Promise((resolve, reject) => {
    // Age estimation stays in a tiny Python sidecar so the main API can remain Node-native.
    const child = spawn(".\\.venv\\Scripts\\python.exe", ["server\\deepface_age.py"], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      try {
        const result = JSON.parse(stdout || "{}");
        if (code === 0 && result.ok && Number.isFinite(result.age)) {
          resolve(result.age);
          return;
        }
        reject(new Error(result.error || stderr || `DeepFace helper exited with code ${code}.`));
      } catch (error) {
        reject(new Error(stderr || `Could not parse DeepFace output: ${String(error)}`));
      }
    });

    child.stdin.write(payload);
    child.stdin.end();
  });
}

async function analyzeEar(buffer, side) {
  if (!buffer) {
    return indicator({
      indicator: `${side} visible diagonal earlobe crease pattern`,
      result: "Not assessed",
      explanation: "No side-view or close-up ear image was provided.",
      meaning: "Not assessed means the optional ear module did not run.",
      limitations: LIMITATIONS.ear,
      debug: { earRoiFound: false },
    });
  }
  const image = await decodeImage(buffer);
  // The current ear module assumes a close-up/side-view capture and searches the central/lower band conservatively.
  const r = { x: image.width * 0.15, y: image.height * 0.2, width: image.width * 0.7, height: image.height * 0.75 };
  const values = [];
  for (let y = r.y; y < r.y + r.height; y += 3) for (let x = r.x; x < r.x + r.width; x += 3) values.push(grayAt(image, x, y));
  const brightness = mean(values);
  const contrast = stdev(values, brightness);
  if (r.width < 80 || r.height < 100 || brightness < 42 || brightness > 225 || contrast < 16) {
    return indicator({
      indicator: `${side} visible diagonal earlobe crease pattern`,
      result: "Not assessed",
      explanation: "The optional ear image was too small, too dark, too bright, or too low contrast for conservative assessment.",
      meaning: "Not assessed means the visible region was not usable enough for this prototype.",
      limitations: LIMITATIONS.ear,
      debug: { roiQuality: "Poor" },
    });
  }
  const best = bestDiagonalLine(image, r);
  const result = best.score >= 0.6 ? "Diagonal crease pattern visible" : best.score >= 0.35 ? "Possible diagonal crease visible" : "No clear diagonal crease visible";
  return indicator({
    indicator: `${side} visible diagonal earlobe crease pattern`,
    result,
    score: round(best.score),
    confidence: best.score >= 0.6 ? "Medium" : best.score >= 0.35 ? "Medium" : "Low",
    reliable: best.score >= 0.6,
    explanation: "The side-view image was analyzed for diagonal crease-like line evidence using line length, local edge strength, dark-line contrast, and diagonal angle.",
    meaning: "No clear, Possible, and Visible describe whether a diagonal crease-like visual pattern appeared in the ear image. This is not medically accurate and does not indicate or rule out any condition.",
    limitations: LIMITATIONS.ear,
    metrics: { roiQuality: contrast > 30 ? "Good" : "Acceptable", lineStrength: round(best.edge), creaseAngleDegrees: best.angle },
  });
}

function bestDiagonalLine(image, rect) {
  let best = { score: 0, edge: 0, angle: null };
  // Sweep a small family of plausible crease angles instead of hard-coding one line hypothesis.
  for (const angle of [-65, -55, -45, -35, -25, 25, 35, 45, 55, 65]) {
    for (const yRatio of [0.56, 0.62, 0.68, 0.74, 0.8]) {
      const rad = (angle * Math.PI) / 180;
      const length = Math.min(rect.width, rect.height) * 0.48;
      const cx = rect.x + rect.width * 0.5;
      const cy = rect.y + rect.height * yRatio;
      let edge = 0;
      for (let i = 0; i < 42; i += 1) {
        const t = i / 41 - 0.5;
        const x = cx + Math.cos(rad) * length * t;
        const y = cy + Math.sin(rad) * length * t;
        const gx = Math.abs(grayAt(image, x + 1, y) - grayAt(image, x - 1, y));
        const gy = Math.abs(grayAt(image, x, y + 1) - grayAt(image, x, y - 1));
        edge += clamp((gx + gy) / 110);
      }
      edge /= 42;
      const score = clamp(0.65 * edge + 0.35 * clamp(1 - Math.abs(Math.abs(angle) - 45) / 25));
      if (score > best.score) best = { score, edge, angle: Math.abs(angle) };
    }
  }
  return best;
}

function avgLab(image, rect) {
  const labs = [];
  for (let y = rect.y; y < rect.y + rect.height; y += 2) {
    for (let x = rect.x; x < rect.x + rect.width; x += 2) labs.push(rgbToLab(...rgbAt(image, x, y)));
  }
  return [mean(labs.map((v) => v[0])), mean(labs.map((v) => v[1])), mean(labs.map((v) => v[2]))];
}

function rgbToLab(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  r = r > 0.04045 ? ((r + 0.055) / 1.055) ** 2.4 : r / 12.92;
  g = g > 0.04045 ? ((g + 0.055) / 1.055) ** 2.4 : g / 12.92;
  b = b > 0.04045 ? ((b + 0.055) / 1.055) ** 2.4 : b / 12.92;
  let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  let y = (r * 0.2126 + g * 0.7152 + b * 0.0722);
  let z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  x = x > 0.008856 ? Math.cbrt(x) : 7.787 * x + 16 / 116;
  y = y > 0.008856 ? Math.cbrt(y) : 7.787 * y + 16 / 116;
  z = z > 0.008856 ? Math.cbrt(z) : 7.787 * z + 16 / 116;
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

async function drawRegionOverlay(image, rects, label) {
  const png = await sharp(image.originalBuffer).rotate().resize({ width: image.width }).png().toBuffer();
  const href = `data:image/png;base64,${png.toString("base64")}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${image.width}" height="${image.height}" viewBox="0 0 ${image.width} ${image.height}">
    <image href="${href}" width="${image.width}" height="${image.height}"/>
    ${rects.map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="none" stroke="${r.color ?? "#25b7a4"}" stroke-width="4"/><text x="${r.x + 6}" y="${Math.max(20, r.y - 8)}" fill="${r.color ?? "#25b7a4"}" font-size="18" font-family="Arial" font-weight="700">${label}</text>`).join("")}
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function round(value, digits = 3) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function percent(value) {
  return `${Math.round(value * 100)}%`;
}
