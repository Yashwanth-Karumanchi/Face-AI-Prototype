import { Camera, RefreshCw, StopCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Props = {
  label: string;
  onCapture: (blob: Blob) => void;
};

export function CameraCapture({ label, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => stop();
  }, []);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setActive(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Camera access was not available.");
    }
  }

  function stop() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setActive(false);
  }

  async function capture() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) onCapture(blob);
    }, "image/png");
  }

  return (
    <div className="cameraBlock">
      <div className="cameraHeader">
        <span>{label}</span>
        <div className="buttonRow">
          {!active ? (
            <button className="iconButton" type="button" onClick={start} title="Start camera">
              <Camera size={18} />
            </button>
          ) : (
            <button className="iconButton" type="button" onClick={stop} title="Stop camera">
              <StopCircle size={18} />
            </button>
          )}
          <button className="iconButton" type="button" onClick={capture} disabled={!active} title="Capture photo">
            <RefreshCw size={18} />
          </button>
        </div>
      </div>
      <div className="videoShell">
        <video ref={videoRef} autoPlay playsInline muted />
        <div className="faceGuide" />
      </div>
      {error ? <p className="inlineError">{error}</p> : null}
    </div>
  );
}
