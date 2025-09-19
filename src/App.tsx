import { useRef, useState, useEffect } from "react";

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const gridCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [message, setMessage] = useState("準備好拍照吧！");
  const [photo, setPhoto] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [showGrid, setShowGrid] = useState(true);

  const startCamera = async (mode: "user" | "environment" = "user") => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStreaming(true);
      }
    } catch (err) {
      console.error("無法開啟相機：", err);
    }
  };

  useEffect(() => {
    startCamera(facingMode);
  }, [facingMode]);

  const speak = (text: string) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-TW";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    if (!streaming) return;
    const prompts = ["微笑很美", "可以笑得再大一點！", "頭往上一點", "大家保持住！", "可以拍了"];
    let i = 0;
    const interval = setInterval(() => {
      const text = prompts[i % prompts.length];
      setMessage(text);
      speak(text);
      i++;
    }, 4000);
    return () => clearInterval(interval);
  }, [streaming]);

  const takePhoto = () => {
    const video = videoRef.current;
    const canvas = captureCanvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setPhoto(canvas.toDataURL("image/png"));
  };

  const switchCamera = () => {
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  };

  useEffect(() => {
    if (!streaming || !showGrid) return;
    const canvas = gridCanvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const drawGrid = () => {
      if (!gridCanvasRef.current || !videoRef.current) return;
      const w = videoRef.current.clientWidth;
      const h = videoRef.current.clientHeight;
      canvas.width = w;
      canvas.height = h;
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.moveTo(w / 3, 0);
      ctx.lineTo(w / 3, h);
      ctx.moveTo((w / 3) * 2, 0);
      ctx.lineTo((w / 3) * 2, h);
      ctx.moveTo(0, h / 3);
      ctx.lineTo(w, h / 3);
      ctx.moveTo(0, (h / 3) * 2);
      ctx.lineTo(w, (h / 3) * 2);
      ctx.stroke();
    };

    drawGrid();
    window.addEventListener("resize", drawGrid);
    const id = setInterval(drawGrid, 500);
    return () => {
      window.removeEventListener("resize", drawGrid);
      clearInterval(id);
    };
  }, [streaming, showGrid, facingMode]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-800">
      <div className="relative w-[430px] h-[860px] bg-black rounded-[3rem] shadow-2xl overflow-hidden border-[14px] border-gray-900">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover transform -scale-x-100"
        />

        {showGrid && (
          <canvas
            ref={gridCanvasRef}
            className="absolute inset-0 pointer-events-none"
          />
        )}

        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/50 text-white px-4 py-2 rounded-full text-lg font-medium">
          {message}
        </div>

        <div className="absolute bottom-0 w-full bg-black/80 flex flex-col items-center py-4">
          <div className="flex justify-between w-3/4 items-center mb-3 gap-3">
            <button className="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center text-white">
              ✕
            </button>

            <button
              onClick={takePhoto}
              className="w-12 h-12 rounded-full bg-white border-4 border-gray-300"
            >
              拍照
            </button>

            <button
              onClick={switchCamera}
              className="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center text-white"
            >
              翻轉
            </button>

            <button
              onClick={() => setShowGrid((v) => !v)}
              className="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center text-white"
            >
              {showGrid ? "格" : "無"}
            </button>
          </div>

          <div className="flex gap-6 text-gray-300 text-sm">
            <span className="text-white font-bold">相片</span>
            <span>肖像</span>
            <span>夜視</span>
          </div>
        </div>

        {photo && (
          <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center">
            <img
              src={photo}
              alt="snapshot"
              className="max-h-[80%] rounded-lg shadow-lg"
            />
            <button
              className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg shadow hover:bg-blue-700"
              onClick={() => setPhoto(null)}
            >
              返回相機
            </button>
          </div>
        )}

        <canvas ref={captureCanvasRef} className="hidden" />
      </div>
    </div>
  );
}
