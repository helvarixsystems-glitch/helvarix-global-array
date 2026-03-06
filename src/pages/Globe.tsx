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
};

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

  return {
    lat: safeLat,
    lon: safeLon,
  };
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

function makeLineFromLatLon(THREE: any, points: Array<[number, number]>, radius: number) {
  const vectors = points.map(([lat, lon]) => latLonToVector3(THREE, lat, lon, radius));
  return new THREE.BufferGeometry().setFromPoints(vectors);
}

const CONTINENT_OUTLINES: Array<Array<[number, number]>> = [
  [
    [72, -165], [68, -145], [62, -125], [56, -110], [52, -96], [48, -84], [42, -74],
    [34, -80], [24, -97], [20, -108], [24, -116], [33, -122], [44, -128], [56, -145],
    [66, -160], [72, -165],
  ],
  [
    [12, -80], [7, -75], [-4, -72], [-16, -68], [-28, -64], [-40, -60], [-52, -67],
    [-55, -74], [-45, -74], [-28, -70], [-10, -74], [2, -79], [12, -80],
  ],
  [
    [72, -10], [68, 14], [62, 35], [56, 56], [54, 78], [48, 98], [44, 118], [40, 138],
    [30, 148], [18, 126], [12, 108], [8, 90], [16, 72], [22, 58], [30, 42], [38, 28],
    [44, 16], [50, 4], [58, -6], [66, -14], [72, -10],
  ],
  [
    [35, -16], [30, -6], [24, 8], [16, 24], [6, 34], [-10, 40], [-24, 32], [-34, 22],
    [-32, 8], [-18, -2], [-4, -10], [10, -14], [24, -16], [35, -16],
  ],
  [
    [-10, 112], [-18, 126], [-26, 138], [-36, 147], [-42, 140], [-39, 124], [-30, 114],
    [-20, 111], [-10, 112],
  ],
  [
    [82, -56], [78, -36], [72, -28], [66, -40], [62, -50], [66, -58], [74, -62], [82, -56],
  ],
  [
    [-72, -180], [-74, -140], [-75, -100], [-74, -60], [-75, -20], [-74, 20], [-75, 60],
    [-74, 100], [-75, 140], [-72, 180],
  ],
];

const LANDMARKS: Array<{ lat: number; lon: number }> = [
  { lat: 51.48, lon: 0 },
  { lat: 18.34, lon: -66.75 },
  { lat: 19.7, lon: -155.5 },
  { lat: 28.3, lon: -16.5 },
  { lat: -23.0, lon: -67.8 },
  { lat: -32.4, lon: 20.8 },
  { lat: -31.3, lon: 149.1 },
  { lat: 35.7, lon: 139.7 },
];

