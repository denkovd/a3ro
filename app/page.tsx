"use client";
import { useEffect, useRef, useState } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useMotionValueEvent,
  useInView,
} from "framer-motion";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import Image from "next/image";

/* ─────────────────────────────────────────────────────────────────
   REVEAL — cinematic fade/blur up
─────────────────────────────────────────────────────────────────── */
function Reveal({
  children,
  delay = 0,
  y = 38,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-90px" });
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y, filter: "blur(8px)" }}
      animate={inView ? { opacity: 1, y: 0, filter: "blur(0px)" } : {}}
      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay }}
    >
      {children}
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Radial glow canvas texture
─────────────────────────────────────────────────────────────────── */
function radialTexture(stops: [number, string][], size = 256): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const ctx = cv.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const BLOOM_LAYER = 1;

/* ─────────────────────────────────────────────────────────────────
   TRAVELER ORB — dark faceted sphere, void seams, scroll-driven charge
─────────────────────────────────────────────────────────────────── */
function TravelerOrb({ scrollRef }: { scrollRef: React.MutableRefObject<number> }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const W = () => el.clientWidth;
    const H = () => el.clientHeight;

    /* Renderer */
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W(), H());
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);

    /* Scene + camera */
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, W() / H(), 0.1, 100);
    camera.position.set(0, 0, 6.2);

    /* Deep-space void background */
    const bg = radialTexture(
      [
        [0, "#160b2c"],
        [0.4, "#0c0720"],
        [0.75, "#070512"],
        [1, "#04030a"],
      ],
      512
    );
    scene.background = bg;

    /* Environment for reflections */
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;

    /* Lights — violet key, magenta rim */
    const hemi = new THREE.HemisphereLight(0x9d7bff, 0x140a26, 0.5);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xd8c4ff, 2.2);
    key.position.set(3, 4, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xd946ef, 2.6);
    rim.position.set(-4, -1, -4);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0x7c3aed, 1.0);
    fill.position.set(0, -3, 2);
    scene.add(fill);

    /* Master group */
    const traveler = new THREE.Group();
    scene.add(traveler);

    /* Dark faceted body */
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1d1030,
      metalness: 0.6,
      roughness: 0.42,
      flatShading: true,
      emissive: new THREE.Color(0x3a1a63),
      emissiveIntensity: 0.35,
      envMapIntensity: 0.9,
    });
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 4), bodyMat);
    traveler.add(body);

    /* Big panel plates — subtle bloom */
    const plateMat = new THREE.MeshBasicMaterial({
      color: 0x8a3bff,
      wireframe: true,
      transparent: true,
      opacity: 0.22,
    });
    const plates = new THREE.Mesh(new THREE.IcosahedronGeometry(1.508, 2), plateMat);
    plates.layers.enable(BLOOM_LAYER);
    traveler.add(plates);

    /* Fine energy seams — bloom */
    const seamMat = new THREE.MeshBasicMaterial({
      color: 0xc873ff,
      wireframe: true,
      transparent: true,
      opacity: 0.3,
    });
    const seams = new THREE.Mesh(new THREE.IcosahedronGeometry(1.514, 4), seamMat);
    seams.layers.enable(BLOOM_LAYER);
    traveler.add(seams);

    /* Fresnel rim shell — energy silhouette */
    const rimMat = new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: {
        uColor: { value: new THREE.Color(0xb06bff) },
        uPower: { value: 2.7 },
      },
      vertexShader: `varying vec3 vN; varying vec3 vView;
        void main(){
          vN = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform vec3 uColor; uniform float uPower; varying vec3 vN; varying vec3 vView;
        void main(){
          float f = pow(1.0 - max(dot(vN, vView), 0.0), uPower);
          gl_FragColor = vec4(uColor, f);
        }`,
    });
    const rimShell = new THREE.Mesh(new THREE.SphereGeometry(1.64, 64, 64), rimMat);
    traveler.add(rimShell);

    /* Halo glow behind orb — blooms */
    const haloMat = new THREE.SpriteMaterial({
      map: radialTexture([
        [0, "rgba(230,190,255,0.9)"],
        [0.32, "rgba(168,85,247,0.55)"],
        [1, "rgba(120,60,255,0)"],
      ]),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.9,
    });
    const halo = new THREE.Sprite(haloMat);
    halo.position.set(0, 0, -0.4);
    halo.scale.set(5, 5, 1);
    halo.layers.enable(BLOOM_LAYER);
    traveler.add(halo);

    /* Orbiting tech debris */
    const debrisMat = new THREE.MeshStandardMaterial({
      color: 0x241436,
      metalness: 0.75,
      roughness: 0.32,
      emissive: new THREE.Color(0x5a1f9c),
      emissiveIntensity: 0.55,
      envMapIntensity: 1.2,
    });
    type Deb = { mesh: THREE.Mesh; a: number; r: number; incl: number; spd: number; spin: THREE.Vector3 };
    const debris: Deb[] = [];
    const DEB = 11;
    for (let i = 0; i < DEB; i++) {
      const k = Math.random();
      const size = 0.12 + Math.random() * 0.2;
      const geo =
        k < 0.5
          ? new THREE.OctahedronGeometry(size, 0)
          : k < 0.8
          ? new THREE.TetrahedronGeometry(size * 1.2, 0)
          : new THREE.BoxGeometry(size, size * 1.6, size);
      const m = new THREE.Mesh(geo, debrisMat);
      const r = 2.4 + Math.random() * 1.5;
      const a = Math.random() * Math.PI * 2;
      const incl = (Math.random() - 0.5) * 0.9;
      m.position.set(Math.cos(a) * r, Math.sin(a) * r * Math.cos(incl), Math.sin(a) * r * Math.sin(incl));
      traveler.add(m);
      debris.push({
        mesh: m,
        a,
        r,
        incl,
        spd: (0.002 + Math.random() * 0.004) * (Math.random() < 0.5 ? -1 : 1),
        spin: new THREE.Vector3((Math.random() - 0.5) * 0.03, (Math.random() - 0.5) * 0.03, (Math.random() - 0.5) * 0.03),
      });
    }

    /* Void dust particles */
    const pN = 520;
    const pPos = new Float32Array(pN * 3);
    const pCol = new Float32Array(pN * 3);
    const cA = new THREE.Color(0xa855f7);
    const cB = new THREE.Color(0xe040fb);
    for (let i = 0; i < pN; i++) {
      const r = 2.0 + Math.random() * 5;
      const a = Math.random() * Math.PI * 2;
      const z = (Math.random() - 0.5) * 6;
      pPos[i * 3] = Math.cos(a) * r;
      pPos[i * 3 + 1] = Math.sin(a) * r;
      pPos[i * 3 + 2] = z;
      const c = cA.clone().lerp(cB, Math.random());
      pCol[i * 3] = c.r;
      pCol[i * 3 + 1] = c.g;
      pCol[i * 3 + 2] = c.b;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
    pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
    const points = new THREE.Points(
      pGeo,
      new THREE.PointsMaterial({
        size: 0.03,
        vertexColors: true,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    scene.add(points);

    /* ── Selective bloom ── */
    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(W(), H()), 0.9, 0.6, 0.0);
    bloomPass.threshold = 0;
    bloomPass.strength = 0.8;
    bloomPass.radius = 0.7;

    const bloomComposer = new EffectComposer(renderer);
    bloomComposer.renderToScreen = false;
    bloomComposer.addPass(renderScene);
    bloomComposer.addPass(bloomPass);

    const mixPass = new ShaderPass(
      new THREE.ShaderMaterial({
        uniforms: {
          baseTexture: { value: null },
          bloomTexture: { value: bloomComposer.renderTarget2.texture },
        },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform sampler2D baseTexture; uniform sampler2D bloomTexture; varying vec2 vUv;
          void main(){ gl_FragColor = texture2D(baseTexture, vUv) + vec4(1.0) * texture2D(bloomTexture, vUv); }`,
        defines: {},
      }),
      "baseTexture"
    );
    mixPass.needsSwap = true;

    const finalComposer = new EffectComposer(renderer);
    finalComposer.addPass(renderScene);
    finalComposer.addPass(mixPass);
    finalComposer.addPass(new OutputPass());

    /* darken helpers */
    const darkMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const matStore: Record<string, THREE.Material | THREE.Material[]> = {};
    const bloomLayer = new THREE.Layers();
    bloomLayer.set(BLOOM_LAYER);
    const darken = (obj: any) => {
      if ((obj.isMesh || obj.isPoints || obj.isSprite) && !bloomLayer.test(obj.layers)) {
        matStore[obj.uuid] = obj.material;
        obj.material = darkMat;
      }
    };
    const restore = (obj: any) => {
      if (matStore[obj.uuid]) {
        obj.material = matStore[obj.uuid];
        delete matStore[obj.uuid];
      }
    };

    /* Pointer parallax */
    const pointer = { x: 0, y: 0 };
    const onPointer = (e: PointerEvent) => {
      pointer.x = (e.clientX / window.innerWidth - 0.5) * 2;
      pointer.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("pointermove", onPointer);

    /* Resize */
    const onResize = () => {
      camera.aspect = W() / H();
      camera.updateProjectionMatrix();
      renderer.setSize(W(), H());
      bloomComposer.setSize(W(), H());
      finalComposer.setSize(W(), H());
    };
    window.addEventListener("resize", onResize);

    const clock = new THREE.Clock();
    let raf = 0;
    const baseZ = 6.2;

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      const s = scrollRef.current;

      /* charge with scroll */
      const pulse = 0.9 + Math.sin(t * (1.6 + s * 3)) * 0.1;
      bodyMat.emissiveIntensity = (0.35 + s * 1.7) * pulse;
      plateMat.opacity = 0.22 + s * 0.4;
      seamMat.opacity = 0.3 + s * 0.55;
      rimMat.uniforms.uPower.value = 2.7 - s * 1.3;
      const hScale = (4.4 + s * 3.2) * pulse;
      halo.scale.set(hScale, hScale, 1);
      bloomPass.strength = 0.7 + s * 1.1;

      /* rotation */
      traveler.rotation.y += 0.0016 * (1 + s * 2);
      seams.rotation.y -= 0.0008;
      plates.rotation.x += 0.0006;

      /* debris orbit — pulls slightly inward on scroll */
      for (const d of debris) {
        d.a += d.spd * (1 + s * 2);
        const rr = d.r * (1 - s * 0.14);
        d.mesh.position.set(
          Math.cos(d.a) * rr,
          Math.sin(d.a) * rr * Math.cos(d.incl),
          Math.sin(d.a) * rr * Math.sin(d.incl)
        );
        d.mesh.rotation.x += d.spin.x;
        d.mesh.rotation.y += d.spin.y;
        d.mesh.rotation.z += d.spin.z;
      }

      /* gentle push-in (no swallow) */
      const zoom = Math.max(0, Math.min(1, (s - 0.12) / 0.88));
      const ez = zoom * zoom * (3 - 2 * zoom);
      camera.position.z = baseZ - ez * (baseZ - 3.7);
      traveler.scale.setScalar(1 + ez * 0.12);

      /* parallax + idle drift */
      const tgtY = pointer.x * 0.3 + t * 0.03;
      const tgtX = pointer.y * 0.2;
      traveler.rotation.y += (tgtY - traveler.rotation.y) * 0.02;
      traveler.rotation.x += (tgtX - traveler.rotation.x) * 0.04;
      points.rotation.z = t * 0.015;
      points.rotation.y = t * 0.01;

      /* render */
      scene.background = null;
      scene.traverse(darken);
      bloomComposer.render();
      scene.traverse(restore);
      scene.background = bg;
      finalComposer.render();
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointer);
      pmrem.dispose();
      envRT.dispose();
      renderer.dispose();
      bloomComposer.dispose();
      finalComposer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, [scrollRef]);

  return <div ref={mountRef} className="absolute inset-0 h-full w-full" />;
}

/* ─────────────────────────────────────────────────────────────────
   HUD ring (corner) — void
─────────────────────────────────────────────────────────────────── */
function HUDReactor({ show }: { show: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.3 }}
      animate={{ opacity: show ? 1 : 0, scale: show ? 1 : 0.3 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className="fixed bottom-6 right-6 z-50 pointer-events-none"
      style={{ width: 64, height: 64 }}
    >
      {[26, 20, 14, 9].map((r, i) => (
        <div key={r} className="absolute inset-0 flex items-center justify-center">
          <div
            style={{
              width: r * 2,
              height: r * 2,
              borderRadius: "50%",
              border: `1px solid rgba(168,85,247,${[0.5, 0.42, 0.36, 0.3][i]})`,
              animation: `hudSpin ${[4, 2.8, 2, 1.4][i]}s linear infinite ${i % 2 ? "reverse" : ""}`,
            }}
          />
        </div>
      ))}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "#e9c6ff",
            boxShadow: "0 0 8px #d946ef, 0 0 18px #a855f7",
          }}
        />
      </div>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   WARP TUNNEL — hyperspace light streaks
─────────────────────────────────────────────────────────────────── */
function WarpTunnel() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const W = () => el.clientWidth;
    const H = () => el.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W(), H());
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x04030a, 0.02);
    const camera = new THREE.PerspectiveCamera(62, W() / H(), 0.1, 200);
    camera.position.set(0, 0, 0);

    const DEPTH = 60;
    const R = 15;
    const COUNT = 280;

    const pos = new Float32Array(COUNT * 2 * 3);
    const col = new Float32Array(COUNT * 2 * 3);
    const z0 = new Float32Array(COUNT);
    const spd = new Float32Array(COUNT);
    const xs = new Float32Array(COUNT);
    const ys = new Float32Array(COUNT);

    const violet = new THREE.Color(0x9b4dff);
    const magenta = new THREE.Color(0xe23bff);
    const hot = new THREE.Color(0xf3d4ff);

    const seed = (i: number, spread: boolean) => {
      const a = Math.random() * Math.PI * 2;
      const r = 0.5 + Math.pow(Math.random(), 0.5) * R;
      xs[i] = Math.cos(a) * r;
      ys[i] = Math.sin(a) * r;
      z0[i] = spread ? -DEPTH + Math.random() * (DEPTH + 8) : -DEPTH - Math.random() * 12;
      spd[i] = 0.35 + Math.random() * 0.5;
      const base = Math.random();
      const c = (base < 0.5 ? violet.clone().lerp(magenta, Math.random()) : magenta.clone().lerp(hot, Math.random() * 0.6));
      // head bright
      col[i * 6] = c.r;
      col[i * 6 + 1] = c.g;
      col[i * 6 + 2] = c.b;
      // tail fades to black (additive)
      col[i * 6 + 3] = c.r * 0.04;
      col[i * 6 + 4] = c.g * 0.04;
      col[i * 6 + 5] = c.b * 0.04;
    };
    for (let i = 0; i < COUNT; i++) seed(i, true);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: true,
    });
    const lines = new THREE.LineSegments(geo, mat);
    scene.add(lines);

    const write = (i: number) => {
      const z = z0[i];
      const stretch = 1.6 + Math.max(0, (z + DEPTH) / DEPTH) * 5.0;
      pos[i * 6] = xs[i];
      pos[i * 6 + 1] = ys[i];
      pos[i * 6 + 2] = z;
      pos[i * 6 + 3] = xs[i];
      pos[i * 6 + 4] = ys[i];
      pos[i * 6 + 5] = z - stretch;
    };
    for (let i = 0; i < COUNT; i++) write(i);

    const pointer = { x: 0, y: 0 };
    const onPointer = (e: PointerEvent) => {
      pointer.x = (e.clientX / window.innerWidth - 0.5) * 2;
      pointer.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("pointermove", onPointer);

    const onResize = () => {
      camera.aspect = W() / H();
      camera.updateProjectionMatrix();
      renderer.setSize(W(), H());
    };
    window.addEventListener("resize", onResize);

    let raf = 0;
    let roll = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      for (let i = 0; i < COUNT; i++) {
        z0[i] += spd[i];
        if (z0[i] > 8) seed(i, false);
        write(i);
      }
      geo.attributes.position.needsUpdate = true;

      roll += 0.0006;
      camera.rotation.z = roll;
      camera.rotation.x += (pointer.y * 0.12 - camera.rotation.x) * 0.04;
      camera.rotation.y += (-pointer.x * 0.12 - camera.rotation.y) * 0.04;

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("resize", onResize);
      geo.dispose();
      mat.dispose();
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className="absolute inset-0 h-full w-full" />;
}

/* ─────────────────────────────────────────────────────────────────
   DATA
─────────────────────────────────────────────────────────────────── */
const SERVICES = [
  { id: "01", title: "Custom App Development", desc: "Web and mobile applications built from scratch — engineered around your exact workflow, never adapted from a template.", tags: ["Web Apps", "Mobile", "Full Stack"] },
  { id: "02", title: "AI Automation", desc: "Replace repetitive work with intelligent systems. We wire AI into your operations so you scale without adding headcount.", tags: ["Workflow", "AI Integration", "Efficiency"] },
  { id: "03", title: "Software MVPs", desc: "Have an idea? We ship a working product fast so you can validate in market before committing to a full build.", tags: ["Prototyping", "Rapid Build", "Validation"] },
  { id: "04", title: "Website Development", desc: "High-performance, visually striking sites built to convert. Purpose-built and crafted — never off the shelf.", tags: ["Design", "Performance", "Conversion"] },
];

const STEPS = [
  { num: "01", title: "Discovery Call", body: "We learn your business, your pain points, and what success actually looks like. No fluff — just the right questions." },
  { num: "02", title: "Scope & Strategy", body: "We map what to build, how long it takes, and what it costs. Clear scope, fixed expectations, no surprises." },
  { num: "03", title: "Build & Iterate", body: "We build in tight sprints and show progress the whole way. You stay in the loop and steer as we go." },
  { num: "04", title: "Launch & Support", body: "We ship, then stick around. Ongoing support, refinement, and scaling as your business grows." },
];

/* ─────────────────────────────────────────────────────────────────
   PAGE
─────────────────────────────────────────────────────────────────── */
export default function Home() {
  const [navScrolled, setNavScrolled] = useState(false);
  const [showHUD, setShowHUD] = useState(false);
  const [active, setActive] = useState<number | null>(null);

  const heroRef = useRef<HTMLElement>(null);
  const scrollRef = useRef(0);

  /* Lenis smooth scroll */
  useEffect(() => {
    let lenis: any;
    let raf = 0;
    let mounted = true;
    import("lenis").then(({ default: Lenis }) => {
      if (!mounted) return;
      lenis = new Lenis({ duration: 1.15, smoothWheel: true, lerp: 0.09 });
      const loop = (time: number) => {
        lenis.raf(time);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      document.documentElement.classList.add("lenis", "lenis-smooth");
    });
    return () => {
      mounted = false;
      cancelAnimationFrame(raf);
      if (lenis) lenis.destroy();
      document.documentElement.classList.remove("lenis", "lenis-smooth");
    };
  }, []);

  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end end"],
  });

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    scrollRef.current = v;
    setNavScrolled(v > 0.02 || window.scrollY > 24);
    setShowHUD(v > 0.97);
  });

  useEffect(() => {
    const fn = () => setNavScrolled(window.scrollY > 24);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const heroOpacity = useTransform(scrollYProgress, [0, 0.32], [1, 0]);
  const heroY = useTransform(scrollYProgress, [0, 0.35], ["0%", "-14%"]);
  const flashOpacity = useTransform(scrollYProgress, [0.84, 0.94, 0.99, 1], [0, 0.55, 0.5, 0]);

  return (
    <main className="relative" style={{ background: "var(--void-0)", color: "var(--ink)" }}>
      {/* ── NAV ── */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          navScrolled ? "glass-soft" : ""
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 md:px-10">
          <Image
            src="/logo.svg"
            alt="A3RO"
            width={96}
            height={30}
            className="h-7 w-auto"
            style={{ filter: "brightness(0) invert(1) drop-shadow(0 0 8px rgba(168,85,247,0.55))" }}
          />
          <div className="hidden gap-9 text-sm font-medium md:flex" style={{ color: "var(--ink-2)" }}>
            {["Services", "Process", "Contact"].map((l) => (
              <a key={l} href={`#${l.toLowerCase()}`} className="transition-colors hover:text-[var(--ink)]">
                {l}
              </a>
            ))}
          </div>
          <a
            href="#contact"
            className="rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110"
            style={{ background: "linear-gradient(135deg,#7c3aed,#d946ef)", boxShadow: "0 8px 22px -8px rgba(168,85,247,0.7)" }}
          >
            Get Started →
          </a>
        </div>
      </nav>

      {/* ── HERO (300vh scroll runway) ── */}
      <section ref={heroRef} style={{ height: "300vh" }}>
        <div className="sticky top-0 h-screen overflow-hidden">
          <TravelerOrb scrollRef={scrollRef} />

          {/* inner vignette frame */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{ boxShadow: "inset 0 0 260px 60px rgba(6,3,16,0.85)" }}
          />

          {/* Hero copy */}
          <motion.div
            style={{ opacity: heroOpacity, y: heroY }}
            className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center"
          >
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="glass pointer-events-auto mb-9 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em]"
              style={{ color: "var(--ink-2)" }}
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: "#d946ef", boxShadow: "0 0 8px #d946ef" }} />
              Tech &amp; Automation Studio — Sydney, AU
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.42, ease: [0.16, 1, 0.3, 1] }}
              className="font-display font-black leading-[0.9] tracking-tighter"
              style={{ fontSize: "clamp(3.2rem,10vw,8rem)", color: "var(--ink)", textShadow: "0 0 60px rgba(168,85,247,0.35)" }}
            >
              Built{" "}
              <span className="font-serif-italic font-normal" style={{ color: "#e879f9" }}>
                Different
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.6 }}
              className="mx-auto mb-11 mt-7 max-w-xl text-lg leading-relaxed md:text-xl"
              style={{ color: "var(--ink-2)" }}
            >
              We build custom software, automate what slows you down, and ship products
              engineered to be sharp, fast, and built to last.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.74 }}
              className="pointer-events-auto flex flex-col justify-center gap-4 sm:flex-row"
            >
              <a
                href="#contact"
                className="rounded-full px-8 py-4 text-sm font-bold uppercase tracking-widest text-white transition-all hover:brightness-110"
                style={{ background: "linear-gradient(135deg,#7c3aed,#d946ef)", boxShadow: "0 12px 34px -10px rgba(168,85,247,0.75)" }}
              >
                Start a Project
              </a>
              <a
                href="#services"
                className="glass rounded-full px-8 py-4 text-sm font-semibold uppercase tracking-widest transition-all"
                style={{ color: "var(--ink)" }}
              >
                What We Do ↓
              </a>
            </motion.div>
          </motion.div>

          {/* void charge flash on approach */}
          <motion.div
            className="pointer-events-none absolute inset-0 z-20"
            style={{ opacity: flashOpacity, background: "radial-gradient(circle at 50% 50%, rgba(233,196,255,0.9) 0%, rgba(168,85,247,0.55) 45%, rgba(8,4,18,0) 80%)" }}
          />

          {/* scroll hint */}
          <div
            className="pointer-events-none absolute bottom-9 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-3"
            style={{ color: "var(--ink-3)" }}
          >
            <span className="text-[10px] font-medium uppercase tracking-[0.3em]">Scroll</span>
            <motion.div
              className="h-10 w-px"
              animate={{ opacity: [0.25, 1, 0.25] }}
              transition={{ duration: 2, repeat: Infinity }}
              style={{ background: "linear-gradient(to bottom, #a855f7, transparent)" }}
            />
          </div>
        </div>
      </section>

      <HUDReactor show={showHUD} />

      {/* content surface */}
      <div
        className="relative z-10"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(124,58,237,0.16), transparent 60%), radial-gradient(ellipse 55% 40% at 82% 22%, rgba(217,70,239,0.10), transparent 60%), linear-gradient(180deg,#07040f 0%, #0a0714 30%, #08040f 100%)",
        }}
      >
        {/* ── MARQUEE ── */}
        <div className="overflow-hidden border-y py-4" style={{ borderColor: "rgba(168,85,247,0.16)", background: "rgba(12,7,24,0.5)" }}>
          <div className="flex gap-10 whitespace-nowrap" style={{ animation: "marquee 24s linear infinite" }}>
            {Array(2)
              .fill(["Custom Apps", "AI Automation", "Software MVPs", "Website Dev", "Rapid Prototyping", "AI Integration", "Full Stack Builds"])
              .flat()
              .map((item, i) => (
                <span key={i} className="text-xs font-semibold uppercase tracking-[0.24em]" style={{ color: "var(--ink-2)" }}>
                  {item}
                  <span className="mx-5" style={{ color: "#d946ef" }}>
                    ✦
                  </span>
                </span>
              ))}
          </div>
        </div>

        {/* ── ABOUT ── */}
        <section className="mx-auto max-w-7xl px-6 py-32 md:px-10">
          <Reveal>
            <p className="mb-10 text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: "#c084fc" }}>
              Our Studio
            </p>
          </Reveal>
          <div className="grid items-start gap-16 md:grid-cols-2">
            <Reveal>
              <h2 className="font-display text-4xl font-black leading-tight tracking-tighter md:text-5xl">
                We make technology work for your business —{" "}
                <span className="font-serif-italic font-normal" style={{ color: "#e879f9" }}>
                  not the other way around.
                </span>
              </h2>
            </Reveal>
            <Reveal delay={0.15}>
              <div className="space-y-5 text-lg leading-relaxed" style={{ color: "var(--ink-2)" }}>
                <p>A3RO is a Sydney-based tech &amp; automation studio. We build custom software, integrate AI, and craft digital tools that give businesses a genuine edge.</p>
                <p>No bloated agencies. No cookie-cutter solutions. Focused, intelligent builds that solve your actual problems — and look the part.</p>
                <a href="#contact" className="inline-flex items-center gap-2 text-base font-semibold transition-colors" style={{ color: "#c084fc" }}>
                  Work with us →
                </a>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── SERVICES ── */}
        <section id="services" className="mx-auto max-w-7xl px-6 py-32 md:px-10">
          <Reveal>
            <div className="mb-16 flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="mb-4 text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: "#c084fc" }}>
                  Services
                </p>
                <h2 className="font-display text-4xl font-black tracking-tighter md:text-5xl">What we build.</h2>
              </div>
              <a
                href="#contact"
                className="whitespace-nowrap rounded-full px-6 py-3 text-sm font-semibold text-white transition-all hover:brightness-110"
                style={{ background: "linear-gradient(135deg,#7c3aed,#d946ef)", boxShadow: "0 10px 26px -10px rgba(168,85,247,0.7)" }}
              >
                Start a Project →
              </a>
            </div>
          </Reveal>
          <div className="grid gap-4 md:grid-cols-2">
            {SERVICES.map((s, i) => (
              <Reveal key={s.id} delay={i * 0.08}>
                <motion.div
                  onHoverStart={() => setActive(i)}
                  onHoverEnd={() => setActive(null)}
                  animate={{ y: active === i ? -4 : 0 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="glass h-full rounded-3xl p-8"
                  style={{ boxShadow: active === i ? "0 28px 60px -18px rgba(168,85,247,0.5)" : undefined }}
                >
                  <div className="mb-6 flex items-start justify-between">
                    <span className="font-mono text-xs" style={{ color: active === i ? "#e879f9" : "var(--ink-3)" }}>
                      {s.id}
                    </span>
                    <motion.span animate={{ x: active === i ? 3 : 0, y: active === i ? -3 : 0 }} style={{ color: "#d946ef" }}>
                      →
                    </motion.span>
                  </div>
                  <h3 className="mb-4 font-display text-xl font-black tracking-tight">{s.title}</h3>
                  <p className="mb-6 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                    {s.desc}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {s.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-full px-3 py-1 text-xs font-medium"
                        style={{ border: "1px solid rgba(168,85,247,0.3)", color: "#d8b4fe", background: "rgba(168,85,247,0.1)" }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </motion.div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── PROCESS ── */}
        <section id="process" className="mx-auto max-w-7xl px-6 py-32 md:px-10">
          <Reveal>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: "#c084fc" }}>
              Process
            </p>
            <h2 className="mb-20 font-display text-4xl font-black leading-tight tracking-tighter md:text-5xl">
              Simple process.{" "}
              <span className="font-serif-italic font-normal" style={{ color: "#e879f9" }}>
                Serious results.
              </span>
            </h2>
          </Reveal>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <Reveal key={step.num} delay={i * 0.1}>
                <div className="glass h-full rounded-3xl p-8">
                  <span className="mb-6 block font-mono text-xs font-bold" style={{ color: "#d946ef" }}>
                    {step.num}
                  </span>
                  <h3 className="mb-4 font-display text-lg font-black tracking-tight">{step.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                    {step.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── CTA ── */}
        <section id="contact" className="relative overflow-hidden px-6 py-40 text-center md:px-10">
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[720px] -translate-x-1/2 -translate-y-1/2"
            style={{ background: "radial-gradient(ellipse, rgba(168,85,247,0.22) 0%, transparent 70%)", filter: "blur(50px)" }}
          />
          <div className="relative z-10 mx-auto max-w-4xl">
            <Reveal>
              <p className="mb-8 text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: "#c084fc" }}>
                Let&apos;s Build
              </p>
              <h2 className="mb-8 font-display font-black leading-[0.92] tracking-tighter" style={{ fontSize: "clamp(2.4rem,7vw,5.5rem)" }}>
                Ready to automate{" "}
                <span className="font-serif-italic font-normal" style={{ color: "#e879f9" }}>
                  everything?
                </span>
              </h2>
              <p className="mx-auto mb-12 max-w-xl text-lg leading-relaxed" style={{ color: "var(--ink-2)" }}>
                Tell us what you need. We&apos;ll tell you how to build it, how long it takes, and exactly what it costs.
              </p>
              <a
                href="mailto:hello@a3ro.com.au"
                className="inline-block rounded-full px-12 py-5 text-sm font-black uppercase tracking-widest text-white transition-all hover:brightness-110"
                style={{ background: "linear-gradient(135deg,#7c3aed,#d946ef)", boxShadow: "0 18px 44px -12px rgba(168,85,247,0.8)" }}
              >
                hello@a3ro.com.au
              </a>
            </Reveal>
          </div>
        </section>

        {/* ── WARP — hyperspace descent ── */}
        <section className="relative overflow-hidden" style={{ height: "100vh", background: "#04030a" }}>
          <WarpTunnel />

          {/* center convergence glow */}
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-[380px] w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: "radial-gradient(circle, rgba(217,70,239,0.28) 0%, transparent 65%)", filter: "blur(30px)" }}
          />

          {/* top / bottom blend */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-40" style={{ background: "linear-gradient(to bottom, #08040f, transparent)" }} />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-40" style={{ background: "linear-gradient(to top, #08040f, transparent)" }} />

          {/* centered tagline */}
          <div className="absolute inset-0 z-30 flex items-center justify-center px-6">
            <Reveal className="glass max-w-2xl rounded-3xl px-10 py-12 text-center">
              <p className="mb-5 text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: "#c084fc" }}>
                The A3RO Way
              </p>
              <h2 className="mb-5 font-display text-4xl font-black leading-[0.95] tracking-tighter md:text-6xl">
                Always in{" "}
                <span className="font-serif-italic font-normal" style={{ color: "#e879f9" }}>
                  motion.
                </span>
              </h2>
              <p className="mx-auto max-w-md text-base leading-relaxed md:text-lg" style={{ color: "var(--ink-2)" }}>
                Continuous building, automation, and momentum — engineered to never stand still.
              </p>
            </Reveal>
          </div>
        </section>

        {/* ── FOOTER ── */}
        <footer className="border-t px-6 py-14 md:px-10" style={{ borderColor: "rgba(168,85,247,0.16)", background: "#06040d" }}>
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-10 md:flex-row md:items-center">
            <div>
              <Image
                src="/logo.svg"
                alt="A3RO"
                width={88}
                height={28}
                className="mb-3 h-6 w-auto"
                style={{ filter: "brightness(0) invert(1) drop-shadow(0 0 8px rgba(168,85,247,0.5))" }}
              />
              <p className="text-sm" style={{ color: "var(--ink-3)" }}>
                Tech &amp; Automation Studio — Sydney, AU
              </p>
            </div>
            <div className="flex gap-14 text-sm">
              <div className="space-y-3">
                <p className="mb-4 text-xs font-semibold uppercase tracking-widest" style={{ color: "#c084fc" }}>
                  Discover
                </p>
                {["Services", "Process", "Contact"].map((l) => (
                  <a key={l} href={`#${l.toLowerCase()}`} className="block transition-colors hover:text-[var(--ink)]" style={{ color: "var(--ink-2)" }}>
                    {l}
                  </a>
                ))}
              </div>
              <div className="space-y-3">
                <p className="mb-4 text-xs font-semibold uppercase tracking-widest" style={{ color: "#c084fc" }}>
                  Connect
                </p>
                {[
                  { l: "LinkedIn", h: "#" },
                  { l: "Instagram", h: "#" },
                  { l: "Email", h: "mailto:hello@a3ro.com.au" },
                ].map(({ l, h }) => (
                         <a key={l} href={h} className="block transition-colors hover:text-[var(--ink)]" style={{ color: "var(--ink-2)" }}>
                    {l}
                  </a>
                ))}
              </div>
            </div>
          </div>
          <div
            className="mx-auto mt-10 flex max-w-7xl flex-col items-center justify-between gap-4 border-t pt-8 text-xs md:flex-row"
            style={{ borderColor: "rgba(168,85,247,0.14)", color: "var(--ink-3)" }}
          >
            <span>© {new Date().getFullYear()} A3RO. All rights reserved.</span>
            <span>a3ro.com.au</span>
          </div>
        </footer>
      </div>
    </main>
  );
}
