import { useRef, useState, useEffect } from "react";

// const API_BASE =
//   ((process.env as any)?.REACT_APP_API_BASE as string) ||
//   "";
// const API_BASE = "http://localhost:8080"
// const API_BASE = "https://api.hackyou.steveyi.net"
const API_BASE = "https://hackyou-backend-104787397649.asia-east1.run.app"

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const gridCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startTokenRef = useRef(0);
  const startedRef = useRef(false);
  const startingRef = useRef(false);
  const wsConnectingRef = useRef(false);

  const [sessionId, setSessionId] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [message, setMessage] = useState("與 Gemini API 連接中 ...");
  const [photo, setPhoto] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [showGrid, setShowGrid] = useState(true);
  const [useCloudTTS, setUseCloudTTS] = useState(false);

  const startCamera = async (mode: "user" | "environment") => {
    if (startingRef.current) return;
    startingRef.current = true;
    const token = ++startTokenRef.current;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: mode,
        width: { ideal: 1920 },  // Full HD
        height: { ideal: 1080 }
      },
      audio: false
    });
    if (token !== startTokenRef.current) {
      stream.getTracks().forEach(t => t.stop());
      startingRef.current = false;
      return;
    }
    streamRef.current = stream;
    const v = videoRef.current!;
    v.srcObject = stream;
    await new Promise<void>(res => {
      if (v.readyState >= 1) res();
      else v.onloadedmetadata = () => res();
    });
    setStreaming(true);
    startedRef.current = true;
    startingRef.current = false;
  };

  const speakLocal = (text: string) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-TW";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  const speakCloud = async (text: string) => {
    if (!sessionId) return;
    const r = await fetch(`${API_BASE}/v1/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, text, voice: "zh-TW-Wavenet-A", speed: 1.0, pitch: 0.0, format: "mp3", cache: true })
    });
    if (!r.ok) return;
    const j = await r.json();
    if (!j?.audio_url) return;
    const a = new Audio(j.audio_url);
    try { await a.play(); } catch { }
  };

  const openSessionAndWS = async () => {
    if (wsConnectingRef.current) return;
    wsConnectingRef.current = true;
    try {
      const res = await fetch(`${API_BASE}/v1/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device: { model: "Web", os: navigator.platform, browser: navigator.userAgent },
          mode: facingMode === "user" ? "selfie" : "group",
          locale: "zh-TW",
          consent: { vision: true }
        })
      });
      if (!res.ok) throw new Error("create session failed");
      const data = await res.json();
      setSessionId(data.session_id || "");
      const wsUrl = String(data.ws_url || "").replace(/^http/, "ws");
      if (!wsUrl) return;
      if (wsRef.current) try { wsRef.current.close(); } catch { }
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onmessage = async e => {
        const msg = JSON.parse(e.data);
        if (msg?.type === "tip" && typeof msg.text === "string") {
          setMessage(msg.text);
          if (useCloudTTS) await speakCloud(msg.text);
          else speakLocal(msg.text);
        }
      };
      ws.onclose = () => { wsRef.current = null; };
    } catch { }
    finally {
      wsConnectingRef.current = false;
    }
  };

  const sendFrame = () => {
    const video = videoRef.current;
    const canvas = captureCanvasRef.current;
    const ws = wsRef.current;
    if (!video || !canvas || !ws || ws.readyState !== WebSocket.OPEN) return;
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(video, 0, 0, w, h);
    const base64 = canvas.toDataURL("image/jpeg", 0.6).split(",")[1];
    ws.send(JSON.stringify({ type: "frame", ts: Date.now(), content_type: "image/jpeg", shape: [h, w], bytes: base64 }));
  };

  useEffect(() => {
    if (!startedRef.current) startCamera(facingMode);
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  useEffect(() => {
    if (!startedRef.current) return;
    startCamera(facingMode);
  }, [facingMode]);

  useEffect(() => {
    if (!streaming) return;
    openSessionAndWS();
  }, [streaming, facingMode, useCloudTTS]);

  useEffect(() => {
    if (!streaming) return;
    const id = setInterval(sendFrame, 700);
    return () => clearInterval(id);
  }, [streaming, facingMode]);

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

  const takePhoto = () => {
    const video = videoRef.current;
    const canvas = captureCanvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    canvas.width = w;
    canvas.height = h;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(video, 0, 0, w, h);
    setPhoto(canvas.toDataURL("image/png", 1.0));
  };

  const switchCamera = () => {
    setFacingMode(p => (p === "user" ? "environment" : "user"));
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-800">
      <div className="relative w-[430px] h-[860px] bg-black rounded-[3rem] shadow-2xl overflow-hidden border-[14px] border-gray-900">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover ${facingMode === "user" ? "transform -scale-x-100" : ""}`}
        />
        {showGrid && <canvas ref={gridCanvasRef} className="absolute inset-0 pointer-events-none" />}
        <div className="absolute top-4 left-4 text-xs text-white/70 px-2 py-1 bg-white/10 rounded">
          {sessionId ? sessionId.slice(0, 12) + "..." : "建立連線中"}
        </div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/50 text-white px-4 py-2 rounded-full text-lg font-medium">
          {message}
        </div>
        <div className="absolute bottom-0 w-full bg黑/80 flex flex-col items-center py-4">
          <div className="flex justify-between w-3/4 items-center mb-3 gap-3">
            <button className="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center text-white">✕</button>
            <button onClick={takePhoto} className="w-12 h-12 rounded-full bg-white border-4 border-gray-300">拍照</button>
            <button onClick={switchCamera} className="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center text-white">翻轉</button>
            <button onClick={() => setShowGrid(v => !v)} className="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center text白">
              {showGrid ? "格" : "無"}
            </button>
          </div>
          <div className="flex gap-4 items-center text-gray-300 text-sm">
            <span className="text-white font-bold">相片</span>
            <span>肖像</span>
            <span>夜視</span>
            <label className="flex items-center gap-2 ml-4">
              <input type="checkbox" checked={useCloudTTS} onChange={e => setUseCloudTTS(e.target.checked)} />
              <span>雲端語音</span>
            </label>
          </div>
        </div>
        {photo && (
          <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center">
            <img src={photo} alt="snapshot" className="max-h-[80%] rounded-lg shadow-lg" />
            <button className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg shadow hover:bg-blue-700" onClick={() => setPhoto(null)}>
              返回相機
            </button>
          </div>
        )}
        <canvas ref={captureCanvasRef} className="hidden" />
      </div>
    </div>
  );
}
