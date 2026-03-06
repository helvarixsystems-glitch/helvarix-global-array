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
      <radialGradient id="oceanGlow" cx="50%" cy="45%" r="60%">
        <stop offset="0%" stop-color="#133f7b"/>
        <stop offset="55%" stop-color="#0b2850"/>
        <stop offset="100%" stop-color="#081a34"/>
      </radialGradient>

      <filter id="softGlow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="3" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>

    <rect width="2048" height="1024" fill="url(#oceanGlow)"/>

    <!-- Land fill -->
    <g fill="#113560" opacity="0.94">
      <!-- North America -->
      <path d="M180 210 L250 160 L340 135 L430 140 L510 175 L560 220 L600 285 L585 350 L530 392 L470 430 L420 470 L360 505 L300 525 L235 500 L190 445 L155 365 L145 285 Z"/>
      <!-- Greenland -->
      <path d="M520 95 L570 78 L640 86 L688 118 L660 155 L605 165 L555 145 Z"/>
      <!-- South America -->
      <path d="M470 555 L530 600 L560 680 L552 782 L515 868 L468 925 L430 895 L413 815 L420 730 L438 660 Z"/>
      <!-- Europe / Asia -->
      <path d="M780 190 L850 165 L930 155 L1000 165 L1080 182 L1160 205 L1245 190 L1350 205 L1450 245 L1545 300 L1630 368 L1698 438 L1738 505 L1712 552 L1655 585 L1580 568 L1518 520 L1450 490 L1362 485 L1272 455 L1210 460 L1135 430 L1040 445 L972 425 L915 382 L860 330 L790 282 Z"/>
      <!-- Africa -->
      <path d="M1020 470 L1095 515 L1145 585 L1175 680 L1158 792 L1090 900 L1008 930 L945 870 L918 792 L935 705 L968 615 Z"/>
      <!-- Arabian peninsula / India -->
      <path d="M1182 490 L1238 525 L1272 575 L1262 628 L1228 648 L1188 620 L1160 558 Z"/>
      <path d="M1292 580 L1342 610 L1376 660 L1362 720 L1325 748 L1292 705 L1278 640 Z"/>
      <!-- SE Asia -->
      <path d="M1405 560 L1455 580 L1505 625 L1492 672 L1452 700 L1410 675 L1388 628 Z"/>
      <!-- Australia -->
      <path d="M1560 758 L1625 778 L1692 820 L1705 876 L1652 914 L1568 928 L1498 902 L1478 848 L1500 798 Z"/>
      <!-- Antarctica -->
      <path d="M650 965 L810 948 L1010 954 L1210 946 L1380 968 L1410 1008 L1320 1024 L740 1024 L670 1006 Z"/>
      <!-- Japan -->
      <path d="M1580 470 L1600 505 L1594 540 L1570 560 L1550 525 Z"/>
      <!-- UK / Scandinavia -->
      <path d="M905 210 L945 205 L960 238 L930 260 L895 248 Z"/>
      <path d="M990 165 L1035 145 L1085 148 L1115 182 L1088 215 L1038 228 L1000 205 Z"/>
      <!-- Madagascar -->
      <path d="M1188 825 L1215 845 L1222 892 L1195 930 L1168 898 Z"/>
      <!-- New Zealand -->
      <path d="M1768 905 L1790 925 L1780 955 L1752 972 L1732 948 Z"/>
    </g>

    <!-- Coastlines -->
    <g fill="none" stroke="#8feaff" stroke-width="4.5" stroke-linejoin="round" stroke-linecap="round" opacity="0.98" filter="url(#softGlow)">
      <path d="M180 210 L250 160 L340 135 L430 140 L510 175 L560 220 L600 285 L585 350 L530 392 L470 430 L420 470 L360 505 L300 525 L235 500 L190 445 L155 365 L145 285 Z"/>
      <path d="M520 95 L570 78 L640 86 L688 118 L660 155 L605 165 L555 145 Z"/>
      <path d="M470 555 L530 600 L560 680 L552 782 L515 868 L468 925 L430 895 L413 815 L420 730 L438 660 Z"/>
      <path d="M780 190 L850 165 L930 155 L1000 165 L1080 182 L1160 205 L1245 190 L1350 205 L1450 245 L1545 300 L1630 368 L1698 438 L1738 505 L1712 552 L1655 585 L1580 568 L1518 520 L1450 490 L1362 485 L1272 455 L1210 460 L1135 430 L1040 445 L972 425 L915 382 L860 330 L790 282 Z"/>
      <path d="M1020 470 L1095 515 L1145 585 L1175 680 L1158 792 L1090 900 L1008 930 L945 870 L918 792 L935 705 L968 615 Z"/>
      <path d="M1182 490 L1238 525 L1272 575 L1262 628 L1228 648 L1188 620 L1160 558 Z"/>
      <path d="M1292 580 L1342 610 L1376 660 L1362 720 L1325 748 L1292 705 L1278 640 Z"/>
      <path d="M1405 560 L1455 580 L1505 625 L1492 672 L1452 700 L1410 675 L1388 628 Z"/>
      <path d="M1560 758 L1625 778 L1692 820 L1705 876 L1652 914 L1568 928 L1498 902 L1478 848 L1500 798 Z"/>
      <path d="M650 965 L810 948 L1010 954 L1210 946 L1380 968"/>
      <path d="M1580 470 L1600 505 L1594 540 L1570 560 L1550 525 Z"/>
      <path d="M905 210 L945 205 L960 238 L930 260 L895 248 Z"/>
      <path d="M990 165 L1035 145 L1085 148 L1115 182 L1088 215 L1038 228 L1000 205 Z"/>
      <path d="M1188 825 L1215 845 L1222 892 L1195 930 L1168 898 Z"/>
      <path d="M1768 905 L1790 925 L1780 955 L1752 972 L1732 948 Z"/>
    </g>
  </svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export default function Globe() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [nodes, setNodes] = useState<SafeNode[]>([]);
  const [loadingNodes, setLoadingNodes] = useState(true);
  const [focusNode, setFocusNode] = useState<FocusNode>(null);

  useEffect(() => {
    let alive = true;

    async function loadNodes() {
      setLoadingNodes(true);

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const currentUserId = session?.user?.id ?? null;

        let rows: RawProfile[] = [];

        const primary = await supabase
          .from("profiles")
          .select("id,lat,lon,is_online,last_seen_at")
          .not("lat", "is", null)
          .not("lon", "is", null)
          .limit(2500);

        if (primary.error) {
          console.warn("Primary globe node query failed:", primary.error);

          const fallback = await supabase
            .from("profiles")
            .select("id,lat,lon")
            .not("lat", "is", null)
            .not("lon", "is", null)
            .limit(2500);

          if (fallback.error) {
            console.warn("Fallback globe node query failed:", fallback.error);
            throw fallback.error;
          }

          rows = (fallback.data as RawProfile[]) ?? [];
        } else {
          rows = (primary.data as RawProfile[]) ?? [];
        }

        if (!alive) return;

        const safeNodes = rows
          .filter((row) => typeof row.lat === "number" && typeof row.lon === "number")
          .map((row) => {
            const safe = obfuscateNodeLocation(row.lat as number, row.lon as number, row.id);

            return {
              id: row.id,
              lat: safe.lat,
              lon: safe.lon,
              active: isActiveNow(row),
              isCurrentUser: row.id === currentUserId,
            };
          });

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
        camera.position.set(0, 0, 11.25);

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
        controls.minDistance = 7.2;
        controls.maxDistance = 18;
        controls.target.set(0, 0, 0);

        const ambient = new THREE.AmbientLight(0xb3dcff, 0.92);
        scene.add(ambient);

        const keyLight = new THREE.PointLight(0x7bcfff, 1.9, 120);
        keyLight.position.set(9, 4, 10);
        scene.add(keyLight);

        const fillLight = new THREE.PointLight(0x6f5cff, 0.85, 120);
        fillLight.position.set(-8, -3, -8);
        scene.add(fillLight);

        const globeGroup = new THREE.Group();
        scene.add(globeGroup);

        const radius = 3.36;

        const textureLoader = new THREE.TextureLoader();
        const mapTexture = textureLoader.load(createEarthTextureDataUrl());
        mapTexture.wrapS = THREE.RepeatWrapping;
        mapTexture.wrapT = THREE.ClampToEdgeWrapping;
        mapTexture.anisotropy = 4;

        const globeGeometry = new THREE.SphereGeometry(radius, 96, 96);
        const globeMaterial = new THREE.MeshPhongMaterial({
          map: mapTexture,
          color: 0xffffff,
          transparent: false,
          opacity: 1,
          shininess: 10,
          emissive: 0x06101d,
          emissiveIntensity: 0.35,
        });

        const globeMesh = new THREE.Mesh(globeGeometry, globeMaterial);
        globeGroup.add(globeMesh);

        const atmosphereGeometry = new THREE.SphereGeometry(radius * 1.02, 72, 72);
        const atmosphereMaterial = new THREE.MeshBasicMaterial({
          color: 0x59ccff,
          transparent: true,
          opacity: 0.06,
          side: THREE.BackSide,
        });
        const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
        globeGroup.add(atmosphere);

        const starsGeometry = new THREE.BufferGeometry();
        const stars: number[] = [];

        for (let i = 0; i < 280; i += 1) {
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
          size: 0.06,
          transparent: true,
          opacity: 0.7,
        });

        const starField = new THREE.Points(starsGeometry, starsMaterial);
        scene.add(starField);

        const landmarkGroup = new THREE.Group();
        globeGroup.add(landmarkGroup);

        const landmarkGeometry = new THREE.SphereGeometry(0.03, 10, 10);
        const landmarkMaterial = new THREE.MeshBasicMaterial({
          color: 0xb8f1ff,
          transparent: true,
          opacity: 0.95,
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
          opacity: 0.16,
          depthTest: false,
        });

        const activeGlowMaterial = new THREE.MeshBasicMaterial({
          color: 0x8f6cff,
          transparent: true,
          opacity: 0.24,
          depthTest: false,
        });

        const currentGlowMaterial = new THREE.MeshBasicMaterial({
          color: 0x8feaff,
          transparent: true,
          opacity: 0.24,
          depthTest: false,
        });

        const nodeGeometry = new THREE.SphereGeometry(0.045, 12, 12);
        const nodeGlowGeometry = new THREE.SphereGeometry(0.1, 12, 12);

        nodes.forEach((node) => {
          const pos = latLonToVector3(THREE, node.lat, node.lon, radius * 1.025);

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
              color: 0x8feaff,
              transparent: true,
              opacity: 0.75,
              side: THREE.DoubleSide,
              depthTest: false,
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.position.copy(pos.clone().multiplyScalar(1.002));
            ring.lookAt(pos.clone().multiplyScalar(2));
            ring.renderOrder = 12;
            nodeGroup.add(ring);
          }
        });

        if (focusNode) {
          globeGroup.rotation.y = ((-focusNode.lon + 90) * Math.PI) / 180;
          globeGroup.rotation.x = (focusNode.lat * Math.PI) / 180 * 0.35;
        } else {
          globeGroup.rotation.y = 0.6;
          globeGroup.rotation.x = 0.15;
        }

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
          This page highlights network health, observer density, and collection timing without
          exposing precise user locations. Node positions are intentionally generalized for safety.
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
