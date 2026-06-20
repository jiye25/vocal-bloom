import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import type { EmotionScores } from "../types";

// ─── 감정 색상 ────────────────────────────────────────────────────────────────
const EMOTION_COLORS: Record<keyof EmotionScores, THREE.Color> = {
  love:       new THREE.Color(0.917, 0.693, 0.798),
  longing:    new THREE.Color(0.739, 0.690, 0.909),
  joy:        new THREE.Color(0.981, 0.949, 0.367),
  sadness:    new THREE.Color(0.557, 0.668, 0.737),
  excitement: new THREE.Color(0.767, 0.976, 0.903),
  gratitude:  new THREE.Color(1.000, 0.720, 0.520),
};
const WHITE = new THREE.Color(1, 1, 1);

// CSS flower img (bottom:0, left:0, height:52vh) 기준 수술 중심 UV
const FLOWER_UV_X = 0.06;
const FLOWER_UV_Y = 0.92;

// ─── 꽃잎 제어 상수 (여기서 수치 조정) ──────────────────────────────────────
const PETAL_CONFIG = {
  START_COUNT:        10,    // 최초 트리거 시 기본 스폰 개수

  BASE_SIZE:          1.7,   // 꽃잎 기본 크기 (Three.js 월드 단위)
  SIZE_VARIATION:     0.03,  // 크기 랜덤 오차 ±3%

  BASE_ANGLE:        -25,    // 생성 시 기본 Z 회전 각도 (도)

  // ── 동선 제어 ──────────────────────────────────────────────────────────
  TARGET_ANGLE:      -20,    // 꽃잎 진행 방향 각도 (도, 0°=수평 우측, 클수록 위로)
  STREAM_WIDTH:       1.6,   // 바람 길 반폭 (Three.js 월드 단위, 클수록 퍼짐)
  FORCE_DAMPING:      1.0,   // 속도 감쇠율 (낮을수록 빨리 느려짐)

  X_ROTATION_SPEED:   0.2,   // X축 앞뒤 까딱임 강도 (Pitch)
  Y_ROTATION_SPEED:   0.45,  // Y축 좌우 돌림 강도 (Yaw)
  Z_ROTATION_SPEED:   0.7,   // Z축 시계추 흔들림 강도 (Roll)

  SPAWN_RADIUS_MIN:   0.80,  // 수술 중심 제외 최소 반지름
  SPAWN_RADIUS_MAX:   1.80,  // 스폰 최대 반지름

  AUDIO_THRESHOLD:    0.12,  // 꽃잎 생성 시작 최소 볼륨 (0~1) — 소음 차단
  MAX_WIND_FORCE:     1.0,   // 최대 볼륨 시 바람 세기 승수
  MAX_PETAL_COUNT:    28,    // 화면 내 최대 꽃잎 수

  // ★ 꽃잎 초기 방출 방향 (3시 방향 = 0°, 12시 = 90°)
  SPAWN_DIRECTION_ANGLE:    0,     // 생성 첫 프레임 방출 각도 (도)
  INITIAL_SPAWN_SPEED:      1.5,   // 초기 속도 세기 배율 (1.0 = 기본)

  // ★ 꽃잎 생성 양/빈도 제어
  SPAWN_INTERVAL_FRAMES:    4,     // N프레임마다 스폰 체크 (낮을수록 더 자주)
  BASE_SPAWN_CHANCE:        0.14,  // 볼륨 최저(임계값)일 때 생성 확률 → 몇 초에 한 장
  MAX_SPAWN_CHANCE:         0.95,  // 볼륨 최대(1.0)일 때 생성 확률 → 화르륵 무더기
  BURST_SPAWN_COUNT:        2.5,   // 조건 충족 시 한 번에 생성할 꽃잎 수

  IDLE_SPAWN_INTERVAL:      3.5,   // 무음 시 꽃잎 자동 생성 간격 (초)

  // ★ 감정 인식 시 최소 보장 꽃잎 개수
  MIN_EMOTION_SPAWN_COUNT:  8,     // 짧은 발화에도 최소 이 수만큼 즉시 생성

  // ★ 황금 빛 파티클 — 얇은 황금 띠(은하수) 연출
  PARTICLE_MAX_COUNT:       120,
  PARTICLE_BASE_ALPHA:      0.35,
  PARTICLE_MIN_SIZE:        1.0,
  PARTICLE_MAX_SIZE:        1.8,
  PARTICLE_WAVE_AMPLITUDE:  35,    // S자 높이 (클수록 크게 출렁임)
  PARTICLE_WAVE_FREQUENCY:  0.015, // S자 밀도/주기 (클수록 촘촘한 파도)
  PARTICLE_WAVE_SPEED:      0.05,  // S자 물결 자체 흐름 속도
  PARTICLE_SPREAD_FORCE:    0.10,  // ★ 수직 확산 억제 계수
};

// ─── Simplex 3D Noise ─────────────────────────────────────────────────────────
function buildNoise3D() {
  const seed = new Uint8Array(256);
  for (let i = 0; i < 256; i++) seed[i] = (Math.random() * 256) | 0;
  const P = new Uint8Array(512), PM = new Uint8Array(512);
  for (let i = 0; i < 512; i++) { P[i] = seed[i & 255]; PM[i] = P[i] % 12; }
  const G = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
  const dot = (g:number[],x:number,y:number,z:number) => g[0]*x+g[1]*y+g[2]*z;
  return (xi:number,yi:number,zi:number):number => {
    const s=(xi+yi+zi)/3,i0=(xi+s)|0,j0=(yi+s)|0,k0=(zi+s)|0;
    const t=(i0+j0+k0)/6,x0=xi-i0+t,y0=yi-j0+t,z0=zi-k0+t;
    let i1=0,j1=0,k1=0,i2=0,j2=0,k2=0;
    if(x0>=y0){if(y0>=z0){i1=1;i2=1;j2=1;}else if(x0>=z0){i1=1;i2=1;k2=1;}else{k1=1;i2=1;k2=1;}}
    else{if(y0<z0){k1=1;j2=1;k2=1;}else if(x0<z0){j1=1;j2=1;k2=1;}else{j1=1;i2=1;j2=1;}}
    const x1=x0-i1+1/6,y1=y0-j1+1/6,z1=z0-k1+1/6;
    const x2=x0-i2+1/3,y2=y0-j2+1/3,z2=z0-k2+1/3;
    const x3=x0-.5,y3=y0-.5,z3=z0-.5;
    const ii=i0&255,jj=j0&255,kk=k0&255;
    let n=0,tt:number;
    tt=.6-x0*x0-y0*y0-z0*z0;if(tt>0){tt*=tt;n+=tt*tt*dot(G[PM[ii+P[jj+P[kk]]]],x0,y0,z0);}
    tt=.6-x1*x1-y1*y1-z1*z1;if(tt>0){tt*=tt;n+=tt*tt*dot(G[PM[ii+i1+P[jj+j1+P[kk+k1]]]],x1,y1,z1);}
    tt=.6-x2*x2-y2*y2-z2*z2;if(tt>0){tt*=tt;n+=tt*tt*dot(G[PM[ii+i2+P[jj+j2+P[kk+k2]]]],x2,y2,z2);}
    tt=.6-x3*x3-y3*y3-z3*z3;if(tt>0){tt*=tt;n+=tt*tt*dot(G[PM[ii+1+P[jj+1+P[kk+1]]]],x3,y3,z3);}
    return 32*n;
  };
}
const NA=buildNoise3D(), NB=buildNoise3D(), NC=buildNoise3D();

