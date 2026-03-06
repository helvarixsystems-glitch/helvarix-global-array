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
  <svg xmlns="http://www.w3.org/2000/svg" width="4096" height="2048" viewBox="0 0 4096 2048">
    <defs>
      <linearGradient id="ocean" x1="18%" y1="10%" x2="82%" y2="90%">
        <stop offset="0%" stop-color="#143b75"/>
        <stop offset="35%" stop-color="#0d2f60"/>
        <stop offset="70%" stop-color="#0a244c"/>
        <stop offset="100%" stop-color="#081b38"/>
      </linearGradient>
      <radialGradient id="polarGlow" cx="50%" cy="50%" r="62%">
        <stop offset="0%" stop-color="#7fd8ff" stop-opacity="0.13"/>
        <stop offset="60%" stop-color="#7fd8ff" stop-opacity="0.03"/>
        <stop offset="100%" stop-color="#7fd8ff" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="landFill" x1="10%" y1="10%" x2="90%" y2="90%">
        <stop offset="0%" stop-color="#2ca6a4"/>
        <stop offset="45%" stop-color="#1f807b"/>
        <stop offset="100%" stop-color="#195d5d"/>
      </linearGradient>
      <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="4"/>
      </filter>
    </defs>

    <rect width="4096" height="2048" fill="url(#ocean)"/>
    <rect width="4096" height="2048" fill="url(#polarGlow)"/>

    <g opacity="0.13" stroke="#8fcfff" stroke-width="2" fill="none">
      <path d="M0 512 H4096"/>
      <path d="M0 768 H4096"/>
      <path d="M0 1024 H4096"/>
      <path d="M0 1280 H4096"/>
      <path d="M0 1536 H4096"/>
      <path d="M512 0 V2048"/>
      <path d="M1024 0 V2048"/>
      <path d="M1536 0 V2048"/>
      <path d="M2048 0 V2048"/>
      <path d="M2560 0 V2048"/>
      <path d="M3072 0 V2048"/>
      <path d="M3584 0 V2048"/>
    </g>

    <g fill="#74d8d3" opacity="0.10" filter="url(#softGlow)">
      <ellipse cx="1180" cy="760" rx="760" ry="310"/>
      <ellipse cx="3030" cy="880" rx="980" ry="360"/>
      <ellipse cx="3350" cy="1450" rx="480" ry="160"/>
    </g>

    <g fill="url(#landFill)" stroke="#b5f6ff" stroke-width="8" stroke-linejoin="round" stroke-linecap="round">
      <!-- North America -->
      <path d="M241 430
               L314 382 L410 325 L528 289 L674 255 L842 263 L1000 312 L1080 376 L1144 447
               L1172 526 L1137 598 L1074 664 L998 711 L911 768 L863 838 L802 889 L730 909
               L652 886 L596 854 L560 798 L505 781 L452 726 L395 663 L348 586 L304 508 Z"/>
      <!-- Greenland -->
      <path d="M1036 154
               L1118 124 L1229 126 L1325 170 L1364 238 L1314 314 L1209 350 L1098 321 L1017 248 Z"/>
      <!-- Central America -->
      <path d="M857 851 L917 867 L982 898 L1009 940 L975 978 L910 958 L848 909 Z"/>
      <!-- South America -->
      <path d="M962 964
               L1040 1006 L1110 1104 L1157 1236 L1156 1362 L1124 1496 L1056 1627 L983 1737
               L910 1800 L847 1751 L809 1647 L788 1514 L786 1374 L814 1244 L861 1128 L904 1034 Z"/>
      <!-- Europe -->
      <path d="M1643 378
               L1715 340 L1808 323 L1910 334 L1996 365 L2048 418 L2028 468 L1948 491 L1851 472
               L1770 460 L1698 433 Z"/>
      <!-- North Africa / Mediterranean bridge -->
      <path d="M1700 498 L1814 510 L1939 528 L2044 557 L2088 609 L2014 643 L1882 636 L1767 614 L1678 574 Z"/>
      <!-- Africa -->
      <path d="M1771 589
               L1879 623 L1968 689 L2051 814 L2089 957 L2087 1091 L2047 1224 L1970 1369 L1882 1486
               L1793 1560 L1726 1523 L1683 1425 L1657 1296 L1647 1147 L1658 1008 L1686 881 L1719 764 Z"/>
      <!-- Asia -->
      <path d="M1986 353
               L2113 316 L2267 300 L2442 315 L2615 350 L2760 389 L2910 407 L3056 444 L3202 521
               L3339 622 L3451 739 L3519 850 L3538 935 L3502 1003 L3417 1039 L3324 1024 L3234 973
               L3123 928 L3002 902 L2865 881 L2720 846 L2559 824 L2400 806 L2263 768 L2141 692
               L2047 605 L1986 487 Z"/>
      <!-- India -->
      <path d="M2572 887 L2650 922 L2713 1011 L2718 1106 L2654 1174 L2578 1142 L2527 1053 L2521 948 Z"/>
      <!-- Arabian Peninsula -->
      <path d="M2263 784 L2353 815 L2432 892 L2413 984 L2314 987 L2237 926 L2205 852 Z"/>
      <!-- Southeast Asia -->
      <path d="M2759 886 L2840 925 L2918 1004 L2932 1099 L2869 1159 L2787 1124 L2729 1048 L2716 957 Z"/>
      <!-- Japan -->
      <path d="M3290 694 L3332 741 L3343 798 L3318 849 L3275 809 L3260 748 Z"/>
      <!-- Indonesia -->
      <path d="M2824 1185 L2925 1211 L3028 1244 L3090 1293 L3008 1315 L2896 1292 L2812 1242 Z"/>
      <!-- Australia -->
      <path d="M3059 1356
               L3166 1371 L3294 1415 L3393 1488 L3420 1573 L3377 1647 L3277 1694 L3154 1690
               L3031 1648 L2948 1579 L2928 1489 L2970 1416 Z"/>
      <!-- Madagascar -->
      <path d="M2096 1470 L2141 1514 L2154 1604 L2119 1679 L2072 1629 L2064 1541 Z"/>
      <!-- UK / Ireland -->
      <path d="M1712 313 L1750 304 L1772 339 L1753 377 L1715 366 Z"/>
      <!-- New Zealand -->
      <path d="M3494 1677 L3540 1718 L3522 1784 L3474 1749 Z"/>
      <!-- Antarctica -->
      <path d="M493 1834
               L756 1808 L1095 1798 L1452 1815 L1810 1810 L2175 1798 L2517 1810 L2865 1839
               L3198 1868 L3507 1897 L3671 1948 L3590 1993 L516 1993 L426 1899 Z"/>
    </g>

    <g opacity="0.18" fill="none" stroke="#d9ffff" stroke-width="18" filter="url(#softGlow)">
      <path d="M241 430 L314 382 L410 325 L528 289 L674 255 L842 263 L1000 312 L1080 376 L1144 447 L1172 526 L1137 598 L1074 664 L998 711 L911 768 L863 838 L802 889 L730 909 L652 886 L596 854 L560 798 L505 781 L452 726 L395 663 L348 586 L304 508 Z"/>
      <path d="M1986 353 L2113 316 L2267 300 L2442 315 L2615 350 L2760 389 L2910 407 L3056 444 L3202 521 L3339 622 L3451 739 L3519 850 L3538 935 L3502 1003 L3417 1039 L3324 1024 L3234 973 L3123 928 L3002 902 L2865 881 L2720 846 L2559 824 L2400 806 L2263 768 L2141 692 L2047 605 L1986 487 Z"/>
      <path d="M1771 589 L1879 623 L1968 689 L2051 814 L2089 957 L2087 1091 L2047 1224 L1970 1369 L1882 1486 L1793 1560 L1726 1523 L1683 1425 L1657 1296 L1647 1147 L1658 1008 L1686 881 L1719 764 Z"/>
      <path d="M3059 1356 L3166 1371 L3294 1415 L3393 1488 L3420 1573 L3377 1647 L3277 1694 L3154 1690 L3031 1648 L2948 1579 L2928 1489 L2970 1416 Z"/>
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
        await loadScript(
          "https://cdn.jsdelivr.net/npm/three@0.124.0/examples/js/controls/OrbitControls.js"
        );

        if (cancelled || !mountRef.current || !window.THREE) return;

        const THREE = window.THREE;
        const container = mountRef.current;
        container.innerHTML = "";

        scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x020915, 0.018);

        const width = container.clientWidth || 800;
        const height = container.clientHeight || 440;

        camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 1000);
        camera.position.set(0, 0, 11.2);

        renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        });

        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(width, height);
        renderer.setClearColor(0x020915, 1);
        renderer.outputEncoding = THREE.sRGBEncoding;
        container.appendChild(renderer.domElement);

        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.055;
        controls.enablePan = false;
        controls.enableZoom = true;
        controls.enableRotate = true;
        controls.autoRotate = false;
        controls.rotateSpeed = 0.72;
        controls.zoomSpeed = 0.82;
        controls.minDistance = 7.1;
        controls.maxDistance = 17;
        controls.target.set(0, 0, 0);

        const ambient = new THREE.AmbientLight(0xa4d7ff, 0.6);
        scene.add(ambient);

        const hemisphere = new THREE.HemisphereLight(0x8fdcff, 0x08111f, 0.95);
        scene.add(hemisphere);

        const keyLight = new THREE.DirectionalLight(0xffffff, 1.35);
        keyLight.position.set(8, 3, 10);
        scene.add(keyLight);

        const fillLight = new THREE.DirectionalLight(0x5a7dff, 0.45);
        fillLight.position.set(-7, -2, -8);
        scene.add(fillLight);

        const globeGroup = new THREE.Group();
        scene.add(globeGroup);

        const radius = 3.45;
        const textureLoader = new THREE.TextureLoader();
        const earthTexture = textureLoader.load(createEarthTextureDataUrl());
        earthTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

        const globeGeometry = new THREE.SphereGeometry(radius, 128, 128);
        const globeMaterial = new THREE.MeshStandardMaterial({
          map: earthTexture,
          color: 0xffffff,
          roughness: 0.95,
          metalness: 0.02,
          emissive: 0x05111d,
          emissiveIntensity: 0.22,
          transparent: false,
          opacity: 1,
        });

        const globeMesh = new THREE.Mesh(globeGeometry, globeMaterial);
        globeGroup.add(globeMesh);

        const atmosphereGeometry = new THREE.SphereGeometry(radius * 1.035, 96, 96);
        const atmosphereMaterial = new THREE.MeshPhongMaterial({
          color: 0x6ecbff,
          transparent: true,
          opacity: 0.075,
          side: THREE.BackSide,
          shininess: 0,
        });
        const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
        globeGroup.add(atmosphere);

        const haloGeometry = new THREE.SphereGeometry(radius * 1.11, 64, 64);
        const haloMaterial = new THREE.MeshBasicMaterial({
          color: 0x4aa6ff,
          transparent: true,
          opacity: 0.035,
          side: THREE.BackSide,
          depthWrite: false,
        });
        const halo = new THREE.Mesh(haloGeometry, haloMaterial);
        globeGroup.add(halo);

        const starsGeometry = new THREE.BufferGeometry();
        const stars: number[] = [];

        for (let i = 0; i < 420; i += 1) {
          const range = 60;
          stars.push(
            (Math.random() - 0.5) * range,
            (Math.random() - 0.5) * range,
            (Math.random() - 0.5) * range
          );
        }

        starsGeometry.setAttribute("position", new THREE.Float32BufferAttribute(stars, 3));

        const starsMaterial = new THREE.PointsMaterial({
          color: 0xa7dcff,
          size: 0.045,
          transparent: true,
          opacity: 0.82,
          depthWrite: false,
        });

        const starField = new THREE.Points(starsGeometry, starsMaterial);
        scene.add(starField);

        const landmarkGroup = new THREE.Group();
        globeGroup.add(landmarkGroup);

        const landmarkGeometry = new THREE.SphereGeometry(0.022, 10, 10);
        const landmarkMaterial = new THREE.MeshBasicMaterial({
          color: 0xbaf3ff,
          transparent: true,
          opacity: 0.44,
          depthTest: false,
          depthWrite: false,
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
          const pos = latLonToVector3(THREE, landmark.lat, landmark.lon, radius * 1.01);
          const marker = new THREE.Mesh(landmarkGeometry, landmarkMaterial);
          marker.position.copy(pos);
          marker.renderOrder = 6;
          landmarkGroup.add(marker);
        });

        const nodeGroup = new THREE.Group();
        globeGroup.add(nodeGroup);

        const idleNodeMaterial = new THREE.MeshBasicMaterial({
          color: 0x57d9ff,
          transparent: true,
          opacity: 0.97,
          depthTest: false,
          depthWrite: false,
        });

        const activeNodeMaterial = new THREE.MeshBasicMaterial({
          color: 0x8f6cff,
          transparent: true,
          opacity: 1,
          depthTest: false,
          depthWrite: false,
        });

        const currentNodeMaterial = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 1,
          depthTest: false,
          depthWrite: false,
        });

        const idleGlowMaterial = new THREE.MeshBasicMaterial({
          color: 0x57d9ff,
          transparent: true,
          opacity: 0.15,
          depthTest: false,
          depthWrite: false,
        });

        const activeGlowMaterial = new THREE.MeshBasicMaterial({
          color: 0x8f6cff,
          transparent: true,
          opacity: 0.26,
          depthTest: false,
          depthWrite: false,
        });

        const currentGlowMaterial = new THREE.MeshBasicMaterial({
          color: 0x9deeff,
          transparent: true,
          opacity: 0.24,
          depthTest: false,
          depthWrite: false,
        });

        const nodeGeometry = new THREE.SphereGeometry(0.045, 14, 14);
        const nodeGlowGeometry = new THREE.SphereGeometry(0.11, 14, 14);

        nodes.forEach((node) => {
          const pos = latLonToVector3(THREE, node.lat, node.lon, radius * 1.018);

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
            const ringGeo = new THREE.RingGeometry(0.082, 0.112, 40);
            const ringMat = new THREE.MeshBasicMaterial({
              color: 0x9deeff,
              transparent: true,
              opacity: 0.74,
              side: THREE.DoubleSide,
              depthTest: false,
              depthWrite: false,
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.position.copy(pos.clone().multiplyScalar(1.0015));
            ring.lookAt(pos.clone().multiplyScalar(2));
            ring.renderOrder = 12;
            nodeGroup.add(ring);
          }
        });

        if (focusNode) {
          globeGroup.rotation.y = ((-focusNode.lon + 90) * Math.PI) / 180;
          globeGroup.rotation.x = ((focusNode.lat || 0) * Math.PI) / 180 * 0.24;
        } else {
          globeGroup.rotation.y = 0.62;
          globeGroup.rotation.x = 0.13;
        }

        camera.lookAt(0, 0, 0);

        const animate = () => {
          if (cancelled) return;
          frameId = window.requestAnimationFrame(animate);
          controls.update();
          starField.rotation.y += 0.00012;
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
            radial-gradient(circle at 50% 42%, rgba(126,175,255,.09), transparent 24%),
            linear-gradient(180deg, rgba(3,9,22,.98), rgba(2,7,18,1));
          border:1px solid rgba(95,177,255,.12);
          box-shadow:
            inset 0 0 0 1px rgba(255,255,255,.02),
            inset 0 0 140px rgba(87,160,255,.05),
            0 22px 50px rgba(0,0,0,.34);
        }

        .arrayGlobeCanvas{
          width:100%;
          height:100%;
          position:relative;
          background:linear-gradient(180deg, rgba(2,8,18,1), rgba(1,5,12,1));
        }

        .arrayGlobeCanvas canvas{
          display:block;
          width:100%;
          height:100%;
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
          background:rgba(6,12,24,.72);
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
          background:rgba(6,12,24,.72);
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
