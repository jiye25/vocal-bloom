import React, { useState, useEffect, useRef } from "react";
import ThreeCanvas from "./components/ThreeCanvas";
import type { EmotionScores } from "./types";
import { Sparkles } from "lucide-react";

const INITIAL_EMOTIONS: EmotionScores = {
  love: 0, longing: 0, joy: 0,
  sadness: 0, excitement: 0, gratitude: 0,
};

export default function App() {
  const [welcomeScreen, setWelcomeScreen] = useState(true);
  const [volume, setVolume]               = useState(0);
  const [emotionScores, setEmotionScores] = useState<EmotionScores>(INITIAL_EMOTIONS);
  const [serverOk, setServerOk]           = useState<boolean | null>(null);

  const volumeLoopRef  = useRef<number | null>(null);
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionRef     = useRef(false);

  // Vercel 배포 환경에서는 API 함수가 항상 사용 가능
  useEffect(() => { setServerOk(true); }, []);

  // ── 화면 꺼짐 방지 (전시용) ────────────────────────────────────────────────
  const wakeLockRef = useRef<any>(null);
  const requestWakeLock = async () => {
    try {
      if ("wakeLock" in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
        console.log("[WakeLock] 화면 꺼짐 방지 활성화 ✅");
        wakeLockRef.current.addEventListener("release", () => {
          console.log("[WakeLock] 해제됨 (탭 비활성 등) — 재요청 대기");
        });
      } else {
        console.warn("[WakeLock] 이 브라우저는 Wake Lock API를 지원하지 않습니다.");
      }
    } catch (err) {
      console.warn("[WakeLock] 요청 실패:", err);
    }
  };
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && sessionRef.current) {
        requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // ── 세션 시작 ────────────────────────────────────────────────────────────────
  const initSession = async () => {
    setWelcomeScreen(false);
    sessionRef.current = true;
    console.log("[init] 세션 시작");
    requestWakeLock();

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
    };

    let consecutiveFails = 0;
    let lastFailTime = 0;

    rec.onerror = (e: any) => {
      console.error("[SR] 오류:", e.error);
      if (e.error === "not-allowed") {
        sessionRef.current = false;
        alert("마이크 권한이 차단됐습니다.\nChrome 설정 → 개인정보 보호 → 마이크에서 이 사이트 허용");
        return;
      }
      // ★ aborted/audio-capture 등이 짧은 시간 안에 연속 발생하면 백오프 증가
      const now = Date.now();
      if (now - lastFailTime < 3000) consecutiveFails++;
      else consecutiveFails = 1;
      lastFailTime = now;
    };

    rec.onend = () => {
      console.log("[SR] 인식 종료 — 재시작 예약");
      if (sessionRef.current) {
        // ★ 연속 실패 시 지연을 점점 늘려 무한 재시도 폭주 방지 (최대 5초)
        const delay = Math.min(400 * Math.pow(1.8, consecutiveFails), 5000);
        setTimeout(() => {
          try { rec.start(); console.log(`[SR] 재시작 ✅ (지연 ${Math.round(delay)}ms)`); }
          catch (e) { console.warn("[SR] 재시작 실패:", e); }
        }, delay);
      }
    };

    rec.onresult = (e: any) => {
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) { final += t; }
      }
      if (final) {
        console.log("[SR] 최종:", final);
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
    }
  };

  const scheduleFade = () => {
    if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
    fadeTimeoutRef.current = setTimeout(() => {
      setTimeout(() => setEmotionScores(INITIAL_EMOTIONS), 6000);
    }, 5000);
  };



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
              Voice Bloom
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
          {/* 서버 상태 */}
          {serverOk === false && (
            <div className="absolute top-6 left-6 text-[9px] font-mono text-red-400/70 pointer-events-none">
              ⚠ 서버 미연결
            </div>
          )}
        </>
      )}
    </div>
  );
}