function curlNoise(x:number,y:number,z:number,t:number):THREE.Vector3 {
  const e=0.06,tx=x+t*.08,ty=y+t*.06,tz=z+t*.10;
  return new THREE.Vector3(
    (NC(tx,ty+e,tz)-NC(tx,ty-e,tz)-NB(tx,ty,tz+e)+NB(tx,ty,tz-e))/(2*e),
    (NA(tx,ty,tz+e)-NA(tx,ty,tz-e)-NC(tx+e,ty,tz)+NC(tx-e,ty,tz))/(2*e),
    (NB(tx+e,ty,tz)-NB(tx-e,ty,tz)-NA(tx,ty+e,tz)+NA(tx,ty-e,tz))/(2*e),
  );
}

// ─── 꽃잎 텍스처 ──────────────────────────────────────────────────────────────
function createPetalTexture():THREE.CanvasTexture {
  const W=512,H=720,cv=document.createElement("canvas");
  cv.width=W; cv.height=H;
  const ctx=cv.getContext("2d")!;
  ctx.save();
  ctx.beginPath();
  const cx=W/2;
  ctx.moveTo(cx,H*.97);
  ctx.bezierCurveTo(cx-W*.38,H*.80,cx-W*.46,H*.52,cx-W*.44,H*.28);
  ctx.bezierCurveTo(cx-W*.40,H*.10,cx-W*.22,H*.02,cx,H*.01);
  ctx.bezierCurveTo(cx+W*.22,H*.02,cx+W*.40,H*.10,cx+W*.44,H*.28);
  ctx.bezierCurveTo(cx+W*.46,H*.52,cx+W*.38,H*.80,cx,H*.97);
  ctx.closePath();
  ctx.clip();
  const bg=ctx.createRadialGradient(cx,H*.40,0,cx,H*.40,W*.60);
  bg.addColorStop(0,"rgba(255,255,255,0.97)");
  bg.addColorStop(0.28,"rgba(248,246,252,0.92)");
  bg.addColorStop(0.60,"rgba(225,220,235,0.80)");
  bg.addColorStop(0.85,"rgba(200,194,215,0.55)");
  bg.addColorStop(1,"rgba(175,168,192,0.00)");
  ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
  const sh=ctx.createLinearGradient(cx*.5,H*.12,cx*1.15,H*.68);
  sh.addColorStop(0,"rgba(255,255,255,0)");
  sh.addColorStop(.45,"rgba(255,255,255,0.24)");
  sh.addColorStop(1,"rgba(255,255,255,0)");
  ctx.fillStyle=sh; ctx.fillRect(0,0,W,H);
  ctx.globalCompositeOperation="source-atop";
  const vb={x:cx,y:H*.96};
  for(let vi=0;vi<36;vi++){
    const t=vi/35,a=(t-.5)*Math.PI*.70,len=H*(0.58+0.18*Math.sin(Math.PI*t));
    const ex=vb.x+Math.sin(a)*len*.90,ey=vb.y-Math.cos(a)*len;
    const c2x=vb.x+Math.sin(a*.55)*len*.40,c2y=vb.y-Math.cos(a*.55)*len*.45;
    ctx.beginPath();
    ctx.moveTo(vb.x,vb.y);
    ctx.quadraticCurveTo(c2x,c2y,ex,ey);
    ctx.strokeStyle=`rgba(255,255,255,${(0.20+0.14*(1-Math.abs(t-.5)*2)).toFixed(2)})`;
    ctx.lineWidth=0.25+0.5*(1-Math.abs(t-.5)*2); ctx.lineCap="round"; ctx.stroke();
  }
  ctx.globalCompositeOperation="screen";
  [[.38,.20],[.55,.17],[.48,.31],[.62,.27],[.30,.39],[.52,.42],[.65,.37],[.42,.51],[.58,.54],[.35,.59],[.70,.47],[.44,.64],[.60,.69],[.38,.71],[.52,.77],[.28,.27],[.72,.33],[.45,.13],[.57,.09]].forEach(([dx,dy])=>{
    const px=dx*W,py=dy*H,r=2+Math.random()*5;
    const g=ctx.createRadialGradient(px,py,0,px,py,r*4);
    g.addColorStop(0,"rgba(255,232,140,0.90)"); g.addColorStop(.4,"rgba(255,190,55,0.45)"); g.addColorStop(1,"rgba(200,120,0,0)");
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(px,py,r*4,0,Math.PI*2); ctx.fill();
  });
  ctx.restore();
  const tex=new THREE.CanvasTexture(cv);
  tex.premultiplyAlpha=true;
  return tex;
}

// ─── 꽃잎 지오메트리 ──────────────────────────────────────────────────────────
function createPetalGeometry():THREE.BufferGeometry {
  const geo=new THREE.PlaneGeometry(1.21,1.4,20,28);
  const pos=geo.attributes.position as THREE.BufferAttribute;
  for(let i=0;i<pos.count;i++){
    const lx=pos.getX(i),v=(pos.getY(i)/0.7+1)*0.5;
    pos.setZ(i,-0.22*(lx*lx)/0.25+0.05*Math.exp(-lx*lx*14)*Math.sin(v*Math.PI)+0.04*Math.pow(v,2.5)*(1-Math.abs(lx)*2));
  }
  geo.computeVertexNormals();
  return geo;
}

