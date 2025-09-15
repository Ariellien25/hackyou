import { useRef, useState, useEffect } from "react";

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [streaming, setStreaming] = useState(false);
  const [message, setMessage] = useState("準備好拍照吧！");
  const [photo, setPhoto] = useState(null);
  const [facingMode, setFacingMode] = useState("user");

  // 啟動相機
  const startCamera = async (mode = "user") => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setStreaming(true);
      }
    } catch (err) {
      console.error("無法開啟相機：", err);
    }
  };

  useEffect(() => {
    startCamera(facingMode);
  }, [facingMode]);

  // 播放語音
  const speak = (text) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-TW";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  // 模擬 AI 提示
  useEffect(() => {
    if (!streaming) return;
    const prompts = [
      "微笑很美",
      "可以笑得再大一點！",
      "頭往上一點",
      "大家保持住！",
      "可以拍了",
    ];
    let i = 0;
    const interval = setInterval(() => {
      const text = prompts[i % prompts.length];
      setMessage(text);
      speak(text);
      i++;
    }, 4000);
    return () => clearInterval(interval);
  }, [streaming]);

  // 拍照
  const takePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setPhoto(canvas.toDataURL("image/png"));
  };

  // 切換相機
  const switchCamera = () => {
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-800">
      {/* 模擬手機殼 */}
      <div className="relative w-[430px] h-[860px] bg-black rounded-[3rem] shadow-2xl overflow-hidden border-[14px] border-gray-900">
        {/* 相機預覽 */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />

        {/* 浮動提示 */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/50 text-white px-4 py-2 rounded-full text-lg font-medium">
          {message}
        </div>

        {/* 底部控制列 */}
        <div className="absolute bottom-0 w-full bg-black/80 flex flex-col items-center py-4">
          <div className="flex justify-between w-3/4 items-center mb-3">
            <button className="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center text-white">
              ✕
            </button>

            <button
              onClick={takePhoto}
              className="w-16 h-16 rounded-full bg-white border-4 border-gray-300"
            ></button>

            <button
              onClick={switchCamera}
              className="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center text-white"
            >
              🔄
            </button>
          </div>

          {/* 模式選單 */}
          <div className="flex gap-6 text-gray-300 text-sm">
            <span className="text-white font-bold">相片</span>
            <span>肖像</span>
            <span>夜視</span>
          </div>
        </div>

        {/* 拍攝結果預覽 */}
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

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}
