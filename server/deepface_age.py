import base64
import json
import sys

import cv2
import numpy as np
from deepface import DeepFace


def main() -> int:
    try:
        payload = json.load(sys.stdin)
        image_b64 = payload["image_base64"]
        image_bytes = base64.b64decode(image_b64)
        array = np.frombuffer(image_bytes, dtype=np.uint8)
        bgr = cv2.imdecode(array, cv2.IMREAD_COLOR)
        if bgr is None:
            raise ValueError("Could not decode image bytes.")

        result = DeepFace.analyze(
            img_path=bgr,
            actions=["age"],
            detector_backend="skip",
            enforce_detection=False,
            silent=True,
        )

        if isinstance(result, list):
            result = result[0]

        age = float(result.get("age")) if result.get("age") is not None else None
        json.dump({"ok": True, "age": age}, sys.stdout)
        return 0
    except Exception as exc:  # noqa: BLE001
        json.dump({"ok": False, "error": str(exc)}, sys.stdout)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
