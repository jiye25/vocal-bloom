import React, { useState, useEffect, useRef } from "react";
import ThreeCanvas from "./components/ThreeCanvas";
import type { EmotionScores } from "./types";
import { Sparkles, Speech } from "lucide-react";

const INITIAL_EMOTIONS: EmotionScores = {
  love: 0, longing: 0, joy: 0,
  sadness: 0, excitement: 0, gratitude: 0,
};

const EMOTION_LABEL: Record<keyof EmotionScores, string> = {
  love: "사랑", longing: "그리움", joy: "기쁨",
  sadness: "슬픔", excitement: "설렘", gratitude: "감사",
};

const EMOTION_COLOR: Record<keyof EmotionScores, string> = {
  love: "#F2ACCD", longing: "#BDAEF2", joy: "#FFF540",
  sadness: "#4A7FA0", excitement: "#BCFDE6", gratitude: "#F2AC54",
};

function getDominantEmotion(scores: EmotionScores): keyof EmotionScores | null {
  const keys = Object.keys(scores) as (keyof EmotionScores)[];
  const best = keys.reduce((a, b) => scores[a] > scores[b] ? a : b);
  return scores[best] > 0.15 ? best : null;
}

export default function App() {
  const [welcomeScreen, setWelcomeScreen] = useState(true);
  const [volume, setVolume]               = useState(0);
  const [emotionScores, setEmotionScores] = useState<EmotionScores>(INITIAL_EMOTIONS);
  const [transcript, setTranscript]       = useState("");
  const [interimText, setInterimText]     = useState("");
  const [isListening, setIsListening]     = useState(false);
  const [isAnalyzing, setIsAnalyzing]     = useState(false);
  const [serverOk, setServerOk]           = useState<boolean | null>(null);

  const volumeLoopRef  = useRef<number | null>(null);
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionRef     = useRef(false);

  // ── 서버 상태 확인 ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/../health").then(r => r.ok ? setServerOk(true) : setServerOk(false))
      .catch(() => setServerOk(false));
  }, []);

  // ── 세션 시작 ────────────────────────────────────────────────────────────────
  const initSession = async () => {
    setWelcomeScreen(false);
    sessionRef.current = true;
    console.log("[init] 세션 시작");

    // ① 마이크 스트림 확보
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("[init] 마이크 접근 성공");
    } catch (err) {
      console.error("[init] 마이크 거부:", err);
      alert("마이크 권한을 허용해주세요.\n(Chrome 주소창 왼쪽 자물쇠 → 마이크 허용)");
      return;
    }

    // ② 볼륨 분석
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const source  = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let smooth = 0;
    const poll = () => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      smooth = smooth * 0.75 + Math.min(avg / 128, 1) * 0.25;
      setVolume(smooth);
      volumeLoopRef.current = requestAnimationFrame(poll);
    };
    poll();

    // ③ 음성 인식
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert("Chrome 브라우저에서만 음성 인식이 됩니다.");
      return;
    }
    console.log("[SR] SpeechRecognition 사용 가능");

    const rec = new SR();
    rec.lang           = "ko-KR";
    rec.continuous     = true;
    rec.interimResults = true;

    rec.onstart = () => {
      console.log("[SR] 인식 시작 ✅");
      setIsListening(true);
    };

    rec.onerror = (e: any) => {
      console.error("[SR] 오류:", e.error);
      setIsListening(false);
      if (e.error === "not-allowed") {
        sessionRef.current = false;
        alert("마이크 권한이 차단됐습니다.\nChrome 설정 → 개인정보 보호 → 마이크에서 이 사이트 허용");
      }
    };

    rec.onend = () => {
      console.log("[SR] 인식 종료 — 재시작 예약");
      setIsListening(false);
      if (sessionRef.current) {
        setTimeout(() => {
          try { rec.start(); console.log("[SR] 재시작 ✅"); }
          catch (e) { console.warn("[SR] 재시작 실패:", e); }
        }, 400);
      }
    };

    rec.onresult = (e: any) => {
      let interim = "", final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) { final += t; }
        else { interim += t; }
      }
      if (interim) {
        console.log("[SR] 중간:", interim);
        setInterimText(interim);
      }
      if (final) {
        console.log("[SR] 최종:", final);
        setInterimText("");
        setTranscript(final.trim());
        analyzeEmotion(final.trim());
      }
    };

    try {
      rec.start();
    } catch (e) {
      console.error("[SR] start() 실패:", e);
    }
  };

  // ── 감정 분석 ────────────────────────────────────────────────────────────────
  const analyzeEmotion = async (text: string) => {
    if (!text) return;
    setIsAnalyzing(true);
    try {
      const res = await fetch("/api/analyze-emotion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        const scores: EmotionScores = await res.json();
        console.log("[색상] 감정 스코어:", JSON.stringify(scores));
        setEmotionScores(scores);
        scheduleFade();
      } else {
        console.error("[색상] 서버 오류:", res.status);
      }
    } catch (err) {
      console.error("[색상] 네트워크 오류:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const scheduleFade = () => {
    if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
    fadeTimeoutRef.current = setTimeout(() => {
      setTimeout(() => setEmotionScores(INITIAL_EMOTIONS), 6000);
    }, 5000);
  };



  // ── 현재 지배 감정 ───────────────────────────────────────────────────────────
  const dominant = getDominantEmotion(emotionScores);

  return (
    <div className="w-screen h-screen relative select-none overflow-hidden text-white"
         style={{ backgroundColor: "#000" }}>

      {!welcomeScreen && (
        <ThreeCanvas volume={volume} emotionScores={emotionScores} isActive={true} />
      )}


      {/* ── 시작 화면 ── */}
      {welcomeScreen && (
        <div onClick={initSession}
          style={{ position:"fixed", inset:0, zIndex:9999, display:"flex",
                   flexDirection:"column", alignItems:"center", justifyContent:"center",
                   cursor:"pointer", background:"rgba(0,0,0,0.75)", backdropFilter:"blur(8px)" }}>
          <div className="flex flex-col items-center gap-6 max-w-lg text-center px-8">
            <div className="w-20 h-20 rounded-full border border-white/20 flex items-center justify-center"
                 style={{ background:"rgba(255,255,255,0.06)" }}>
              <Sparkles className="w-9 h-9 text-white/70" />
            </div>
            <h1 className="text-4xl font-light tracking-widest text-white">
              마음의 꽃잎, 날리다
            </h1>
            <p className="text-sm text-white/50 font-light leading-relaxed tracking-wide">
              마이크에 말을 건네면 AI가 감정을 분석하여<br />
              꽃잎의 색채와 바람의 결로 시각화합니다.
            </p>
            {serverOk === false && (
              <p className="text-xs text-red-400/80 font-mono">
                ⚠ 서버 연결 실패 — <code>npm start</code> 실행 확인
              </p>
            )}
            <span className="mt-4 px-8 py-3 rounded-full border border-white/25 text-xs tracking-widest uppercase font-mono text-white/60">
              화면을 클릭하여 시작
            </span>
          </div>
        </div>
      )}

      {/* ── 실행 중 UI ── */}
      {!welcomeScreen && (
        <>
          {/* 마이크 상태 */}
          <div className="absolute top-6 right-6 flex items-center gap-2 pointer-events-none"
               style={{ opacity: 0.6 }}>
            <div className={`w-2 h-2 rounded-full transition-colors ${isListening ? "bg-emerald-400" : "bg-white/30"}`}
                 style={isListening ? { boxShadow:"0 0 8px rgba(52,211,153,0.8)", animation:"pulse 1.5s infinite" } : {}} />
            <span className="text-[10px] font-mono tracking-widest uppercase text-white/50">
              {isListening ? "LISTENING" : "STANDBY"}
            </span>
          </div>

          {/* 서버 상태 */}
          {serverOk === false && (
            <div className="absolute top-6 left-6 text-[9px] font-mono text-red-400/70 pointer-events-none">
              ⚠ 서버 미연결
            </div>
          )}

          {/* 인식 텍스트 + 감정 표시 */}
          <div className="absolute bottom-8 left-1/2 pointer-events-none z-30 flex flex-col items-center gap-2"
               style={{ transform: "translateX(-50%)", minWidth: "280px" }}>

            {/* 중간 인식 결과 (흐리게) */}
            {interimText && (
              <p className="text-xs text-white/35 font-light tracking-wide italic">
                {interimText}
              </p>
            )}

            {/* 최종 텍스트 + 감정 칩 */}
            {transcript && (
              <div className="flex flex-col items-center gap-1.5">
                <div className="flex items-center gap-1.5">
                  <Speech className="w-3 h-3 text-white/30" />
                  <p className="text-sm font-light text-white/80 tracking-wide px-5 py-1.5 rounded-full"
                     style={{ border:"1px solid rgba(255,255,255,0.10)",
                              background:"rgba(0,0,0,0.40)", backdropFilter:"blur(6px)" }}>
                    "{transcript}"
                  </p>
                  {isAnalyzing && (
                    <span className="text-[9px] font-mono text-white/40 animate-pulse">분석중…</span>
                  )}
                </div>

                {/* 지배 감정 칩 */}
                {dominant && (
                  <span className="text-[10px] font-mono tracking-widest px-3 py-0.5 rounded-full"
                        style={{ background: EMOTION_COLOR[dominant] + "33",
                                 border: `1px solid ${EMOTION_COLOR[dominant]}55`,
                                 color: EMOTION_COLOR[dominant] }}>
                    {EMOTION_LABEL[dominant]}
                  </span>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