// ─── GLSL 셰이더 ──────────────────────────────────────────────────────────────
const VERT=/* glsl */`
  precision highp float;
  varying vec2 vUv; varying vec3 vNorm,vView;
  uniform float uTime,uVolume,uFlutter,uBend;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5);}
  float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
  void main(){
    vUv=uv;
    vec3 p=position;
    // 나풀거림
    float n=vn(p.xy*1.4+vec2(uTime*.5,uTime*.4))*.6+vn(p.xy*2.8+vec2(uTime*.9,-uTime*.5))*.4;
    float amp=uFlutter*(0.012+uVolume*0.025);
    p.z+=n*amp*sin(p.y*2.2+uTime*1.8);
    // 굽힘: uv.y=0(끝), 1(뿌리) — 끝부분만 앞으로 말림
    float t=1.0-uv.y;
    float bend=uBend*t*t;
    p.z+=bend*0.55;
    p.y-=bend*bend*0.18;
    vec4 mv=modelViewMatrix*vec4(p,1.0);
    vNorm=normalize(normalMatrix*normal); vView=normalize(-mv.xyz);
    gl_Position=projectionMatrix*mv;
  }
`;
const FRAG=/* glsl */`
  precision highp float;
  varying vec2 vUv; varying vec3 vNorm,vView;
  uniform sampler2D uTexture;
  uniform vec3 uTint; uniform float uTintAmount,uOpacity,uVolume,uTime,uGlow;
  void main(){
    vec4 texel=texture2D(uTexture,vUv);
    if(texel.a<0.01) discard;
    vec3 col=texel.rgb;
    float luma=dot(col,vec3(0.299,0.587,0.114));
    // 1단계: 원본 색상을 그레이스케일로 탈색
    // → 어떤 사진 텍스처도 원본 색이 틴트에 간섭하지 않음
    vec3 grey=vec3(luma);
    // 2단계: 그레이스케일 * 틴트 → 정확한 색상 재현
    // grey 승수 낮추고 순수 tint 가산량 증가 → 밝은 픽셀에서도 채도 유지
    vec3 tinted=clamp(uTint*(luma*0.85+0.30), 0.0, 1.0);
    col=mix(col,tinted,uTintAmount);
    float fr=pow(1.0-max(dot(vNorm,vView),0.0),2.5);
    col+=mix(vec3(1.0),uTint,uTintAmount)*fr*(0.35+uGlow*1.2);
    gl_FragColor=vec4(col,texel.a*uOpacity);
  }
`;

