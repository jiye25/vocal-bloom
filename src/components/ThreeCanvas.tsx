import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import type { EmotionScores } from "../types";

// ─── 감정 색상 ────────────────────────────────────────────────────────────────
const EMOTION_COLORS: Record<keyof EmotionScores, THREE.Color> = {
  love:       new THREE.Color(0.949, 0.675, 0.804),
  longing:    new THREE.Color(0.741, 0.682, 0.949),
  joy:        new THREE.Color(1.000, 0.961, 0.251),
  sadness:    new THREE.Color(0.290, 0.498, 0.627),
  excitement: new THREE.Color(0.737, 0.992, 0.902),
  gratitude:  new THREE.Color(0.949, 0.675, 0.329),
};
const WHITE = new THREE.Color(1, 1, 1);

// CSS flower img (bottom:0, left:0, height:52vh) 기준 수술 중심 UV
const FLOWER_UV_X = 0.18;
const FLOWER_UV_Y = 0.78;

// ─── 꽃잎 제어 상수 (여기서 수치 조정) ──────────────────────────────────────
const PETAL_CONFIG = {
  START_COUNT:        10,    // 최초 트리거 시 기본 스폰 개수

  BASE_SIZE:          1.5,   // 꽃잎 기본 크기 (Three.js 월드 단위)
  SIZE_VARIATION:     0.03,  // 크기 랜덤 오차 ±3%

  BASE_ANGLE:        -15,    // 생성 시 기본 Z 회전 각도 (도)

  X_ROTATION_SPEED:   0.1,   // X축 앞뒤 까딱임 강도 (Pitch)
  Y_ROTATION_SPEED:   0.3,   // Y축 좌우 돌림 강도 (Yaw)
  Z_ROTATION_SPEED:   0.6,   // Z축 시계추 흔들림 강도 (Roll)

  SPAWN_RADIUS_MIN:   0.80,  // 수술 중심 제외 최소 반지름
  SPAWN_RADIUS_MAX:   1.80,  // 스폰 최대 반지름

  AUDIO_THRESHOLD:    0.04,  // 꽃잎 생성 시작 최소 볼륨 (0~1)
  MAX_WIND_FORCE:     1.0,   // 최대 볼륨 시 바람 세기 승수
  MAX_PETAL_COUNT:    17,    // 화면 내 최대 꽃잎 수
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
    col=mix(col,uTint*(luma*0.85+0.30),uTintAmount);
    float fr=pow(1.0-max(dot(vNorm,vView),0.0),2.5);
    col+=mix(vec3(1.0),uTint,uTintAmount)*fr*(0.35+uGlow*1.2);
    gl_FragColor=vec4(col,texel.a*uOpacity);
  }
