import * as faceapi from "face-api.js";

let isModelLoaded = false;

const loadAllModelsFrom = async (baseUrl: string) => {
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(baseUrl),
    faceapi.nets.faceLandmark68Net.loadFromUri(baseUrl),
    faceapi.nets.faceRecognitionNet.loadFromUri(baseUrl),
    faceapi.nets.faceExpressionNet.loadFromUri(baseUrl),
  ]);
};

export const loadFaceApiModels = async () => {
  if (isModelLoaded) return;

  // Prefer local models (public/models). Works in Vite with BASE_URL.
  const LOCAL_MODELS_URL = `${import.meta.env.BASE_URL}models`;
  // Fallback CDN hosting of the official face-api.js models
  const CDN_MODELS_URL =
    import.meta.env.VITE_FACEAPI_MODELS_URL ||
    "https://justadudewhohacks.github.io/face-api.js/models";

  try {
    await loadAllModelsFrom(LOCAL_MODELS_URL);
    isModelLoaded = true;
    console.log("Face-api models loaded successfully from", LOCAL_MODELS_URL);
  } catch (localErr) {
    console.warn(
      "Local models not found or failed to load, falling back to CDN:",
      localErr
    );
    try {
      await loadAllModelsFrom(CDN_MODELS_URL);
      isModelLoaded = true;
      console.log("Face-api models loaded successfully from", CDN_MODELS_URL);
    } catch (cdnErr) {
      console.error("Error loading face-api models from CDN:", cdnErr);
      throw cdnErr;
    }
  }
};

export const extractFaceDescriptor = async (
  imageElement: HTMLImageElement
): Promise<Float32Array | null> => {
  try {
    await loadFaceApiModels();

    const detection = await faceapi
      .detectSingleFace(imageElement, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      throw new Error("No face detected in image");
    }

    return detection.descriptor;
  } catch (error) {
    console.error("Error extracting face descriptor:", error);
    return null;
  }
};

export const compareFaceDescriptors = (
  descriptor1: Float32Array,
  descriptor2: Float32Array
): number => {
  return faceapi.euclideanDistance(descriptor1, descriptor2);
};

export const findBestMatch = (
  queryDescriptor: Float32Array,
  storedDescriptors: {
    id: string;
    descriptor: Float32Array;
    studentName: string;
  }[]
): { id: string; studentName: string; distance: number } | null => {
  let bestMatch = null;
  let minDistance = Infinity;

  for (const stored of storedDescriptors) {
    const distance = compareFaceDescriptors(queryDescriptor, stored.descriptor);
    if (distance < minDistance) {
      minDistance = distance;
      bestMatch = {
        id: stored.id,
        studentName: stored.studentName,
        distance: distance,
      };
    }
  }

  // Face recognition threshold (lower = more similar)
  const RECOGNITION_THRESHOLD = 0.6;

  if (bestMatch && bestMatch.distance < RECOGNITION_THRESHOLD) {
    return bestMatch;
  }

  return null;
};