// ─── 파티클 텍스처 ────────────────────────────────────────────────────────────
function makeSparkTex():THREE.Texture {
  // shadowBlur로 황금 네온 아우라 생성
  const S=128, c=document.createElement("canvas"); c.width=c.height=S;
  const ctx=c.getContext("2d")!;
  // 외곽 글로우 레이어
  ctx.shadowBlur=30; ctx.shadowColor="#FFD700";
  const g=ctx.createRadialGradient(S/2,S/2,0,S/2,S/2,S/2*.5);
  g.addColorStop(0,"rgba(255,255,220,1)");
  g.addColorStop(.25,"rgba(255,215,0,.95)");
  g.addColorStop(.6,"rgba(255,170,0,.45)");
  g.addColorStop(1,"rgba(255,120,0,0)");
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(S/2,S/2,S/2*.5,0,Math.PI*2); ctx.fill();
  // 두 번 그려 중심 광량 증폭
  ctx.shadowBlur=12; ctx.shadowColor="#FFF0A0";
  ctx.beginPath(); ctx.arc(S/2,S/2,S/2*.18,0,Math.PI*2); ctx.fill();
  return new THREE.CanvasTexture(c);
}
function makeBokehTex():THREE.Texture {
  const c=document.createElement("canvas"); c.width=c.height=128;
  const ctx=c.getContext("2d")!;
  const g=ctx.createRadialGradient(64,64,2,64,64,58);
  g.addColorStop(0,"rgba(255,255,255,0.14)"); g.addColorStop(1,"rgba(255,230,190,0)");
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(64,64,60,0,Math.PI*2); ctx.fill();
  return new THREE.CanvasTexture(c);
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props { volume:number; emotionScores:EmotionScores; isActive:boolean; }

// ─── Component ────────────────────────────────────────────────────────────────
export default function ThreeCanvas({ volume, emotionScores, isActive }:Props) {
  const containerRef=useRef<HTMLDivElement>(null);
  const animRef=useRef<number|null>(null);
  const volRef=useRef(volume);
  const emoRef=useRef(emotionScores);
  const activeRef=useRef(isActive);
  useEffect(()=>{volRef.current=volume;},[volume]);
  useEffect(()=>{emoRef.current=emotionScores;},[emotionScores]);
  useEffect(()=>{activeRef.current=isActive;},[isActive]);

  useEffect(()=>{
    const container=containerRef.current;
    if(!container) return;
    const W=container.clientWidth, H=container.clientHeight;

    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:"high-performance"});
    renderer.setSize(W,H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
    renderer.setClearColor(0,0);
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.1;
    renderer.domElement.style.pointerEvents = "none";
    container.appendChild(renderer.domElement);

    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(58,W/H,0.1,120);
    camera.position.set(0,0,11);

    scene.add(new THREE.AmbientLight(0xffffff,1.0));
    const keyLight=new THREE.DirectionalLight(0xfff8f0,1.8);
    keyLight.position.set(6,10,5); scene.add(keyLight);
    const fillLight=new THREE.PointLight(0xffffff,6,50);
    scene.add(fillLight);

    function getFlowerPos():THREE.Vector3 {
      const asp=container.clientWidth/container.clientHeight;
      const halfH=Math.tan((camera.fov*Math.PI/180)/2)*camera.position.z;
      return new THREE.Vector3((FLOWER_UV_X*2-1)*halfH*asp,-(FLOWER_UV_Y*2-1)*halfH,0);
    }

    // ─── 꽃 영상 (Three.js 씬 내부, renderOrder=10) ─────────────────────────
    const videoEl=document.createElement("video");
    videoEl.src="/flower_back.mp4";
    videoEl.loop=true; videoEl.muted=true; videoEl.playsInline=true;
    videoEl.autoplay=true;
    videoEl.play().catch(()=>{});
    const videoTex=new THREE.VideoTexture(videoEl);
    videoTex.minFilter=THREE.LinearFilter;
    videoTex.magFilter=THREE.LinearFilter;
    const flowerInitHalfW=Math.tan((camera.fov*Math.PI/180)/2)*camera.position.z*(W/H);
    let flowerMesh:THREE.Mesh|null=null;
    const flowerMat = (() => {
      const halfH=Math.tan((camera.fov*Math.PI/180)/2)*camera.position.z;
      const halfW=flowerInitHalfW;
      const vGeo=new THREE.PlaneGeometry(halfW*2,halfH*2);
      const vMat=new THREE.ShaderMaterial({
        uniforms:{
          uVideo:{value:videoTex},
          uTint:{value:new THREE.Color(1,1,1)},
          uTintAmount:{value:0},
        },
        vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
        fragmentShader:`
          varying vec2 vUv;
          uniform sampler2D uVideo;
          uniform vec3 uTint;
          uniform float uTintAmount;
          void main(){
            vec4 c=texture2D(uVideo,vUv);
            float lum=dot(c.rgb,vec3(0.299,0.587,0.114));
            if(lum<0.06) discard;
            // 노란 수술 영역: R·G 높고 B 낮음 → 틴트 거의 완전 제외
            float yellowness = (c.r + c.g - 2.0*c.b) * 0.5;
            float mask = clamp(1.0 - yellowness * 6.0, 0.0, 1.0);
            vec3 col=mix(c.rgb, uTint*(lum*0.85+0.30), uTintAmount*0.75*mask);
            gl_FragColor=vec4(col,c.a);
          }`,
        transparent:true, depthWrite:false, side:THREE.FrontSide,
      });
      const vMesh=new THREE.Mesh(vGeo,vMat);
      vMesh.renderOrder=10;
      vMesh.position.set(-0.9,-1.15,0.1);
      vMesh.scale.setScalar(0.6);
      scene.add(vMesh);
      flowerMesh=vMesh;
      return vMat;
    })();

    let petalTex:THREE.Texture=createPetalTexture();
    new THREE.TextureLoader().load("/petal_3.png",(t)=>{
      t.premultiplyAlpha=true; petalTex=t;
      flyPetals.forEach(p=>{(p.mat.uniforms["uTexture"] as THREE.IUniform).value=t;});
    });
    const petalGeo=createPetalGeometry();

    function makeMat(tint:THREE.Color,tintAmt:number,bend:number=0):THREE.ShaderMaterial {
      return new THREE.ShaderMaterial({
        uniforms:{
          uTexture:{value:petalTex}, uTint:{value:tint.clone()},
          uTintAmount:{value:tintAmt}, uOpacity:{value:0.9},
          uVolume:{value:0}, uTime:{value:0}, uFlutter:{value:1.0}, uGlow:{value:0.4},
          uBend:{value:bend},
        },
        vertexShader:VERT, fragmentShader:FRAG,
        transparent:true, side:THREE.DoubleSide, depthWrite:false, blending:THREE.NormalBlending,
      });
    }

    // ─── FlyPetal 데이터 구조 ────────────────────────────────────────────────
    interface FlyPetal {
      mesh:THREE.Mesh; mat:THREE.ShaderMaterial;
      vx:number; vy:number; vz:number;     // 속도 벡터
      pitchVel:number; yawVel:number;       // X/Y 각속도 (노이즈 타깃 lerp)
      rollAmp:number; rollFreq:number;      // Z 스웨이 파라미터
      drag:number;                          // 공기 저항
      detachDur:number;                     // 이탈 단계 길이 (초기 거의 정지)
      rampDur:number;                       // 바람 가속 구간
      windStr:number;                       // 바람 감수성
      vortexSign:number;                    // 소용돌이 방향 +1/-1
      noiseOff:THREE.Vector3;               // 개별 노이즈 오프셋
      age:number; maxAge:number;
      scale:number; phase:number;
    }
    const flyPetals:FlyPetal[]=[];
    const MAX_FLY=PETAL_CONFIG.MAX_PETAL_COUNT;

    // ─── 스폰 ────────────────────────────────────────────────────────────────
    function spawnPetal(vol:number, tint:THREE.Color, tintAmt:number) {
      if(flyPetals.length>=MAX_FLY) return;
      const bend = Math.random()<0.45 ? (0.28+Math.random()*0.52)*(Math.random()<0.5?1:-1) : 0;
      const mat=makeMat(tint,tintAmt,bend);
      const mesh=new THREE.Mesh(petalGeo.clone(),mat);
      const fp=getFlowerPos();

      // 도넛 타원 스폰 — 수술 중심부 완전 제외
      // 12시(60°~120°)·6시(210°~330°) 제외 → 좌측 호(120°~210°) 또는 우측 호(330°~420°)
      const spAngle = Math.random() < 0.5
        ? (Math.PI * 2/3)  + Math.random() * (Math.PI * 0.5)   // 120°~210° (9~6시)
        : (Math.PI * 11/6) + Math.random() * (Math.PI * 0.5);  // 330°~420° (3~2시)
      const r=PETAL_CONFIG.SPAWN_RADIUS_MIN
             +Math.random()*(PETAL_CONFIG.SPAWN_RADIUS_MAX-PETAL_CONFIG.SPAWN_RADIUS_MIN);
      mesh.position.set(
        fp.x+Math.cos(spAngle)*r*1.20,
        fp.y+Math.sin(spAngle)*r*0.65,
        (Math.random()-.5)*0.1,
      );

      // 기본 자세: BASE_ANGLE 기울기, pitch/yaw는 0
      const baseRad=PETAL_CONFIG.BASE_ANGLE*Math.PI/180;
      mesh.rotation.set(0,0,baseRad);

      // 크기: BASE_SIZE ± SIZE_VARIATION
      const s=PETAL_CONFIG.BASE_SIZE*(1+(Math.random()*2-1)*PETAL_CONFIG.SIZE_VARIATION);
      mesh.scale.setScalar(s);
      mesh.renderOrder=1;
      scene.add(mesh);

      // 초기 속도: SPAWN_DIRECTION_ANGLE(3시=0°) 방향으로 출발
      const spawnRad=PETAL_CONFIG.SPAWN_DIRECTION_ANGLE*Math.PI/180;
      const initSpd=(0.08+Math.random()*0.04)*PETAL_CONFIG.INITIAL_SPAWN_SPEED;
      flyPetals.push({
        mesh, mat,
        vx: Math.cos(spawnRad)*initSpd,
        vy: Math.sin(spawnRad)*initSpd,
        vz:(Math.random()-.5)*0.006,
        pitchVel:0,
        yawVel:0,
        rollAmp:PETAL_CONFIG.Z_ROTATION_SPEED*(0.8+Math.random()*0.4),
        rollFreq:0.18+Math.random()*0.14,
        drag:0.7+Math.random()*0.30,
        detachDur:0,
        rampDur:0.15+Math.random()*0.15,
        windStr:0.60+Math.random()*0.40,
        vortexSign:Math.random()>0.5?1:-1,
        noiseOff:new THREE.Vector3(Math.random()*100,Math.random()*100,Math.random()*100),
        age:0, maxAge:60,
        scale:s, phase:Math.random()*Math.PI*2,
      });
    }

    // ─── 황금 빛 파티클 (꽃잎 미니 버전, 오디오 연동) ──────────────────────
    const sparkTex=makeSparkTex();
    const sparkBaseGeo=new THREE.PlaneGeometry(1,1);

    // 꽃잎과 동일한 물리 필드 + spark 고유 회전 필드
    interface GoldSpark {
      mesh:THREE.Mesh; mat:THREE.MeshBasicMaterial;
      vx:number; vy:number; vz:number;
      pitchVel:number; yawVel:number;
      rollAmp:number; rollFreq:number;
      drag:number; detachDur:number; rampDur:number;
      windStr:number; vortexSign:number;
      noiseOff:THREE.Vector3;
      age:number; maxAge:number;
      phase:number; scale:number;
    }
    const goldSparks:GoldSpark[]=[];

    // 꽃잎 뒤꽁무니 좁은 범위에서만 생성 — 얇은 황금 띠(스트림) 연출
    function spawnGoldSpark(
      ox:number, oy:number, oz:number,
      pvx:number, pvy:number,
      tint:THREE.Color
    ){
      if(goldSparks.length>=PETAL_CONFIG.PARTICLE_MAX_COUNT) return;
      const mat=new THREE.MeshBasicMaterial({
        map:sparkTex, transparent:true,
        blending:THREE.AdditiveBlending, depthWrite:false,
        color:new THREE.Color(0xffd700).lerp(tint,.20),
        opacity:PETAL_CONFIG.PARTICLE_BASE_ALPHA, side:THREE.DoubleSide,
      });
      const mesh=new THREE.Mesh(sparkBaseGeo.clone(),mat);
      // ★ 크기 균일화: 모래알 크기 고정
      const szRatio=PETAL_CONFIG.PARTICLE_MIN_SIZE
                   +Math.random()*(PETAL_CONFIG.PARTICLE_MAX_SIZE-PETAL_CONFIG.PARTICLE_MIN_SIZE);
      const s=szRatio*0.14;
      mesh.scale.setScalar(s);
      // ★ 생성 위치: 꽃잎 바로 뒤 극소 범위(±0.04)
      mesh.position.set(
        ox+(Math.random()-.5)*.04,
        oy+(Math.random()-.5)*.04,
        oz+(Math.random()-.5)*.03,
      );
      const baseRad=PETAL_CONFIG.BASE_ANGLE*Math.PI/180;
      mesh.rotation.set(0,0,baseRad);
      mesh.renderOrder=0;
      scene.add(mesh);

      goldSparks.push({
        mesh, mat,
        // ★ 속도: 꽃잎 그대로 계승, 사방 spread 극소화
        vx: pvx+(Math.random()-.5)*.006,
        vy: pvy+(Math.random()-.5)*.006,
        vz: (Math.random()-.5)*.003,
        pitchVel:0, yawVel:0,
        rollAmp:PETAL_CONFIG.Z_ROTATION_SPEED*(0.9+Math.random()*.2),
        rollFreq:0.18+Math.random()*.08,
        drag:0.95,
        detachDur:0, rampDur:0.4+Math.random()*.3,
        // ★ windStr 균일화 — 파티클 동일 속도로 흐름
        windStr:0.88+Math.random()*.08,
        vortexSign:1,  // ★ 소용돌이 제거
        // ★ noiseOff 극소화 — 거의 동일한 noise 필드 공유
        noiseOff:new THREE.Vector3(Math.random()*2,Math.random()*2,Math.random()*2),
        age:0, maxAge:50,
        phase:Math.random()*Math.PI*2, scale:s,
      });
    }

    // ─── 보케 파티클 풀 ─────────────────────────────────────────────────────
    const MAX_BK=80;
    const bkGeo=new THREE.BufferGeometry();
    const bkPos=new Float32Array(MAX_BK*3);
    const bkVel=new Float32Array(MAX_BK*3);
    const bkAge=new Float32Array(MAX_BK).fill(9999);
    const bkLife=new Float32Array(MAX_BK).fill(1);
    for(let i=0;i<MAX_BK;i++){bkPos[i*3]=-1e4;bkPos[i*3+1]=-1e4;}
    bkGeo.setAttribute("position",new THREE.BufferAttribute(bkPos,3));
    const bokehTex=makeBokehTex();
    const bkMat=new THREE.PointsMaterial({size:1.6,map:bokehTex,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,color:0xffffff});
    scene.add(new THREE.Points(bkGeo,bkMat));
    let nextBk=0;
    function emitBokeh(vol:number,fp:THREE.Vector3){
      if(Math.random()>.04+vol*.14) return;
      const i=nextBk=(nextBk+1)%MAX_BK;
      bkPos[i*3]=fp.x+(Math.random()-.5)*3;
      bkPos[i*3+1]=fp.y+(Math.random()-.5)*3;
      bkPos[i*3+2]=-2+(Math.random()-.5)*1.5;
      bkVel[i*3]=.3+Math.random()*.8; bkVel[i*3+1]=.1+Math.random()*.5; bkVel[i*3+2]=(Math.random()-.5)*.3;
      bkAge[i]=0; bkLife[i]=5+Math.random()*7;
      bkGeo.attributes.position.needsUpdate=true;
    }

    // ─── 감정 색상 상태 ──────────────────────────────────────────────────────
    const liveColor=WHITE.clone(), goalColor=WHITE.clone();
    let liveTintAmt=0, goalTintAmt=0, afterglow=-1.0, prevWeight=0;
    const GLOW_DUR=7.5;

    const clock=new THREE.Clock();
    let spawnFrameCount=0; // SPAWN_INTERVAL_FRAMES 체크용
    let idleSpawnTimer=0;  // 무음 idle 스폰 타이머
    let prevHasEmo=false;  // 감정 상태 전환 감지용

    // ─── 렌더 루프 ───────────────────────────────────────────────────────────
    function tick(){
      animRef.current=requestAnimationFrame(tick);
      const dt=Math.min(clock.getDelta(),.05);
      const time=clock.getElapsedTime();
      const vol=volRef.current;
      const emo=emoRef.current;
      const fp=getFlowerPos();

      fillLight.position.copy(fp).add(new THREE.Vector3(0,0,2));
      fillLight.intensity=5+vol*30+Math.sin(time*8)*1.0;

      // 감정 색 계산
      let wSum=0;
      const blended=new THREE.Color(0,0,0);
      // ★ 지배 감정 단일 색: 가장 높은 감정 하나만 골라 100% 적용 (혼합 없음)
      let dominantKey: keyof EmotionScores | null = null;
      let dominantW = 0;
      (Object.keys(emo) as Array<keyof EmotionScores>).forEach(k=>{
        const w=emo[k]; wSum+=w;
        if(w>dominantW){ dominantW=w; dominantKey=k; }
      });
      const hasEmo=dominantW>.25 && dominantKey!=null;
      if(hasEmo){
        goalColor.copy(EMOTION_COLORS[dominantKey!]);
        goalTintAmt=1.0; afterglow=0;
      } else if(afterglow>=0){
        afterglow+=dt;
        const ease=Math.min(afterglow/GLOW_DUR,1); goalTintAmt=1-ease*ease*(3-2*ease);
        if(afterglow>=GLOW_DUR){afterglow=-1;goalTintAmt=0;}
      } else {
        goalColor.copy(WHITE); goalTintAmt=0;
      }
      if(hasEmo&&prevWeight<.05) liveTintAmt=0;
      prevWeight=wSum;
      liveColor.lerp(goalColor,hasEmo?dt*2.5:dt*0.3);
      liveTintAmt+=((goalTintAmt-liveTintAmt)*Math.min(hasEmo?dt*1.8:dt*0.3,1));
      liveTintAmt=Math.max(0,Math.min(1,liveTintAmt));
      fillLight.color.copy(liveColor);
      keyLight.color.copy(liveColor).lerp(new THREE.Color(1,.96,.88),.6);
      flowerMat.uniforms["uTint"].value.copy(liveColor);
      flowerMat.uniforms["uTintAmount"].value=liveTintAmt;

      // ─── 감정 최초 인식 시 최소 꽃잎 즉시 버스트 ───────────────────────
      if(hasEmo && !prevHasEmo && activeRef.current){
        const burstCount=Math.min(
          PETAL_CONFIG.MIN_EMOTION_SPAWN_COUNT,
          PETAL_CONFIG.MAX_PETAL_COUNT - flyPetals.length
        );
        for(let b=0;b<burstCount;b++) spawnPetal(Math.max(vol,0.3), liveColor, liveTintAmt);
      }
      prevHasEmo=hasEmo;

      // ─── 무음 idle 스폰 (최소 연출 유지) ───────────────────────────────
      if(activeRef.current && vol < PETAL_CONFIG.AUDIO_THRESHOLD){
        idleSpawnTimer+=dt;
        if(idleSpawnTimer >= PETAL_CONFIG.IDLE_SPAWN_INTERVAL){
          idleSpawnTimer=0;
          if(flyPetals.length < PETAL_CONFIG.MAX_PETAL_COUNT)
            spawnPetal(0, liveColor, liveTintAmt);
        }
      } else {
        idleSpawnTimer=0; // 오디오 감지 시 타이머 리셋
      }

      // ─── 꽃잎 스폰 트리거 ───────────────────────────────────────────────
      // SPAWN_INTERVAL_FRAMES마다 한 번만 체크 → 매 프레임 누적 방지
      spawnFrameCount++;
      if(activeRef.current && vol >= PETAL_CONFIG.AUDIO_THRESHOLD
         && spawnFrameCount >= PETAL_CONFIG.SPAWN_INTERVAL_FRAMES) {
        spawnFrameCount = 0;

        // 볼륨을 [THRESHOLD~1.0] → [0~1] 로 정규화
        const t = (vol - PETAL_CONFIG.AUDIO_THRESHOLD)
                / (1.0 - PETAL_CONFIG.AUDIO_THRESHOLD);

        // 생성 확률: 작은 소리 → BASE_SPAWN_CHANCE, 큰 소리 → MAX_SPAWN_CHANCE
        // t²로 가속 → 조용할 땐 거의 안 나오다가 크게 말할 때 폭발적으로 증가
        const spawnChance = PETAL_CONFIG.BASE_SPAWN_CHANCE
                          + (PETAL_CONFIG.MAX_SPAWN_CHANCE - PETAL_CONFIG.BASE_SPAWN_CHANCE)
                          * (t * t);

        if(Math.random() < spawnChance) {
          // BURST_SPAWN_COUNT만큼 한 번에 생성
          const burst = Math.min(
            PETAL_CONFIG.BURST_SPAWN_COUNT,
            PETAL_CONFIG.MAX_PETAL_COUNT - flyPetals.length
          );
          for(let b=0; b<burst; b++) spawnPetal(vol, liveColor, liveTintAmt);
        }
        // 황금 파티클은 꽃잎 궤적에서만 생성 (아래 petal loop 참고)
      }
      if(vol >= PETAL_CONFIG.AUDIO_THRESHOLD) emitBokeh(vol,fp);

      // ═══════════════════════════════════════════════════════════════════════
      // 꽃잎 물리 update()
      // ═══════════════════════════════════════════════════════════════════════
      // 화면 경계 (월드 좌표)
      const halfH_s=Math.tan((camera.fov*Math.PI/180)/2)*camera.position.z;
      const halfW_s=halfH_s*(container.clientWidth/container.clientHeight);

      for(let i=flyPetals.length-1;i>=0;i--){
        const p=flyPetals[i];
        p.age+=dt;

        const px=p.mesh.position.x, py=p.mesh.position.y, pz=p.mesh.position.z;

        // ── 화면 밖으로 완전히 벗어나면 제거 (age-fade 없음) ───────────────
        if(px>halfW_s*1.3 || py>halfH_s*1.3 || p.age>=p.maxAge){
          scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mat.dispose();
          flyPetals.splice(i,1); continue;
        }

        // ── 1. 바람 계수 ramp-up ────────────────────────────────────────────
        const rawWind=Math.max(0,(p.age-p.detachDur)/p.rampDur);
        const wf=Math.min(rawWind,1.0);
        const windT=wf*wf*(3-2*wf);

        // ── 2. 중력 ──────────────────────────────────────────────────────────
        const grav=0.025+windT*0.055;
        p.vy-=grav*dt;

        // ── 3. 퍼린 노이즈 기류 — 노이즈 비중 높여 S자 강화 ────────────────
        const nx=px*0.06+p.noiseOff.x+time*0.032;
        const ny=py*0.06+p.noiseOff.y+time*0.025;
        const nz=pz*0.04+p.noiseOff.z+time*0.020;
        const flow=curlNoise(nx,ny,nz,time);
        // 노이즈 비중 높이고 직선 바람 줄임
        const noiseAmp=p.windStr*(1.0+vol*0.7)*windT;

        // ── 4. 주 바람: TARGET_ANGLE 방향으로 고정, MAX_WIND_FORCE 적용 ──
        const tRad=Math.abs(PETAL_CONFIG.TARGET_ANGLE)*Math.PI/180;
        const STREAM_X=Math.cos(tRad), STREAM_Y=Math.sin(tRad);
        const windScale=PETAL_CONFIG.MAX_WIND_FORCE*(0.25+vol*0.75)*p.windStr;
        p.vx+=(STREAM_X*windScale + flow.x*noiseAmp*2.2)*dt;
        p.vy+=(STREAM_Y*windScale   + flow.y*noiseAmp*1.6)*dt;
        p.vz=0; // ★ z축 고정 — vz 누적으로 원근 축소되는 현상 방지

        // ── 5. 소용돌이 ──────────────────────────────────────────────────────
        const vcx=fp.x+1.8, vcy=fp.y+0.8;
        const dvx=px-vcx, dvy=py-vcy;
        const vdist=Math.sqrt(dvx*dvx+dvy*dvy)+0.8;
        const omega=p.vortexSign*0.7/(vdist+2.0)*windT;
        p.vx+=(-dvy/vdist)*omega*dt;
        p.vy+=( dvx/vdist)*omega*dt;

        // ── 6. 공기 저항 — FORCE_DAMPING 적용 ───────────────────────────────
        const drag=Math.pow(PETAL_CONFIG.FORCE_DAMPING, dt*60);
        p.vx*=drag; p.vy*=drag; p.vz*=drag;

        // ── 7. 스트림 채널 — STREAM_WIDTH로 폭 제한, 이탈 시 복원력 ─────────
        const PERP_X=-STREAM_Y, PERP_Y=STREAM_X;
        const relX=px-fp.x, relY=py-fp.y;
        const perpDist=relX*PERP_X+relY*PERP_Y;
        if(Math.abs(perpDist)>PETAL_CONFIG.STREAM_WIDTH && windT>0.1){
          const excess=perpDist-Math.sign(perpDist)*PETAL_CONFIG.STREAM_WIDTH;
          p.vx-=excess*PERP_X*4.0*dt;
          p.vy-=excess*PERP_Y*4.0*dt;
        }

        // ── 8. 역방향 댐핑 ───────────────────────────────────────────────────
        if(windT>0.3){
          if(p.vx<-0.04) p.vx*=0.82;
          if(p.vy<0.35*p.windStr-0.7) p.vy*=0.86;
        }

        // ── 8.5. 왼쪽 1/3 구역에서 위쪽 속도 억제 (12시 방향 차단)
        if(px < -halfW_s/3 && p.vy > 0) p.vy *= 0.75;

        // ── 9. 위치 이동 ──────────────────────────────────────────────────────
        p.mesh.position.x+=p.vx*dt;
        p.mesh.position.y+=p.vy*dt;
        p.mesh.position.z+=p.vz*dt;

        // ── 10. X(Pitch) / Y(Yaw): 축별 속도 독립 제어, 부드러운 수렴 ─────
        const tgtPitch=NA(nx*1.2,ny*1.2,nz*1.2)*PETAL_CONFIG.X_ROTATION_SPEED*8;
        const tgtYaw  =NB(nx*1.2,ny*1.2,nz*1.2)*PETAL_CONFIG.Y_ROTATION_SPEED*6;
        p.pitchVel+=(tgtPitch-p.pitchVel)*Math.min(dt*0.30,1);
        p.yawVel  +=(tgtYaw  -p.yawVel  )*Math.min(dt*0.24,1);
        p.pitchVel*=0.97;  // 마찰 감쇠 — 끊김 없이 부드럽게
        p.yawVel  *=0.97;
        p.mesh.rotation.x+=p.pitchVel*dt;
        p.mesh.rotation.y+=p.yawVel*dt;

        // ── 11. Z(Roll): BASE_ANGLE 기울기 유지 + 시계추 나풀거림 ──────────
        const baseRad=PETAL_CONFIG.BASE_ANGLE*Math.PI/180;
        p.mesh.rotation.z=baseRad+p.rollAmp*Math.sin(p.rollFreq*p.age+p.phase);

        p.mesh.scale.setScalar(p.scale);  // 크기 고정 (펄싱 제거)

        // ── 12. 투명도: 화면 내 항상 1.0 ───────────────────────────────────
        const agT=afterglow>=0?Math.min(afterglow/GLOW_DUR,1):0;
        p.mat.uniforms["uTime"].value=time;
        p.mat.uniforms["uVolume"].value=vol;
        p.mat.uniforms["uOpacity"].value=0.92;
        p.mat.uniforms["uTint"].value.copy(liveColor);
        p.mat.uniforms["uTintAmount"].value=liveTintAmt*(1-agT*.7);
        p.mat.uniforms["uGlow"].value=.25+vol*.30+Math.sin(time*3.0+p.phase)*.05;

        // ── 13. 꽃잎 궤적에서 황금 파티클 방출 ─────────────────────────────
        if(windT>0.15 && Math.random()<0.20+vol*0.20)
          spawnGoldSpark(px,py,pz,p.vx,p.vy,liveColor);
      }

      // ─── 황금 빛 파티클 업데이트 (꽃잎과 동일한 물리) ─────────────────
      for(let i=goldSparks.length-1;i>=0;i--){
        const s=goldSparks[i];
        s.age+=dt;
        const spx=s.mesh.position.x, spy=s.mesh.position.y, spz=s.mesh.position.z;

        // 꽃잎과 동일한 제거 조건
        if(spx>halfW_s*1.3 || spy>halfH_s*1.3 || s.age>=s.maxAge){
          scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mat.dispose();
          goldSparks.splice(i,1); continue;
        }

        // 1. 바람 ramp-up (꽃잎과 동일)
        const sRaw=Math.max(0,(s.age-s.detachDur)/s.rampDur);
        const swf=Math.min(sRaw,1.0);
        const sWindT=swf*swf*(3-2*swf);

        // 2. 중력
        s.vy-=(0.025+sWindT*0.055)*dt;

        // 3. curl noise — ★ 파티클 공유 필드(noiseOff 극소), 진폭 대폭 감소
        const snx=spx*0.06+s.noiseOff.x+time*0.032;
        const sny=spy*0.06+s.noiseOff.y+time*0.025;
        const snz=spz*0.04+s.noiseOff.z+time*0.020;
        const sFlow=curlNoise(snx,sny,snz,time);
        const sNoiseAmp=s.windStr*(0.20+vol*0.20)*sWindT;  // ★ 1/5 수준으로 감소

        // 4. 주 바람
        const stRad=Math.abs(PETAL_CONFIG.TARGET_ANGLE)*Math.PI/180;
        const sSX=Math.cos(stRad), sSY=Math.sin(stRad);
        const sWindScale=PETAL_CONFIG.MAX_WIND_FORCE*(0.25+vol*0.75)*s.windStr;
        s.vx+=(sSX*sWindScale+sFlow.x*sNoiseAmp*0.7)*dt;
        s.vy+=(sSY*sWindScale+sFlow.y*sNoiseAmp*0.5)*dt;
        s.vz+=sFlow.z*sNoiseAmp*0.15*dt;

        // 5. 소용돌이 제거 (벌레 패턴 주원인 → 삭제)

        // 6. 공기 저항
        const sDrag=Math.pow(PETAL_CONFIG.FORCE_DAMPING,dt*60);
        s.vx*=sDrag; s.vy*=sDrag; s.vz*=sDrag;

        // 7. ★ 수직 속도 적극 감쇠 — 스트림 축만 보존, 수직 성분 80% 제거
        const sPerpX=-sSY, sPerpY=sSX;
        const perpVel=s.vx*sPerpX+s.vy*sPerpY;
        s.vx-=perpVel*sPerpX*0.80;
        s.vy-=perpVel*sPerpY*0.80;

        // ★ 좁은 하드 채널 (STREAM_WIDTH의 1/4)
        const sRelX=spx-fp.x, sRelY=spy-fp.y;
        const sPerpDist=sRelX*sPerpX+sRelY*sPerpY;
        const streamHalf=PETAL_CONFIG.STREAM_WIDTH*0.25;
        if(Math.abs(sPerpDist)>streamHalf && sWindT>0.1){
          const sExc=sPerpDist-Math.sign(sPerpDist)*streamHalf;
          s.vx-=sExc*sPerpX*10.0*dt;
          s.vy-=sExc*sPerpY*10.0*dt;
        }

        // 8. 역방향 댐핑
        if(sWindT>0.3){
          if(s.vx<-0.04) s.vx*=0.82;
          if(s.vy<0.35*s.windStr-0.7) s.vy*=0.86;
        }

        // 9. 위치 이동
        s.mesh.position.x+=s.vx*dt;
        s.mesh.position.y+=s.vy*dt;
        s.mesh.position.z+=s.vz*dt;

        // 9.5. ★ 사인파 웨이브 — phase 분산 0.3배로 줄여 함께 출렁이게
        s.mesh.position.y += Math.cos(
          s.mesh.position.x * PETAL_CONFIG.PARTICLE_WAVE_FREQUENCY
          + time * PETAL_CONFIG.PARTICLE_WAVE_SPEED
          + s.phase        // 알갱이마다 엇박자 → 유기적인 S자 띠
        ) * PETAL_CONFIG.PARTICLE_WAVE_AMPLITUDE * 0.006 * dt;

        // 10-11. 회전 (noise 기반 pitch/yaw + roll sway)
        const stgtPitch=NA(snx*1.2,sny*1.2,snz*1.2)*PETAL_CONFIG.X_ROTATION_SPEED*8;
        const stgtYaw  =NB(snx*1.2,sny*1.2,snz*1.2)*PETAL_CONFIG.Y_ROTATION_SPEED*6;
        s.pitchVel+=(stgtPitch-s.pitchVel)*Math.min(dt*0.30,1);
        s.yawVel  +=(stgtYaw  -s.yawVel  )*Math.min(dt*0.24,1);
        s.pitchVel*=0.97; s.yawVel*=0.97;
        s.mesh.rotation.x+=s.pitchVel*dt;
        s.mesh.rotation.y+=s.yawVel*dt;
        const sBaseRad=PETAL_CONFIG.BASE_ANGLE*Math.PI/180;
        s.mesh.rotation.z=sBaseRad+s.rollAmp*Math.sin(s.rollFreq*s.age+s.phase);

        // 반짝임 맥동: 0.28~0.52 범위 — 꽃잎보다 은은하게
        s.mat.opacity=0.40+Math.sin(time*5.0+s.phase)*.12;
        s.mat.color.set(0xffd700); s.mat.color.lerp(liveColor,.25);
      }

      // ─── 보케 업데이트 ──────────────────────────────────────────────────
      for(let i=0;i<MAX_BK;i++){
        if(bkAge[i]>=bkLife[i]){bkPos[i*3]=-1e4;bkPos[i*3+1]=-1e4;continue;}
        bkAge[i]+=dt;
        const curl=curlNoise(bkPos[i*3]*.05,bkPos[i*3+1]*.05,bkPos[i*3+2]*.05,time);
        bkPos[i*3]+=(bkVel[i*3]+curl.x*.2)*dt;
        bkPos[i*3+1]+=(bkVel[i*3+1]+curl.y*.2)*dt;
        bkPos[i*3+2]+=(bkVel[i*3+2]+curl.z*.1)*dt;
      }
      bkGeo.attributes.position.needsUpdate=true;
      bkMat.color.set(0xfff5e8); bkMat.color.lerp(liveColor,.30);

      renderer.render(scene,camera);
    }
    tick();

    const ro=new ResizeObserver(entries=>{
      const{width:w,height:h}=entries[0].contentRect;
      renderer.setSize(w,h); camera.aspect=w/h; camera.updateProjectionMatrix();
      // 전체화면 전환 시 꽃 메시 지오메트리를 현재 뷰포트 크기로 재생성
      if(flowerMesh){
        const halfH_cam=Math.tan((camera.fov*Math.PI/180)/2)*camera.position.z;
        const newHalfW=halfH_cam*(w/h);
        flowerMesh.geometry.dispose();
        flowerMesh.geometry=new THREE.PlaneGeometry(newHalfW*2, halfH_cam*2);
        flowerMesh.scale.setScalar(0.9);
      }
    });
    ro.observe(container);

    return()=>{
      ro.disconnect();
      if(animRef.current) cancelAnimationFrame(animRef.current);
      petalGeo.dispose(); petalTex.dispose();
      flyPetals.forEach(({mesh,mat})=>{mesh.geometry.dispose();mat.dispose();});
      goldSparks.forEach(({mesh,mat})=>{mesh.geometry.dispose();mat.dispose();});
      sparkBaseGeo.dispose(); sparkTex.dispose();
      bkGeo.dispose(); bkMat.dispose(); bokehTex.dispose();
      if(container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      renderer.dispose();
    };
  },[]);

  return <div ref={containerRef} style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:1}} />;
}