`;

// ─── 파티클 텍스처 ────────────────────────────────────────────────────────────
function makeGoldTex():THREE.Texture {
  const c=document.createElement("canvas"); c.width=c.height=64;
  const ctx=c.getContext("2d")!;
  const g=ctx.createRadialGradient(32,32,0,32,32,28);
  g.addColorStop(0,"rgba(255,245,160,1)"); g.addColorStop(.3,"rgba(255,210,60,.85)");
  g.addColorStop(.7,"rgba(240,170,20,.12)"); g.addColorStop(1,"rgba(220,140,0,0)");
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(32,32,28,0,Math.PI*2); ctx.fill();
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
    const flowerMat = (() => {
      const halfH=Math.tan((camera.fov*Math.PI/180)/2)*camera.position.z;
      const halfW=halfH*(W/H);
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
            // 노란 수술 영역: R·G 높고 B 낮음 → 틴트 제외
            float yellowness = (c.r + c.g - 2.0*c.b) * 0.5;
            float mask = clamp(1.0 - yellowness * 3.0, 0.0, 1.0);
            vec3 col=mix(c.rgb, uTint*(lum*0.85+0.30), uTintAmount*0.75*mask);
            gl_FragColor=vec4(col,c.a);
          }`,
        transparent:true, depthWrite:false, side:THREE.FrontSide,
      });
      const vMesh=new THREE.Mesh(vGeo,vMat);
      vMesh.renderOrder=10;
      vMesh.position.set(-1.0,-0.75,0.1);
      vMesh.scale.setScalar(0.9);
      scene.add(vMesh);
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
      const spAngle=Math.random()*Math.PI*2;
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

      // 초기 속도: 수직 상승 제거 → 대각선 방향으로 즉시 출발
      const STREAM_X=0.906, STREAM_Y=0.423;
      const initSpd=0.04+Math.random()*0.03;
      flyPetals.push({
        mesh, mat,
        vx: STREAM_X*initSpd,
        vy: STREAM_Y*initSpd*0.4,  // 사선, 수직 솟구침 없음
        vz:(Math.random()-.5)*0.006,
        pitchVel:0,
        yawVel:0,
        rollAmp:PETAL_CONFIG.Z_ROTATION_SPEED*(0.8+Math.random()*0.4),
        rollFreq:0.18+Math.random()*0.14,
        drag:0.7+Math.random()*0.30,
        detachDur:0,       // 즉시 바람 적용
        rampDur:0.5+Math.random()*0.4,
        windStr:0.60+Math.random()*0.40,
        vortexSign:Math.random()>0.5?1:-1,
        noiseOff:new THREE.Vector3(Math.random()*100,Math.random()*100,Math.random()*100),
        age:0, maxAge:60,
        scale:s, phase:Math.random()*Math.PI*2,
      });
    }

    // ─── 황금 먼지 파티클 풀 ────────────────────────────────────────────────
    const MAX_DUST=2000;
    const dustGeo=new THREE.BufferGeometry();
    const dustPos=new Float32Array(MAX_DUST*3);
    const dustVel=new Float32Array(MAX_DUST*3);
    const dustAge=new Float32Array(MAX_DUST).fill(9999);
    const dustLife=new Float32Array(MAX_DUST).fill(1);
    for(let i=0;i<MAX_DUST;i++){dustPos[i*3]=-1e4;dustPos[i*3+1]=-1e4;}
    dustGeo.setAttribute("position",new THREE.BufferAttribute(dustPos,3));
    const goldTex=makeGoldTex();
    const dustMat=new THREE.PointsMaterial({size:.06,map:goldTex,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,color:0xffd060});
    scene.add(new THREE.Points(dustGeo,dustMat));
    let nextDust=0;

    function emitGoldDust(ox:number,oy:number,oz:number,pvx:number,pvy:number,vol:number){
      const n=1+Math.floor(vol*2);
      for(let c=0;c<n;c++){
        const i=nextDust=(nextDust+1)%MAX_DUST;
        dustPos[i*3]  =ox+(Math.random()-.5)*0.08;
        dustPos[i*3+1]=oy+(Math.random()-.5)*0.08;
        dustPos[i*3+2]=oz+(Math.random()-.5)*0.05;
        // 꽃잎보다 가볍게 → 속도 줄이고 노이즈에 민감
        dustVel[i*3]  =pvx*0.15+(Math.random()-.5)*0.25;
        dustVel[i*3+1]=pvy*0.15+(Math.random()-.5)*0.20;
        dustVel[i*3+2]=(Math.random()-.5)*0.15;
        dustAge[i]=0;
        dustLife[i]=0.5+Math.random()*0.6; // 0.5~1.1초 수명
      }
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

    // ─── 초기 꽃잎 START_COUNT개 스폰 ───────────────────────────────────────
    for(let i=0;i<PETAL_CONFIG.START_COUNT;i++){
      spawnPetal(0.1, WHITE.clone(), 0);
    }

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
      (Object.keys(emo) as Array<keyof EmotionScores>).forEach(k=>{
        const w=emo[k];
        if(w>.04){ blended.r+=EMOTION_COLORS[k].r*w; blended.g+=EMOTION_COLORS[k].g*w; blended.b+=EMOTION_COLORS[k].b*w; wSum+=w; }
      });
      const hasEmo=wSum>.05;
      if(hasEmo){
        goalColor.setRGB(blended.r/wSum,blended.g/wSum,blended.b/wSum);
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

      // 스폰 — AUDIO_THRESHOLD 이상일 때만, 볼륨 정비례
      if(activeRef.current && vol>PETAL_CONFIG.AUDIO_THRESHOLD){
        const excess=vol-PETAL_CONFIG.AUDIO_THRESHOLD;
        const spawnRate=0.008+excess*0.20;
        if(Math.random()<spawnRate) spawnPetal(vol,liveColor,liveTintAmt);
      }
      emitBokeh(vol,fp);

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

        // ── 4. 주 바람: 우측 상단 25° 대각선, MAX_WIND_FORCE 적용 ────────
        const STREAM_X=0.906, STREAM_Y=0.423;
        const windScale=PETAL_CONFIG.MAX_WIND_FORCE*(0.25+vol*0.75)*p.windStr;
        p.vx+=(STREAM_X*windScale + flow.x*noiseAmp*2.2)*dt;
        p.vy+=(STREAM_Y*windScale*0.35 + flow.y*noiseAmp*1.6)*dt;
        p.vz+=flow.z*noiseAmp*0.5*dt;

        // ── 5. 소용돌이 ──────────────────────────────────────────────────────
        const vcx=fp.x+1.8, vcy=fp.y+0.8;
        const dvx=px-vcx, dvy=py-vcy;
        const vdist=Math.sqrt(dvx*dvx+dvy*dvy)+0.8;
        const omega=p.vortexSign*0.7/(vdist+2.0)*windT;
        p.vx+=(-dvy/vdist)*omega*dt;
        p.vy+=( dvx/vdist)*omega*dt;

        // ── 6. 공기 저항 ──────────────────────────────────────────────────────
        const drag=1.0-p.drag*dt;
        p.vx*=drag; p.vy*=drag; p.vz*=drag;

        // ── 7. 좁은 스트림 채널 (반폭 1.5) ──────────────────────────────────
        const PERP_X=-STREAM_Y, PERP_Y=STREAM_X;
        const relX=px-fp.x, relY=py-fp.y;
        const perpDist=relX*PERP_X+relY*PERP_Y;
        const STREAM_HALF_W=1.5;
        if(Math.abs(perpDist)>STREAM_HALF_W && windT>0.2){
          const excess=perpDist-Math.sign(perpDist)*STREAM_HALF_W;
          p.vx-=excess*PERP_X*3.0*dt;
          p.vy-=excess*PERP_Y*3.0*dt;
        }

        // ── 8. 역방향 댐핑 ───────────────────────────────────────────────────
        if(windT>0.3){
          if(p.vx<-0.04) p.vx*=0.82;
          if(p.vy<0.35*p.windStr-0.7) p.vy*=0.86;
        }

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

        // ── 13. 황금 먼지 꼬리 ───────────────────────────────────────────────
        if(windT>0.15 && Math.random()<0.35+vol*0.35)
          emitGoldDust(px,py,pz,p.vx,p.vy,vol);
      }

      // ─── 황금 먼지 업데이트 ─────────────────────────────────────────────
      for(let i=0;i<MAX_DUST;i++){
        if(dustAge[i]>=dustLife[i]){dustPos[i*3]=-1e4;dustPos[i*3+1]=-1e4;continue;}
        dustAge[i]+=dt;
        // 꽃잎보다 훨씬 노이즈에 민감, 중력 거의 없음
        const curl=curlNoise(dustPos[i*3]*.16,dustPos[i*3+1]*.16,dustPos[i*3+2]*.12,time);
        dustVel[i*3]*=0.82; dustVel[i*3+1]*=0.82; dustVel[i*3+2]*=0.82;
        dustPos[i*3]  +=(dustVel[i*3]  +curl.x*1.4)*dt;
        dustPos[i*3+1]+=(dustVel[i*3+1]+curl.y*1.4)*dt;
        dustPos[i*3+2]+=(dustVel[i*3+2]+curl.z*0.7)*dt;
      }
      dustGeo.attributes.position.needsUpdate=true;
      dustMat.opacity=.65+vol*.30+Math.sin(time*9)*.04;
      dustMat.color.set(0xffd060); dustMat.color.lerp(liveColor,.22);

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
    });
    ro.observe(container);

    return()=>{
      ro.disconnect();
      if(animRef.current) cancelAnimationFrame(animRef.current);
      petalGeo.dispose(); petalTex.dispose();
      flyPetals.forEach(({mesh,mat})=>{mesh.geometry.dispose();mat.dispose();});
      dustGeo.dispose(); dustMat.dispose(); goldTex.dispose();
      bkGeo.dispose(); bkMat.dispose(); bokehTex.dispose();
      if(container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      renderer.dispose();
    };
  },[]);

  return <div ref={containerRef} style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:1}} />;
}
