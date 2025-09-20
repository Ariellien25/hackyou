import { useRef, useState, useEffect } from "react";

const API_BASE = "https://hackyou-backend-104787397649.asia-east1.run.app";

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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const [sessionId, setSessionId] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [message, setMessage] = useState("與 Gemini API 連接中 ...");
  const [photo, setPhoto] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [showGrid, setShowGrid] = useState(true);
  const [audioReady, setAudioReady] = useState(false);
  const [subtitlePos, setSubtitlePos] = useState<{ x: number; y: number }>({ x: 215, y: 430 });
  const [dragState, setDragState] = useState<{ active: boolean; dx: number; dy: number; id?: number }>({ active: false, dx: 0, dy: 0 });

  const enableAudio = async () => {
    if (audioReady) return;
    try {
      const Ctx: any = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = (audioCtxRef.current ??= new Ctx()) as AudioContext;
      await ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.02);
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance("。");
      u.lang = "zh-TW";
      u.volume = 0;
      window.speechSynthesis.speak(u);
      setAudioReady(true);
    } catch { }
  };

  const startCamera = async (mode: "user" | "environment") => {
    if (startingRef.current) return;
    startingRef.current = true;
    const token = ++startTokenRef.current;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: mode, width: { ideal: 1920 }, height: { ideal: 1080 } },
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
    if (!audioReady) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-TW";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
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
          speakLocal(msg.text);
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
  }, [streaming, facingMode]);

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
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(video, 0, 0, w, h);
    setPhoto(canvas.toDataURL("image/png", 1.0));
  };

  const switchCamera = () => {
    setFacingMode(p => (p === "user" ? "environment" : "user"));
  };

  const onSubtitlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    setDragState({ active: true, dx: e.clientX - subtitlePos.x, dy: e.clientY - subtitlePos.y, id: e.pointerId });
  };
  const onSubtitlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.active) return;
    const rect = containerRef.current?.getBoundingClientRect();
    let x = e.clientX - dragState.dx;
    let y = e.clientY - dragState.dy;
    if (rect) {
      x = Math.max(0, Math.min(rect.width, x));
      y = Math.max(0, Math.min(rect.height, y));
    }
    setSubtitlePos({ x, y });
  };
  const onSubtitlePointerUp = () => {
    setDragState({ active: false, dx: 0, dy: 0 });
  };
  const snapSubtitle = (pos: "top" | "center" | "bottom") => {
    const w = containerRef.current?.clientWidth ?? 430;
    const h = containerRef.current?.clientHeight ?? 860;
    if (pos === "top") setSubtitlePos({ x: w / 2, y: h * 0.15 });
    else if (pos === "center") setSubtitlePos({ x: w / 2, y: h / 2 });
    else setSubtitlePos({ x: w / 2, y: h * 0.85 });
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-800">
      <div
        ref={containerRef}
        className="relative w-[430px] h-[860px] bg-black rounded-[3rem] shadow-2xl overflow-hidden border-[14px] border-gray-900"
      >
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

        <div className="absolute right-3 top-3 flex flex-col gap-2 z-10">
          <button onClick={() => snapSubtitle("top")} className="px-3 py-1 rounded bg-white/10 text-white text-xs">頂部</button>
          <button onClick={() => snapSubtitle("center")} className="px-3 py-1 rounded bg-white/10 text-white text-xs">置中</button>
          <button onClick={() => snapSubtitle("bottom")} className="px-3 py-1 rounded bg-white/10 text-white text-xs">底部</button>
        </div>

        <div
          onPointerDown={onSubtitlePointerDown}
          onPointerMove={onSubtitlePointerMove}
          onPointerUp={onSubtitlePointerUp}
          className="absolute bg-black/50 text-white px-4 py-2 rounded-full text-lg font-medium cursor-move select-none"
          style={{ left: subtitlePos.x, top: subtitlePos.y, transform: "translate(-50%,-50%)" }}
        >
          {message}
        </div>

        <div className="absolute bottom-0 w-full bg-black/80 flex flex-col items-center py-4">
          <div className="flex justify-between w-3/4 items-center mb-3 gap-3">
            <button className="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center text-white">✕</button>
            <button onClick={takePhoto} className="w-12 h-12 rounded-full bg-white border-4 border-gray-300">拍照</button>
            <button onClick={switchCamera} className="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center text-white">翻轉</button>
            <button onClick={() => setShowGrid(v => !v)} className="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center text-white">
              {showGrid ? "格" : "無"}
            </button>
            <button onClick={enableAudio} disabled={audioReady} className={`px-3 py-1 rounded-full ${audioReady ? "bg-green-600 text-white" : "bg-blue-600 text-white"} disabled:opacity-60`}>
              {audioReady ? "聲音已啟用" : "啟用聲音"}
            </button>
          </div>
          <div className="flex gap-4 items-center text-gray-300 text-sm">
            <span className="text-white font-bold">相機</span>
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
