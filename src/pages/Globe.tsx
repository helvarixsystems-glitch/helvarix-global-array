import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

declare global {
  interface Window {
    THREE?: any;
  }
}

type RawProfile = {
  id: string;
  lat: number | null;
  lon: number | null;
  is_online?: boolean | null;
  last_seen_at?: string | null;
};

type SafeNode = {
  id: string;
  lat: number;
  lon: number;
  active: boolean;
  isCurrentUser: boolean;
};

type FocusNode = {
  lat: number;
  lon: number;
} | null;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function hashString(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function seededOffset(seed: string, scale: number) {
  const hash = hashString(seed);
  const normalized = (hash % 1000) / 1000;
  return (normalized - 0.5) * 2 * scale;
}

function obfuscateNodeLocation(lat: number, lon: number, seed: string) {
  const latBucket = 2.5;
  const lonBucket = 2.5;

  const roundedLat = Math.round(lat / latBucket) * latBucket;
  const roundedLon = Math.round(lon / lonBucket) * lonBucket;

  const safeLat = clamp(roundedLat + seededOffset(`${seed}-lat`, 0.8), -72, 72);
  const safeLon = roundedLon + seededOffset(`${seed}-lon`, 0.8);

  return { lat: safeLat, lon: safeLon };
}

function isActiveNow(row: RawProfile) {
  if (row.is_online === true) return true;
  if (!row.last_seen_at) return false;

  const lastSeen = new Date(row.last_seen_at).getTime();
  if (Number.isNaN(lastSeen)) return false;

  return Date.now() - lastSeen <= 5 * 60 * 1000;
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;

    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }

      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;

    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };

    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

function latLonToVector3(THREE: any, lat: number, lon: number, radius: number) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;

  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);

  return new THREE.Vector3(x, y, z);
}