export default function Globe() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [nodes, setNodes] = useState<SafeNode[]>([]);
  const [loadingNodes, setLoadingNodes] = useState(true);

  useEffect(() => {
    let alive = true;

    async function loadNodes() {
      setLoadingNodes(true);

      try {
        let rows: RawProfile[] = [];

        const primary = await supabase
          .from("profiles")
          .select("id,lat,lon,is_online,last_seen_at")
          .not("lat", "is", null)
          .not("lon", "is", null)
          .limit(2500);

        if (primary.error) {
          const fallback = await supabase
            .from("profiles")
            .select("id,lat,lon")
            .not("lat", "is", null)
            .not("lon", "is", null)
            .limit(2500);

          if (fallback.error) throw fallback.error;
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
            };
          });

        setNodes(safeNodes);
      } catch (error) {
        console.error("Failed to load globe nodes:", error);
        setNodes([]);
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
        await loadScript("https://cdn.jsdelivr.net/npm/three@0.148.0/build/three.min.js");
        await loadScript("https://cdn.jsdelivr.net/npm/three@0.148.0/examples/js/controls/OrbitControls.js");

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
        container.appendChild(renderer.domElement);

        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.06;
        controls.enablePan = false;
        controls.minDistance = 7.25;
        controls.maxDistance = 18;
        controls.autoRotate = false;
        controls.rotateSpeed = 0.72;

        const ambient = new THREE.AmbientLight(0x9fd8ff, 0.92);
        scene.add(ambient);

        const keyLight = new THREE.PointLight(0x79d1ff, 2.4, 120);
        keyLight.position.set(8, 4, 10);
        scene.add(keyLight);

        const fillLight = new THREE.PointLight(0x7b60ff, 1.35, 120);
        fillLight.position.set(-10, -4, -8);
        scene.add(fillLight);

        const globeGroup = new THREE.Group();
        scene.add(globeGroup);

        const radius = 3.36;

        const globeGeometry = new THREE.SphereGeometry(radius, 72, 72);
        const globeMaterial = new THREE.MeshPhysicalMaterial({
          color: 0x08172b,
          roughness: 0.82,
          metalness: 0.08,
          transparent: true,
          opacity: 0.97,
          clearcoat: 0.45,
          clearcoatRoughness: 0.88,
          emissive: 0x07111e,
          emissiveIntensity: 0.88,
        });

        const globeMesh = new THREE.Mesh(globeGeometry, globeMaterial);
        globeGroup.add(globeMesh);

        const atmosphereGeometry = new THREE.SphereGeometry(radius * 1.022, 72, 72);
        const atmosphereMaterial = new THREE.MeshBasicMaterial({
          color: 0x59ccff,
          transparent: true,
          opacity: 0.07,
        });
        const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
        globeGroup.add(atmosphere);

        const meridianMaterial = new THREE.LineBasicMaterial({
          color: 0x1f4f7a,
          transparent: true,
          opacity: 0.28,
        });

        for (let lat = -60; lat <= 60; lat += 30) {
          const ringPoints: any[] = [];
          for (let lon = -180; lon <= 180; lon += 4) {
            ringPoints.push(latLonToVector3(THREE, lat, lon, radius * 1.001));
          }
          const geometry = new THREE.BufferGeometry().setFromPoints(ringPoints);
          const ring = new THREE.Line(geometry, meridianMaterial);
          globeGroup.add(ring);
        }

        for (let lon = -150; lon <= 180; lon += 30) {
          const linePoints: any[] = [];
          for (let lat = -90; lat <= 90; lat += 3) {
            linePoints.push(latLonToVector3(THREE, lat, lon, radius * 1.001));
          }
          const geometry = new THREE.BufferGeometry().setFromPoints(linePoints);
          const line = new THREE.Line(geometry, meridianMaterial);
          globeGroup.add(line);
        }

        const continentMaterial = new THREE.LineBasicMaterial({
          color: 0x4dcfff,
          transparent: true,
          opacity: 0.72,
        });

        CONTINENT_OUTLINES.forEach((outline) => {
          const geometry = makeLineFromLatLon(THREE, outline, radius * 1.006);
          const line = new THREE.Line(geometry, continentMaterial);
          globeGroup.add(line);
        });

        const landmarkGroup = new THREE.Group();
        globeGroup.add(landmarkGroup);

        const landmarkGeometry = new THREE.SphereGeometry(0.03, 10, 10);
        const landmarkMaterial = new THREE.MeshBasicMaterial({
          color: 0x9ddfff,
          transparent: true,
          opacity: 0.95,
        });

        LANDMARKS.forEach((landmark) => {
          const pos = latLonToVector3(THREE, landmark.lat, landmark.lon, radius * 1.014);
          const marker = new THREE.Mesh(landmarkGeometry, landmarkMaterial);
          marker.position.copy(pos);
          landmarkGroup.add(marker);
        });

        const starsGeometry = new THREE.BufferGeometry();
        const stars: number[] = [];
        for (let i = 0; i < 320; i += 1) {
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
          size: 0.07,
          transparent: true,
          opacity: 0.72,
        });

        const starField = new THREE.Points(starsGeometry, starsMaterial);
        scene.add(starField);

        const nodeGroup = new THREE.Group();
        globeGroup.add(nodeGroup);

        const idleNodeMaterial = new THREE.MeshBasicMaterial({
          color: 0x57d9ff,
          transparent: true,
          opacity: 0.96,
        });

        const activeNodeMaterial = new THREE.MeshBasicMaterial({
          color: 0x8f6cff,
          transparent: true,
          opacity: 1,
        });

        const idleGlowMaterial = new THREE.MeshBasicMaterial({
          color: 0x57d9ff,
          transparent: true,
          opacity: 0.16,
        });

        const activeGlowMaterial = new THREE.MeshBasicMaterial({
          color: 0x8f6cff,
          transparent: true,
          opacity: 0.24,
        });

        const nodeGeometry = new THREE.SphereGeometry(0.045, 12, 12);
        const nodeGlowGeometry = new THREE.SphereGeometry(0.095, 12, 12);

        nodes.forEach((node) => {
          const pos = latLonToVector3(THREE, node.lat, node.lon, radius * 1.03);

          const glow = new THREE.Mesh(
            nodeGlowGeometry,
            node.active ? activeGlowMaterial : idleGlowMaterial
          );
          glow.position.copy(pos);

          const marker = new THREE.Mesh(
            nodeGeometry,
            node.active ? activeNodeMaterial : idleNodeMaterial
          );
          marker.position.copy(pos);

          nodeGroup.add(glow);
          nodeGroup.add(marker);
        });

        const animate = () => {
          if (cancelled) return;
          frameId = window.requestAnimationFrame(animate);
          globeGroup.rotation.y += 0.0012;
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
      if (controls) controls.dispose?.();

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
        renderer.dispose?.();
        if (renderer.domElement && renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
      }
    };
  }, [nodes]);

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
            radial-gradient(circle at 50% 42%, rgba(126,175,255,.16), transparent 22%),
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
            Drag to rotate. Scroll to zoom. Locations are rounded and slightly offset so users
            cannot derive exact home addresses from the display.
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
