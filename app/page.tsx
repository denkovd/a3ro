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

/* ─────────────────────────────────────────────────────────────────
   GLASS ARC REACTOR  — photorealistic, scroll-driven, selective bloom
─────────────────────────────────────────────────────────────────── */
const BLOOM_LAYER = 1;

function GlassReactor({ scrollRef }: { scrollRef: React.MutableRefObject<number> }) {
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
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);

    /* Scene + camera */
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, W() / H(), 0.1, 100);
    camera.position.set(0, 0, 5.4);

    /* Icy radial background (glass refracts this) */
    const bg = radialTexture(
      [
        [0, "#f6faff"],
        [0.42, "#e7f0fc"],
        [0.78, "#cfe0f4"],
        [1, "#b7cdec"],
      ],
      512
    );
    scene.background = bg;

    /* Environment for reflections / transmission */
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;

    /* Lights */
    const hemi = new THREE.HemisphereLight(0xeaf3ff, 0x9fb4d6, 0.55);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(3, 4, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x6fa8ff, 1.8);
    rim.position.set(-4, -1, -4);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0xbfe0ff, 0.9);
    fill.position.set(0, -3, 2);
    scene.add(fill);

    /* Master group */
    const reactor = new THREE.Group();
    scene.add(reactor);

    /* Glass material factory */
    const glass = (color: number, o: Partial<THREE.MeshPhysicalMaterialParameters> = {}) =>
      new THREE.MeshPhysicalMaterial({
        color,
        metalness: 0,
        roughness: 0.05,
        transmission: 1,
        thickness: 0.9,
        ior: 1.46,
        attenuationColor: new THREE.Color(0x8fb6ff),
        attenuationDistance: 2.4,
        clearcoat: 1,
        clearcoatRoughness: 0.06,
        iridescence: 0.55,
        iridescenceIOR: 1.32,
        envMapIntensity: 1.5,
        specularIntensity: 1,
        transparent: true,
        ...o,
      });

    /* Concentric glass rings */
    const ringDefs = [
      { r: 0.62, t: 0.10, col: 0xf2f7ff, rough: 0.05, sx: 0.0, sz: 0.0, spd: 0.010 },
      { r: 0.95, t: 0.045, col: 0xdfeaff, rough: 0.08, sx: 0.9, sz: 0.3, spd: -0.014 },
      { r: 1.32, t: 0.035, col: 0xcfe0ff, rough: 0.10, sx: -0.6, sz: 0.7, spd: 0.009 },
      { r: 1.78, t: 0.026, col: 0xc2d7ff, rough: 0.12, sx: 0.25, sz: -0.5, spd: -0.007 },
      { r: 2.3, t: 0.018, col: 0xb6ccff, rough: 0.16, sx: 0.1, sz: 1.0, spd: 0.005 },
    ];
    const rings = ringDefs.map((d) => {
      const geo = new THREE.TorusGeometry(d.r, d.t, 28, 160);
      const m = new THREE.Mesh(geo, glass(d.col, { roughness: d.rough, thickness: d.t * 6 }));
      m.rotation.x = d.sx;
      m.rotation.z = d.sz;
      reactor.add(m);
      return m;
    });

    /* Coil ring — frosted chrome segments around the hub */
    const coilMat = new THREE.MeshPhysicalMaterial({
      color: 0xdbe8fb,
      metalness: 0.85,
      roughness: 0.28,
      clearcoat: 0.6,
      envMapIntensity: 1.6,
    });
    const coilGroup = new THREE.Group();
    const COILS = 9;
    for (let i = 0; i < COILS; i++) {
      const a = (i / COILS) * Math.PI * 2;
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.34, 20, 1, false), coilMat);
      c.position.set(Math.cos(a) * 0.66, Math.sin(a) * 0.66, 0);
      c.rotation.z = a + Math.PI / 2;
      coilGroup.add(c);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 16), coilMat);
      cap.position.copy(c.position);
      coilGroup.add(cap);
    }
    reactor.add(coilGroup);

    /* Hub triangle plate (frosted glass) */
    const hub = new THREE.Mesh(
      new THREE.TorusGeometry(0.46, 0.06, 24, 90),
      glass(0xeaf2ff, { roughness: 0.12, thickness: 0.5 })
    );
    reactor.add(hub);

    /* Glass shell around the core */
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 48, 48),
      glass(0xeef5ff, { roughness: 0.02, thickness: 0.6, transmission: 1, attenuationDistance: 1.6 })
    );
    reactor.add(shell);

    /* GLOWING CORE — blooms */
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: new THREE.Color(0xbcd8ff),
      emissiveIntensity: 4,
      roughness: 0.25,
      metalness: 0,
    });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.27, 40, 40), coreMat);
    core.layers.enable(BLOOM_LAYER);
    reactor.add(core);

    /* Core glow sprite — blooms */
    const glowMat = new THREE.SpriteMaterial({
      map: radialTexture([
        [0, "rgba(255,255,255,1)"],
        [0.35, "rgba(190,216,255,0.85)"],
        [1, "rgba(120,160,255,0)"],
      ]),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.95,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.set(2.4, 2.4, 1);
    glow.layers.enable(BLOOM_LAYER);
    reactor.add(glow);

    /* Ice dust particles */
    const pN = 420;
    const pPos = new Float32Array(pN * 3);
    for (let i = 0; i < pN; i++) {
      const r = 1.2 + Math.random() * 4;
      const a = Math.random() * Math.PI * 2;
      const z = (Math.random() - 0.5) * 4;
      pPos[i * 3] = Math.cos(a) * r;
      pPos[i * 3 + 1] = Math.sin(a) * r;
      pPos[i * 3 + 2] = z;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
    const points = new THREE.Points(
      pGeo,
      new THREE.PointsMaterial({
        color: 0x9fc2ff,
        size: 0.022,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    reactor.add(points);

    /* ── Post-processing: selective bloom ── */
    const renderScene = new RenderPass(scene, camera);

    const bloomPass = new UnrealBloomPass(new THREE.Vector2(W(), H()), 0.85, 0.62, 0.0);
    bloomPass.threshold = 0;
    bloomPass.strength = 0.85;
    bloomPass.radius = 0.65;

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

    /* darken helpers for bloom pass */
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
    const baseZ = 5.4;

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      const s = scrollRef.current;
      const speed = 1 + s * 5;

      rings.forEach((m, i) => {
        m.rotation.y += ringDefs[i].spd * speed;
        m.rotation.x += ringDefs[i].spd * 0.18 * speed;
      });
      coilGroup.rotation.z -= 0.004 * speed;
      hub.rotation.z += 0.002 * speed;

      /* core pulse + charge with scroll */
      const pulse = 0.9 + Math.sin(t * (2 + s * 4)) * 0.1;
      coreMat.emissiveIntensity = (4 + s * 10) * pulse;
      const gScale = (2.2 + s * 1.6) * pulse;
      glow.scale.set(gScale, gScale, 1);
      bloomPass.strength = 0.8 + s * 1.3;

      /* swallow dive */
      const zoom = Math.max(0, Math.min(1, (s - 0.55) / 0.45));
      camera.position.z = baseZ - zoom * (baseZ - 0.25);
      reactor.scale.setScalar(1 + zoom * 0.35);

      /* parallax + idle drift */
      const tgtY = pointer.x * 0.35 + t * 0.04;
      const tgtX = pointer.y * 0.22;
      reactor.rotation.y += (tgtY - reactor.rotation.y) * 0.04;
      reactor.rotation.x += (tgtX - reactor.rotation.x) * 0.04;

      points.rotation.z = t * 0.02;

      /* render: bloom pass (darkened) then final composite */
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
   HUD reactor (corner) — icy
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
              border: `1px solid rgba(47,107,255,${[0.45, 0.4, 0.35, 0.3][i]})`,
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
            background: "#cfe3ff",
            boxShadow: "0 0 8px #5b8dff, 0 0 18px #2f6bff",
          }}
        />
      </div>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   DATA
─────────────────────────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────────────────────
   VERTIGO STREAM — endless downward descent of icy glass
─────────────────────────────────────────────────────────────────── */
function VertigoStream() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const W = () => el.clientWidth;
    const H = () => el.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W(), H());
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, W() / H(), 0.1, 100);
    camera.position.set(0, 0, 7);

    const bg = radialTexture(
      [
        [0, "#eef5fe"],
        [0.5, "#d3e2f6"],
        [1, "#a9c5ea"],
      ],
      512
    );
    scene.background = bg;

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x9fb4d6, 0.6);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(2, 3, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x6fa8ff, 1.4);
    rim.position.set(-3, -2, -3);
    scene.add(rim);

    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xe9f2ff,
      metalness: 0,
      roughness: 0.08,
      transmission: 1,
      thickness: 0.8,
      ior: 1.45,
      attenuationColor: new THREE.Color(0x8fb6ff),
      attenuationDistance: 2.2,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      iridescence: 0.5,
      iridescenceIOR: 1.3,
      envMapIntensity: 1.5,
      transparent: true,
    });

    const yTop = 7.5;
    const yBottom = -7.5;
    const span = yTop - yBottom;

    type Item = { mesh: THREE.Mesh; speed: number; rx: number; ry: number; rz: number };
    const items: Item[] = [];
    const COUNT = 15;

    const randomGeo = () => {
      const k = Math.random();
      const size = 0.4 + Math.random() * 0.85;
      if (k < 0.6) return new THREE.TorusGeometry(size, size * 0.24, 20, 90);
      if (k < 0.85) return new THREE.OctahedronGeometry(size * 0.95, 0);
      return new THREE.IcosahedronGeometry(size * 0.9, 0);
    };

    for (let i = 0; i < COUNT; i++) {
      const m = new THREE.Mesh(randomGeo(), mat);
      const depth = -3 + Math.random() * 5;
      m.position.set((Math.random() - 0.5) * 9, yBottom + Math.random() * span, depth);
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      scene.add(m);
      const depthFactor = (depth + 3) / 5; // 0 far .. 1 near
      const speed = 0.018 + Math.random() * 0.022 + depthFactor * 0.025;
      items.push({
        mesh: m,
        speed,
        rx: (Math.random() - 0.5) * 0.012,
        ry: (Math.random() - 0.5) * 0.012,
        rz: (Math.random() - 0.5) * 0.012,
      });
    }

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
    const animate = () => {
      raf = requestAnimationFrame(animate);
      for (const it of items) {
        it.mesh.position.y -= it.speed;
        it.mesh.rotation.x += it.rx;
        it.mesh.rotation.y += it.ry;
        it.mesh.rotation.z += it.rz;
        if (it.mesh.position.y < yBottom - 1.2) {
          it.mesh.position.y = yTop + Math.random() * 2.5;
          it.mesh.position.x = (Math.random() - 0.5) * 9;
          it.mesh.position.z = -3 + Math.random() * 5;
        }
      }
      camera.position.x += (pointer.x * 0.7 - camera.position.x) * 0.04;
      camera.position.y += (-pointer.y * 0.45 - camera.position.y) * 0.04;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("resize", onResize);
      pmrem.dispose();
      envRT.dispose();
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className="absolute inset-0 h-full w-full" />;
}

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
  const flashOpacity = useTransform(scrollYProgress, [0.82, 0.93, 0.99, 1], [0, 1, 1, 0]);

  return (
    <main className="relative" style={{ background: "var(--ice-1)", color: "var(--ink)" }}>
      {/* ── NAV ── */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          navScrolled ? "glass-soft" : ""
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 md:px-10">
          <Image src="/logo.svg" alt="A3RO" width={96} height={30} className="h-7 w-auto" style={{ filter: "brightness(0)" }} />
          <div className="hidden gap-9 text-sm font-medium md:flex" style={{ color: "var(--ink-3)" }}>
            {["Services", "Process", "Contact"].map((l) => (
              <a key={l} href={`#${l.toLowerCase()}`} className="transition-colors hover:text-[var(--ink)]">
                {l}
              </a>
            ))}
          </div>
          <a
            href="#contact"
            className="rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110"
            style={{ background: "linear-gradient(135deg,#2f6bff,#5b8dff)", boxShadow: "0 8px 20px -8px rgba(47,107,255,0.6)" }}
          >
            Get Started →
          </a>
        </div>
      </nav>

      {/* ── HERO (300vh scroll runway) ── */}
      <section ref={heroRef} style={{ height: "300vh" }}>
        <div className="sticky top-0 h-screen overflow-hidden">
          <GlassReactor scrollRef={scrollRef} />

          {/* soft frame vignette */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{ boxShadow: "inset 0 0 220px 40px rgba(150,180,225,0.35)" }}
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
              <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: "#2f6bff" }} />
              Tech &amp; Automation Studio — Sydney, AU
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.42, ease: [0.16, 1, 0.3, 1] }}
              className="font-display font-black leading-[0.9] tracking-tighter"
              style={{ fontSize: "clamp(3.2rem,10vw,8rem)", color: "var(--ink)" }}
            >
              Built{" "}
              <span className="font-serif-italic font-normal" style={{ color: "#2f6bff" }}>
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
              engineered like ice — clear, sharp, and built to last.
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
                style={{ background: "linear-gradient(135deg,#2f6bff,#5b8dff)", boxShadow: "0 12px 30px -10px rgba(47,107,255,0.65)" }}
              >
                Start a Project
              </a>
              <a
                href="#services"
                className="glass rounded-full px-8 py-4 text-sm font-semibold uppercase tracking-widest transition-all"
                style={{ color: "var(--ink-2)" }}
              >
                What We Do ↓
              </a>
            </motion.div>
          </motion.div>

          {/* white flash on swallow */}
          <motion.div
            className="pointer-events-none absolute inset-0 z-20"
            style={{ opacity: flashOpacity, background: "radial-gradient(circle at 50% 50%, #ffffff 0%, #eaf2ff 55%, #dbe7f7 100%)" }}
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
              style={{ background: "linear-gradient(to bottom, #2f6bff, transparent)" }}
            />
          </div>
        </div>
      </section>

      <HUDReactor show={showHUD} />

      {/* content surface */}
      <div className="relative z-10" style={{ background: "linear-gradient(180deg,#eaf2ff 0%, #f4f8fe 26%, #eef4fc 100%)" }}>
        {/* ── MARQUEE ── */}
        <div className="overflow-hidden border-y py-4" style={{ borderColor: "rgba(47,107,255,0.14)", background: "rgba(255,255,255,0.4)" }}>
          <div className="flex gap-10 whitespace-nowrap" style={{ animation: "marquee 24s linear infinite" }}>
            {Array(2)
              .fill(["Custom Apps", "AI Automation", "Software MVPs", "Website Dev", "Rapid Prototyping", "AI Integration", "Full Stack Builds"])
              .flat()
              .map((item, i) => (
                <span key={i} className="text-xs font-semibold uppercase tracking-[0.24em]" style={{ color: "var(--ink-3)" }}>
                  {item}
                  <span className="mx-5" style={{ color: "#2f6bff" }}>
                    ✦
                  </span>
                </span>
              ))}
          </div>
        </div>

        {/* ── ABOUT ── */}
        <section className="mx-auto max-w-7xl px-6 py-32 md:px-10">
          <Reveal>
            <p className="mb-10 text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: "#2f6bff" }}>
              Our Studio
            </p>
          </Reveal>
          <div className="grid items-start gap-16 md:grid-cols-2">
            <Reveal>
              <h2 className="font-display text-4xl font-black leading-tight tracking-tighter md:text-5xl">
                We make technology work for your business —{" "}
                <span className="font-serif-italic font-normal" style={{ color: "#2f6bff" }}>
                  not the other way around.
                </span>
              </h2>
            </Reveal>
            <Reveal delay={0.15}>
              <div className="space-y-5 text-lg leading-relaxed" style={{ color: "var(--ink-2)" }}>
                <p>A3RO is a Sydney-based tech &amp; automation studio. We build custom software, integrate AI, and craft digital tools that give businesses a genuine edge.</p>
                <p>No bloated agencies. No cookie-cutter solutions. Focused, intelligent builds that solve your actual problems — and look the part.</p>
                <a href="#contact" className="inline-flex items-center gap-2 text-base font-semibold transition-colors" style={{ color: "#2f6bff" }}>
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
                <p className="mb-4 text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: "#2f6bff" }}>
                  Services
                </p>
                <h2 className="font-display text-4xl font-black tracking-tighter md:text-5xl">What we build.</h2>
              </div>
              <a
                href="#contact"
                className="whitespace-nowrap rounded-full px-6 py-3 text-sm font-semibold text-white transition-all hover:brightness-110"
                style={{ background: "linear-gradient(135deg,#2f6bff,#5b8dff)", boxShadow: "0 10px 24px -10px rgba(47,107,255,0.6)" }}
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
                  style={{ boxShadow: active === i ? "0 24px 50px -18px rgba(47,107,255,0.4)" : undefined }}
                >
                  <div className="mb-6 flex items-start justify-between">
                    <span className="font-mono text-xs" style={{ color: active === i ? "#2f6bff" : "var(--ink-3)" }}>
                      {s.id}
                    </span>
                    <motion.span animate={{ x: active === i ? 3 : 0, y: active === i ? -3 : 0 }} style={{ color: "#2f6bff" }}>
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
                        style={{ border: "1px solid rgba(47,107,255,0.25)", color: "#2f6bff", background: "rgba(47,107,255,0.06)" }}
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
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: "#2f6bff" }}>
              Process
            </p>
            <h2 className="mb-20 font-display text-4xl font-black leading-tight tracking-tighter md:text-5xl">
              Simple process.{" "}
              <span className="font-serif-italic font-normal" style={{ color: "#2f6bff" }}>
                Serious results.
              </span>
            </h2>
          </Reveal>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <Reveal key={step.num} delay={i * 0.1}>
                <div className="glass h-full rounded-3xl p-8">
                  <span className="mb-6 block font-mono text-xs font-bold" style={{ color: "#2f6bff" }}>
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
            style={{ background: "radial-gradient(ellipse, rgba(47,107,255,0.16) 0%, transparent 70%)", filter: "blur(50px)" }}
          />
          <div className="relative z-10 mx-auto max-w-4xl">
            <Reveal>
              <p className="mb-8 text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: "#2f6bff" }}>
                Let&apos;s Build
              </p>
              <h2 className="mb-8 font-display font-black leading-[0.92] tracking-tighter" style={{ fontSize: "clamp(2.4rem,7vw,5.5rem)" }}>
                Ready to automate{" "}
                <span className="font-serif-italic font-normal" style={{ color: "#2f6bff" }}>
                  everything?
                </span>
              </h2>
              <p className="mx-auto mb-12 max-w-xl text-lg leading-relaxed" style={{ color: "var(--ink-2)" }}>
                Tell us what you need. We&apos;ll tell you how to build it, how long it takes, and exactly what it costs.
              </p>
              <a
                href="mailto:hello@a3ro.com.au"
                className="inline-block rounded-full px-12 py-5 text-sm font-black uppercase tracking-widest text-white transition-all hover:brightness-110"
                style={{ background: "linear-gradient(135deg,#2f6bff,#5b8dff)", boxShadow: "0 18px 40px -12px rgba(47,107,255,0.7)" }}
              >
                hello@a3ro.com.au
              </a>
            </Reveal>
          </div>
        </section>

        {/* ── VERTIGO — endless descent ── */}
        <section className="relative overflow-hidden" style={{ height: "100vh" }}>
          <VertigoStream />

          {/* downward outline-text walls */}
          <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-between overflow-hidden px-2 md:px-6" style={{ opacity: 0.16 }}>
            <div className="flex flex-col" style={{ animation: "marqueeDown 20s linear infinite" }}>
              {Array(10).fill("A3RO").map((t, i) => (
                <span key={i} className="font-display font-black leading-[0.82]" style={{ fontSize: "13vw", WebkitTextStroke: "1.5px #2f6bff", color: "transparent" }}>
                  {t}
                </span>
              ))}
            </div>
            <div className="flex flex-col text-right" style={{ animation: "marqueeDown 30s linear infinite" }}>
              {Array(10).fill("BUILT").map((t, i) => (
                <span key={i} className="font-display font-black leading-[0.82]" style={{ fontSize: "13vw", WebkitTextStroke: "1.5px #5b8dff", color: "transparent" }}>
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* top / bottom blend */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-40" style={{ background: "linear-gradient(to bottom, #eef4fc, transparent)" }} />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-40" style={{ background: "linear-gradient(to top, #eef4fc, transparent)" }} />

          {/* centered tagline */}
          <div className="absolute inset-0 z-30 flex items-center justify-center px-6">
            <Reveal className="glass max-w-2xl rounded-3xl px-10 py-12 text-center">
              <p className="mb-5 text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: "#2f6bff" }}>
                The A3RO Way
              </p>
              <h2 className="mb-5 font-display text-4xl font-black leading-[0.95] tracking-tighter md:text-6xl">
                Always in{" "}
                <span className="font-serif-italic font-normal" style={{ color: "#2f6bff" }}>
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
        <footer className="border-t px-6 py-14 md:px-10" style={{ borderColor: "rgba(47,107,255,0.14)" }}>
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-10 md:flex-row md:items-center">
            <div>
              <Image src="/logo.svg" alt="A3RO" width={88} height={28} className="mb-3 h-6 w-auto" style={{ filter: "brightness(0)" }} />
              <p className="text-sm" style={{ color: "var(--ink-3)" }}>
                Tech &amp; Automation Studio — Sydney, AU
              </p>
            </div>
            <div className="flex gap-14 text-sm">
              <div className="space-y-3">
                <p className="mb-4 text-xs font-semibold uppercase tracking-widest" style={{ color: "#2f6bff" }}>
                  Discover
                </p>
                {["Services", "Process", "Contact"].map((l) => (
                  <a key={l} href={`#${l.toLowerCase()}`} className="block transition-colors hover:text-[var(--ink)]" style={{ color: "var(--ink-2)" }}>
                    {l}
                  </a>
                ))}
              </div>
              <div className="space-y-3">
                <p className="mb-4 text-xs font-semibold uppercase tracking-widest" style={{ color: "#2f6bff" }}>
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
            style={{ borderColor: "rgba(47,107,255,0.12)", color: "var(--ink-3)" }}
          >
            <span>© {new Date().getFullYear()} A3RO. All rights reserved.</span>
            <span>a3ro.com.au</span>
          </div>
        </footer>
      </div>
    </main>
  );
}