function createEarthTextureDataUrl() {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="2048" height="1024" viewBox="0 0 2048 1024">
    <defs>
      <linearGradient id="ocean" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#163e79"/>
        <stop offset="45%" stop-color="#0f2f5f"/>
        <stop offset="100%" stop-color="#0a2347"/>
      </linearGradient>
      <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="1.4"/>
      </filter>
    </defs>

    <rect width="2048" height="1024" fill="url(#ocean)"/>

    <!-- subtle ocean shading -->
    <ellipse cx="1050" cy="420" rx="620" ry="290" fill="#2d69b9" opacity="0.10"/>
    <ellipse cx="1450" cy="540" rx="460" ry="240" fill="#6d55ff" opacity="0.05"/>

    <!-- land masses -->
    <g fill="#1f5d56" opacity="0.98">
      <!-- North America -->
      <path d="M185 185
               L260 145 L360 125 L470 135 L565 170 L625 228 L660 292
               L648 345 L598 385 L540 420 L486 450 L438 498 L386 530
               L315 525 L248 485 L206 425 L170 345 L165 260 Z"/>

      <!-- Greenland -->
      <path d="M560 78
               L622 64 L700 78 L748 114 L728 160 L660 176 L592 154 L548 118 Z"/>

      <!-- South America -->
      <path d="M485 560
               L532 598 L570 665 L580 750 L558 838 L520 918
               L472 968 L430 948 L404 885 L402 795 L425 705 L450 628 Z"/>

      <!-- Europe -->
      <path d="M855 185
               L905 165 L975 162 L1045 178 L1074 214 L1048 250 L980 262 L920 242 L868 220 Z"/>

      <!-- Africa -->
      <path d="M990 340
               L1070 380 L1138 470 L1155 582 L1120 710 L1055 838 L985 900
               L930 842 L900 740 L894 635 L920 518 L952 430 Z"/>

      <!-- Asia main -->
      <path d="M1040 180
               L1140 162 L1265 175 L1390 210 L1520 220 L1648 278 L1748 356
               L1815 440 L1825 520 L1778 572 L1705 540 L1658 492 L1586 458
               L1498 446 L1390 414 L1270 398 L1160 370 L1090 315 L1028 245 Z"/>

      <!-- India -->
      <path d="M1322 455
               L1388 488 L1432 548 L1418 628 L1372 680 L1316 648 L1290 575 Z"/>

      <!-- SE Asia -->
      <path d="M1448 468
               L1505 495 L1550 552 L1542 615 L1495 655 L1448 628 L1426 562 Z"/>

      <!-- Arabia -->
      <path d="M1186 432
               L1245 464 L1288 540 L1262 610 L1200 596 L1162 534 Z"/>

      <!-- Australia -->
      <path d="M1568 760
               L1640 780 L1728 822 L1740 884 L1686 930 L1602 936 L1520 904 L1500 838 Z"/>

      <!-- Antarctica -->
      <path d="M620 950
               L770 940 L980 948 L1215 944 L1420 958 L1490 988 L1430 1024 L660 1024 L610 994 Z"/>

      <!-- Japan -->
      <path d="M1742 395 L1760 438 L1750 482 L1722 455 Z"/>

      <!-- UK -->
      <path d="M875 180 L900 172 L910 200 L892 220 L868 208 Z"/>

      <!-- Madagascar -->
      <path d="M1165 810 L1192 838 L1198 888 L1172 930 L1148 892 Z"/>

      <!-- New Zealand -->
      <path d="M1808 905 L1830 932 L1812 968 L1788 948 Z"/>
    </g>

    <!-- coastlines -->
    <g fill="none" stroke="#9ceeff" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" opacity="0.95">
      <path d="M185 185 L260 145 L360 125 L470 135 L565 170 L625 228 L660 292 L648 345 L598 385 L540 420 L486 450 L438 498 L386 530 L315 525 L248 485 L206 425 L170 345 L165 260 Z"/>
      <path d="M560 78 L622 64 L700 78 L748 114 L728 160 L660 176 L592 154 L548 118 Z"/>
      <path d="M485 560 L532 598 L570 665 L580 750 L558 838 L520 918 L472 968 L430 948 L404 885 L402 795 L425 705 L450 628 Z"/>
      <path d="M855 185 L905 165 L975 162 L1045 178 L1074 214 L1048 250 L980 262 L920 242 L868 220 Z"/>
      <path d="M990 340 L1070 380 L1138 470 L1155 582 L1120 710 L1055 838 L985 900 L930 842 L900 740 L894 635 L920 518 L952 430 Z"/>
      <path d="M1040 180 L1140 162 L1265 175 L1390 210 L1520 220 L1648 278 L1748 356 L1815 440 L1825 520 L1778 572 L1705 540 L1658 492 L1586 458 L1498 446 L1390 414 L1270 398 L1160 370 L1090 315 L1028 245 Z"/>
      <path d="M1322 455 L1388 488 L1432 548 L1418 628 L1372 680 L1316 648 L1290 575 Z"/>
      <path d="M1448 468 L1505 495 L1550 552 L1542 615 L1495 655 L1448 628 L1426 562 Z"/>
      <path d="M1186 432 L1245 464 L1288 540 L1262 610 L1200 596 L1162 534 Z"/>
      <path d="M1568 760 L1640 780 L1728 822 L1740 884 L1686 930 L1602 936 L1520 904 L1500 838 Z"/>
      <path d="M620 950 L770 940 L980 948 L1215 944 L1420 958"/>
      <path d="M1742 395 L1760 438 L1750 482 L1722 455 Z"/>
      <path d="M875 180 L900 172 L910 200 L892 220 L868 208 Z"/>
      <path d="M1165 810 L1192 838 L1198 888 L1172 930 L1148 892 Z"/>
      <path d="M1808 905 L1830 932 L1812 968 L1788 948 Z"/>
    </g>

    <!-- soft glow coastline pass -->
    <g fill="none" stroke="#67d8ff" stroke-width="10" opacity="0.18" filter="url(#soft)">
      <path d="M185 185 L260 145 L360 125 L470 135 L565 170 L625 228 L660 292 L648 345 L598 385 L540 420 L486 450 L438 498 L386 530 L315 525 L248 485 L206 425 L170 345 L165 260 Z"/>
      <path d="M1040 180 L1140 162 L1265 175 L1390 210 L1520 220 L1648 278 L1748 356 L1815 440 L1825 520 L1778 572 L1705 540 L1658 492 L1586 458 L1498 446 L1390 414 L1270 398 L1160 370 L1090 315 L1028 245 Z"/>
      <path d="M990 340 L1070 380 L1138 470 L1155 582 L1120 710 L1055 838 L985 900 L930 842 L900 740 L894 635 L920 518 L952 430 Z"/>
      <path d="M1568 760 L1640 780 L1728 822 L1740 884 L1686 930 L1602 936 L1520 904 L1500 838 Z"/>
    </g>
  </svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export default function Globe() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const [nodes, setNodes] = useState<SafeNode[]>([]);
  const [focusNode, setFocusNode] = useState<FocusNode>(null);
  const [loadingNodes, setLoadingNodes] = useState(true);

  useEffect(() => {
    let alive = true;

    async function loadNodes() {
      setLoadingNodes(true);

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const currentUserId = session?.user?.id ?? null;

        const { data, error } = await supabase
          .from("profiles")
          .select("id,lat,lon,is_online,last_seen_at")
          .not("lat", "is", null)
          .not("lon", "is", null)
          .limit(2500);

        if (error) throw error;

        const rows = (data as RawProfile[]) ?? [];

        const safeNodes = rows.map((row) => {
          const safe = obfuscateNodeLocation(row.lat as number, row.lon as number, row.id);

          return {
            id: row.id,
            lat: safe.lat,
            lon: safe.lon,
            active: isActiveNow(row),
            isCurrentUser: row.id === currentUserId,
          };
        });

        if (!alive) return;

        const currentNode =
          safeNodes.find((node) => node.isCurrentUser) ??
          (safeNodes.length > 0 ? safeNodes[0] : null);

        setNodes(safeNodes);
        setFocusNode(currentNode ? { lat: currentNode.lat, lon: currentNode.lon } : null);
      } catch (error) {
        console.error("Failed to load globe nodes:", error);
        setNodes([]);
        setFocusNode(null);
      } finally {
        if (alive) setLoadingNodes(false);
      }
    }

    loadNodes();

    const channel = supabase
      .channel("globe-profile-presence")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        () => {
          loadNodes();
        }
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let frameId = 0;
    let renderer: any = null;
    let scene: any = null;
    let controls: any = null;
    let camera: any = null;
    let resizeHandler: (() => void) | null = null;

    async function buildGlobe() {
      try {
        await loadScript("https://cdn.jsdelivr.net/npm/three@0.124.0/build/three.min.js");
        await loadScript("https://cdn.jsdelivr.net/npm/three@0.124.0/examples/js/controls/OrbitControls.js");

        if (cancelled || !mountRef.current || !window.THREE) return;

        const THREE = window.THREE;
        const container = mountRef.current;
        container.innerHTML = "";

        scene = new THREE.Scene();

        const width = container.clientWidth || 800;
        const height = container.clientHeight || 440;

        camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 1000);
        camera.position.set(0, 0, 10.8);

        renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        });

        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(width, height);
        renderer.setClearColor(0x000000, 0);
        container.appendChild(renderer.domElement);

        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.06;
        controls.enablePan = false;
        controls.enableZoom = true;
        controls.autoRotate = false;
        controls.rotateSpeed = 0.72;
        controls.minDistance = 7.1;
        controls.maxDistance = 18;
        controls.target.set(0, 0, 0);

        const ambient = new THREE.AmbientLight(0xc7e8ff, 0.95);
        scene.add(ambient);

        const keyLight = new THREE.PointLight(0x7ecfff, 1.7, 100);
        keyLight.position.set(8, 4, 10);
        scene.add(keyLight);

        const rimLight = new THREE.PointLight(0x6f5cff, 0.65, 100);
        rimLight.position.set(-8, -3, -8);
        scene.add(rimLight);

        const globeGroup = new THREE.Group();
        scene.add(globeGroup);

        const radius = 3.38;

        const textureLoader = new THREE.TextureLoader();
        const earthTexture = textureLoader.load(createEarthTextureDataUrl());

        const globeGeometry = new THREE.SphereGeometry(radius, 96, 96);
        const globeMaterial = new THREE.MeshPhongMaterial({
          map: earthTexture,
          color: 0xffffff,
          transparent: false,
          opacity: 1,
          shininess: 8,
          emissive: 0x06101d,
          emissiveIntensity: 0.28,
        });

        const globeMesh = new THREE.Mesh(globeGeometry, globeMaterial);
        globeGroup.add(globeMesh);

        const atmosphereGeometry = new THREE.SphereGeometry(radius * 1.025, 72, 72);
        const atmosphereMaterial = new THREE.MeshBasicMaterial({
          color: 0x59ccff,
          transparent: true,
          opacity: 0.05,
          side: THREE.BackSide,
        });
        const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
        globeGroup.add(atmosphere);

        const starsGeometry = new THREE.BufferGeometry();
        const stars: number[] = [];

        for (let i = 0; i < 260; i += 1) {
          const range = 58;
          stars.push(
            (Math.random() - 0.5) * range,
            (Math.random() - 0.5) * range,
            (Math.random() - 0.5) * range
          );
        }

        starsGeometry.setAttribute("position", new THREE.Float32BufferAttribute(stars, 3));

        const starsMaterial = new THREE.PointsMaterial({
          color: 0x78ddff,
          size: 0.05,
          transparent: true,
          opacity: 0.7,
        });

        const starField = new THREE.Points(starsGeometry, starsMaterial);
        scene.add(starField);

        const landmarkGroup = new THREE.Group();
        globeGroup.add(landmarkGroup);

        const landmarkGeometry = new THREE.SphereGeometry(0.03, 10, 10);
        const landmarkMaterial = new THREE.MeshBasicMaterial({
          color: 0xbaf3ff,
          transparent: true,
          opacity: 0.9,
          depthTest: false,
        });

        const landmarkCoords = [
          { lat: 51.48, lon: 0 },
          { lat: 18.34, lon: -66.75 },
          { lat: 19.7, lon: -155.5 },
          { lat: 28.3, lon: -16.5 },
          { lat: -23.0, lon: -67.8 },
          { lat: -32.4, lon: 20.8 },
          { lat: -31.3, lon: 149.1 },
          { lat: 35.7, lon: 139.7 },
        ];

        landmarkCoords.forEach((landmark) => {
          const pos = latLonToVector3(THREE, landmark.lat, landmark.lon, radius * 1.012);
          const marker = new THREE.Mesh(landmarkGeometry, landmarkMaterial);
          marker.position.copy(pos);
          marker.renderOrder = 9;
          landmarkGroup.add(marker);
        });

        const nodeGroup = new THREE.Group();
        globeGroup.add(nodeGroup);

        const idleNodeMaterial = new THREE.MeshBasicMaterial({
          color: 0x57d9ff,
          transparent: true,
          opacity: 0.96,
          depthTest: false,
        });

        const activeNodeMaterial = new THREE.MeshBasicMaterial({
          color: 0x8f6cff,
          transparent: true,
          opacity: 1,
          depthTest: false,
        });

        const currentNodeMaterial = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 1,
          depthTest: false,
        });

        const idleGlowMaterial = new THREE.MeshBasicMaterial({
          color: 0x57d9ff,
          transparent: true,
          opacity: 0.14,
          depthTest: false,
        });

        const activeGlowMaterial = new THREE.MeshBasicMaterial({
          color: 0x8f6cff,
          transparent: true,
          opacity: 0.24,
          depthTest: false,
        });

        const currentGlowMaterial = new THREE.MeshBasicMaterial({
          color: 0x9deeff,
          transparent: true,
          opacity: 0.22,
          depthTest: false,
        });

        const nodeGeometry = new THREE.SphereGeometry(0.045, 12, 12);
        const nodeGlowGeometry = new THREE.SphereGeometry(0.1, 12, 12);

        nodes.forEach((node) => {
          const pos = latLonToVector3(THREE, node.lat, node.lon, radius * 1.022);

          const glow = new THREE.Mesh(
            nodeGlowGeometry,
            node.isCurrentUser
              ? currentGlowMaterial
              : node.active
              ? activeGlowMaterial
              : idleGlowMaterial
          );
          glow.position.copy(pos);
          glow.renderOrder = 10;

          const marker = new THREE.Mesh(
            nodeGeometry,
            node.isCurrentUser
              ? currentNodeMaterial
              : node.active
              ? activeNodeMaterial
              : idleNodeMaterial
          );
          marker.position.copy(pos);
          marker.renderOrder = 11;

          nodeGroup.add(glow);
          nodeGroup.add(marker);

          if (node.isCurrentUser) {
            const ringGeo = new THREE.RingGeometry(0.075, 0.1, 32);
            const ringMat = new THREE.MeshBasicMaterial({
              color: 0x9deeff,
              transparent: true,
              opacity: 0.72,
              side: THREE.DoubleSide,
              depthTest: false,
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.position.copy(pos.clone().multiplyScalar(1.001));
            ring.lookAt(pos.clone().multiplyScalar(2));
            ring.renderOrder = 12;
            nodeGroup.add(ring);
          }
        });

        if (focusNode) {
          globeGroup.rotation.y = ((-focusNode.lon + 90) * Math.PI) / 180;
          globeGroup.rotation.x = ((focusNode.lat || 0) * Math.PI) / 180 * 0.25;
        } else {
          globeGroup.rotation.y = 0.55;
          globeGroup.rotation.x = 0.12;
        }

        camera.lookAt(0, 0, 0);

        const animate = () => {
          if (cancelled) return;
          frameId = window.requestAnimationFrame(animate);
          controls.update();
          renderer.render(scene, camera);
        };

        animate();

        resizeHandler = () => {
          if (!container || !camera || !renderer) return;
          const nextWidth = container.clientWidth || 800;
          const nextHeight = container.clientHeight || 440;
          camera.aspect = nextWidth / nextHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(nextWidth, nextHeight);
        };

        window.addEventListener("resize", resizeHandler);
      } catch (error) {
        console.error("Failed to initialize globe renderer:", error);
      }
    }

    buildGlobe();

    return () => {
      cancelled = true;

      if (frameId) cancelAnimationFrame(frameId);
      if (resizeHandler) window.removeEventListener("resize", resizeHandler);
      if (controls && typeof controls.dispose === "function") controls.dispose();

      if (scene) {
        scene.traverse((object: any) => {
          if (object.geometry && typeof object.geometry.dispose === "function") {
            object.geometry.dispose();
          }

          if (object.material) {
            if (Array.isArray(object.material)) {
              object.material.forEach((material: any) => {
                if (material && typeof material.dispose === "function") {
                  material.dispose();
                }
              });
            } else if (typeof object.material.dispose === "function") {
              object.material.dispose();
            }
          }
        });
      }

      if (renderer) {
        if (typeof renderer.dispose === "function") renderer.dispose();
        if (renderer.domElement && renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
      }
    };
  }, [nodes, focusNode]);

  const cards = useMemo(() => {
    const activeNodes = nodes.length;
    const liveSessions = nodes.filter((node) => node.active).length;

    return [
      {
        label: "Active nodes",
        value: loadingNodes ? "…" : activeNodes.toLocaleString(),
        note: "Approximate observer locations rendered on the globe",
      },
      {
        label: "Live sessions",
        value: loadingNodes ? "…" : liveSessions.toLocaleString(),
        note: "Purple nodes indicate members active in the app",
      },
      {
        label: "Best window",
        value: "21:00–02:00",
        note: "Peak local collection band",
      },
      {
        label: "Verification queue",
        value: "126",
        note: "Items awaiting review",
      },
    ];
  }, [nodes, loadingNodes]);

  return (
    <div className="pageStack">
      <style>{`
        .arrayGlobeShell{
          width:100%;
          height:440px;
          border-radius:30px;
          position:relative;
          overflow:hidden;
          background:
            radial-gradient(circle at 50% 42%, rgba(126,175,255,.08), transparent 22%),
            linear-gradient(180deg, rgba(3,9,22,.96), rgba(2,7,18,.98));
          border:1px solid rgba(95,177,255,.1);
          box-shadow:
            inset 0 0 0 1px rgba(255,255,255,.02),
            inset 0 0 120px rgba(87,160,255,.045);
        }

        .arrayGlobeCanvas{
          width:100%;
          height:100%;
          position:relative;
        }

        .arrayGlobeHud{
          position:absolute;
          left:18px;
          top:18px;
          z-index:2;
          display:flex;
          gap:10px;
          flex-wrap:wrap;
          pointer-events:none;
        }

        .arrayGlobeLegend{
          display:inline-flex;
          align-items:center;
          gap:8px;
          min-height:34px;
          padding:0 12px;
          border-radius:999px;
          background:rgba(6,12,24,.68);
          border:1px solid rgba(255,255,255,.06);
          color:rgba(255,255,255,.84);
          font-size:12px;
          letter-spacing:.08em;
          text-transform:uppercase;
          backdrop-filter: blur(10px);
        }

        .arrayLegendDot{
          width:10px;
          height:10px;
          border-radius:50%;
          display:inline-block;
          box-shadow:0 0 14px currentColor;
        }

        .arrayLegendDot.blue{
          color:#57d9ff;
          background:#57d9ff;
        }

        .arrayLegendDot.purple{
          color:#8f6cff;
          background:#8f6cff;
        }

        .arrayGlobeFooter{
          position:absolute;
          right:18px;
          bottom:18px;
          z-index:2;
          padding:10px 12px;
          border-radius:14px;
          background:rgba(6,12,24,.68);
          border:1px solid rgba(255,255,255,.06);
          color:rgba(255,255,255,.72);
          font-size:12px;
          line-height:1.45;
          max-width:360px;
          backdrop-filter: blur(10px);
          pointer-events:none;
        }

        @media (max-width: 720px){
          .arrayGlobeShell{
            height:380px;
          }

          .arrayGlobeFooter{
            left:18px;
            right:18px;
            max-width:none;
          }
        }
      `}</style>

      <section className="heroPanel">
        <div className="eyebrow">NETWORK VIEW</div>
        <h1 className="pageTitle">Make the global array legible.</h1>
        <p className="pageText">
          Observer density and active collection nodes visualized across the planet.
        </p>
      </section>

      <section className="panel">
        <div className="arrayGlobeShell">
          <div className="arrayGlobeHud">
            <div className="arrayGlobeLegend">
              <span className="arrayLegendDot blue" />
              Array node
            </div>
            <div className="arrayGlobeLegend">
              <span className="arrayLegendDot purple" />
              Active in app
            </div>
          </div>

          <div ref={mountRef} className="arrayGlobeCanvas" />

          <div className="arrayGlobeFooter">
            Drag to rotate. Scroll to zoom. The globe opens centered on your current node when
            location data is available. Locations are rounded and slightly offset so users cannot
            derive exact home addresses from the display.
          </div>
        </div>
      </section>

      <div className="gridFour">
        {cards.map((card) => (
          <section key={card.label} className="panel smallPanel">
            <div className="sectionKicker">{card.label}</div>
            <div className="bigStat">{card.value}</div>
            <div className="sectionText">{card.note}</div>
          </section>
        ))}
      </div>
    </div>
  );
}
