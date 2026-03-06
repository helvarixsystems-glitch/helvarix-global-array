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
  const normalized = (hash % 10000) / 10000;
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

function addLatLonGrid(THREE: any, parent: any, radius: number) {
  const gridMaterial = new THREE.LineBasicMaterial({
    color: 0x8fdcff,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  });

  const latitudes = [-60, -30, 0, 30, 60];
  latitudes.forEach((lat: number) => {
    const latRadius = radius * Math.cos((lat * Math.PI) / 180);
    const y = radius * Math.sin((lat * Math.PI) / 180);

    const curve = new THREE.EllipseCurve(0, 0, latRadius, latRadius, 0, Math.PI * 2, false, 0);
    const points2d = curve.getPoints(256);
    const points3d = points2d.map((p: any) => new THREE.Vector3(p.x, y, p.y));

    const geometry = new THREE.BufferGeometry().setFromPoints(points3d);
    const line = new THREE.LineLoop(geometry, gridMaterial);
    parent.add(line);
  });

  const longitudes = 12;
  for (let i = 0; i < longitudes; i += 1) {
    const points: any[] = [];
    const lon = (i / longitudes) * Math.PI * 2;

    for (let j = 0; j <= 180; j += 2) {
      const lat = (j - 90) * (Math.PI / 180);
      const x = radius * Math.cos(lat) * Math.cos(lon);
      const y = radius * Math.sin(lat);
      const z = radius * Math.cos(lat) * Math.sin(lon);
      points.push(new THREE.Vector3(x, y, z));
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, gridMaterial);
    parent.add(line);
  }
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
        scene.fog = new THREE.FogExp2(0x020814, 0.015);

        const width = container.clientWidth || 1000;
        const height = container.clientHeight || 520;

        camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 1000);
        camera.position.set(0, 0.18, 11.5);

        renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        });

        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(width, height);
        renderer.setClearColor(0x000000, 0);
        renderer.outputEncoding = THREE.sRGBEncoding;
        container.appendChild(renderer.domElement);

        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.055;
        controls.enablePan = false;
        controls.enableZoom = true;
        controls.enableRotate = true;
        controls.autoRotate = false;
        controls.rotateSpeed = 0.62;
        controls.zoomSpeed = 0.82;
        controls.minDistance = 7.2;
        controls.maxDistance = 17;
        controls.target.set(0, 0, 0);

        const ambient = new THREE.AmbientLight(0xbfe7ff, 0.5);
        scene.add(ambient);

        const hemisphere = new THREE.HemisphereLight(0xa8e2ff, 0x04101c, 1.05);
        scene.add(hemisphere);

        const keyLight = new THREE.DirectionalLight(0xffffff, 1.35);
        keyLight.position.set(8, 4, 10);
        scene.add(keyLight);

        const fillLight = new THREE.DirectionalLight(0x5ab8ff, 0.45);
        fillLight.position.set(-9, -2, -7);
        scene.add(fillLight);

        const rimLight = new THREE.DirectionalLight(0x7cecff, 0.7);
        rimLight.position.set(-8, 1, 6);
        scene.add(rimLight);

        const starsGeometry = new THREE.BufferGeometry();
        const stars: number[] = [];

        for (let i = 0; i < 420; i += 1) {
          const range = 70;
          stars.push(
            (Math.random() - 0.5) * range,
            (Math.random() - 0.5) * range,
            (Math.random() - 0.5) * range
          );
        }

        starsGeometry.setAttribute("position", new THREE.Float32BufferAttribute(stars, 3));

        const starField = new THREE.Points(
          starsGeometry,
          new THREE.PointsMaterial({
            color: 0xaedfff,
            size: 0.05,
            transparent: true,
            opacity: 0.78,
            depthWrite: false,
          })
        );
        scene.add(starField);

        const globeGroup = new THREE.Group();
        scene.add(globeGroup);

        const radius = 3.48;

        const textureLoader = new THREE.TextureLoader();
        textureLoader.setCrossOrigin("anonymous");

        const earthMap = textureLoader.load(
          "https://cdn.jsdelivr.net/gh/mrdoob/three.js/examples/textures/planets/earth_atmos_2048.jpg"
        );
        const earthNormal = textureLoader.load(
          "https://cdn.jsdelivr.net/gh/mrdoob/three.js/examples/textures/planets/earth_normal_2048.jpg"
        );
        const earthSpecular = textureLoader.load(
          "https://cdn.jsdelivr.net/gh/mrdoob/three.js/examples/textures/planets/earth_specular_2048.jpg"
        );
        const earthClouds = textureLoader.load(
          "https://cdn.jsdelivr.net/gh/mrdoob/three.js/examples/textures/planets/earth_clouds_2048.png"
        );

        [earthMap, earthNormal, earthSpecular, earthClouds].forEach((texture) => {
          texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        });

        const globeGeometry = new THREE.SphereGeometry(radius, 160, 160);

        const globeMaterial = new THREE.MeshPhongMaterial({
          map: earthMap,
          normalMap: earthNormal,
          normalScale: new THREE.Vector2(0.85, 0.85),
          specularMap: earthSpecular,
          specular: new THREE.Color(0x274c66),
          shininess: 14,
          color: 0xffffff,
          transparent: false,
          opacity: 1,
        });

        const globeMesh = new THREE.Mesh(globeGeometry, globeMaterial);
        globeGroup.add(globeMesh);

        const cloudMesh = new THREE.Mesh(
          new THREE.SphereGeometry(radius * 1.008, 128, 128),
          new THREE.MeshPhongMaterial({
            map: earthClouds,
            transparent: true,
            opacity: 0.24,
            depthWrite: false,
            side: THREE.DoubleSide,
          })
        );
        globeGroup.add(cloudMesh);

        const gridGroup = new THREE.Group();
        addLatLonGrid(THREE, gridGroup, radius * 1.002);
        globeGroup.add(gridGroup);

        const atmosphere = new THREE.Mesh(
          new THREE.SphereGeometry(radius * 1.04, 96, 96),
          new THREE.MeshPhongMaterial({
            color: 0x63d9ff,
            transparent: true,
            opacity: 0.09,
            side: THREE.BackSide,
            shininess: 0,
            depthWrite: false,
          })
        );
        globeGroup.add(atmosphere);

        const halo = new THREE.Mesh(
          new THREE.SphereGeometry(radius * 1.12, 72, 72),
          new THREE.MeshBasicMaterial({
            color: 0x3da6ff,
            transparent: true,
            opacity: 0.055,
            side: THREE.BackSide,
            depthWrite: false,
          })
        );
        globeGroup.add(halo);

        const nodeGroup = new THREE.Group();
        globeGroup.add(nodeGroup);

        const idleNodeMaterial = new THREE.MeshBasicMaterial({
          color: 0x57d9ff,
          transparent: true,
          opacity: 0.98,
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
          opacity: 0.16,
          depthTest: false,
          depthWrite: false,
        });

        const activeGlowMaterial = new THREE.MeshBasicMaterial({
          color: 0x8f6cff,
          transparent: true,
          opacity: 0.28,
          depthTest: false,
          depthWrite: false,
        });

        const currentGlowMaterial = new THREE.MeshBasicMaterial({
          color: 0x9deeff,
          transparent: true,
          opacity: 0.28,
          depthTest: false,
          depthWrite: false,
        });

        const nodeGeometry = new THREE.SphereGeometry(0.042, 12, 12);
        const nodeGlowGeometry = new THREE.SphereGeometry(0.1, 12, 12);

        nodes.forEach((node) => {
          const pos = latLonToVector3(THREE, node.lat, node.lon, radius * 1.014);

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
              opacity: 0.78,
              side: THREE.DoubleSide,
              depthTest: false,
              depthWrite: false,
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
          globeGroup.rotation.x = ((focusNode.lat || 0) * Math.PI) / 180 * 0.16;
        } else {
          globeGroup.rotation.y = 0.72;
          globeGroup.rotation.x = 0.08;
        }

        camera.lookAt(0, 0, 0);

        const animate = () => {
          if (cancelled) return;

          frameId = window.requestAnimationFrame(animate);
          controls.update();
          cloudMesh.rotation.y += 0.00018;
          starField.rotation.y += 0.00008;
          renderer.render(scene, camera);
        };

        animate();

        resizeHandler = () => {
          if (!container || !camera || !renderer) return;
          const nextWidth = container.clientWidth || 1000;
          const nextHeight = container.clientHeight || 520;
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
                if (material?.map && typeof material.map.dispose === "function") {
                  material.map.dispose();
                }
                if (material?.normalMap && typeof material.normalMap.dispose === "function") {
                  material.normalMap.dispose();
                }
                if (
                  material?.specularMap &&
                  typeof material.specularMap.dispose === "function"
                ) {
                  material.specularMap.dispose();
                }
                if (typeof material.dispose === "function") {
                  material.dispose();
                }
              });
            } else {
              if (object.material?.map && typeof object.material.map.dispose === "function") {
                object.material.map.dispose();
              }
              if (
                object.material?.normalMap &&
                typeof object.material.normalMap.dispose === "function"
              ) {
                object.material.normalMap.dispose();
              }
              if (
                object.material?.specularMap &&
                typeof object.material.specularMap.dispose === "function"
              ) {
                object.material.specularMap.dispose();
              }
              if (typeof object.material.dispose === "function") {
                object.material.dispose();
              }
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
          min-height:520px;
          border-radius:30px;
          position:relative;
          overflow:hidden;
          background:
            radial-gradient(circle at 50% 24%, rgba(45,137,255,.15), transparent 18%),
            radial-gradient(circle at 50% 120%, rgba(118,64,255,.12), transparent 34%),
            linear-gradient(180deg, rgba(2,10,24,.98), rgba(1,7,18,1));
          border:1px solid rgba(95,177,255,.16);
          box-shadow:
            inset 0 0 0 1px rgba(255,255,255,.02),
            inset 0 0 160px rgba(56,118,255,.06),
            0 30px 80px rgba(0,0,0,.36);
        }

        .arrayGlobeInner{
          position:absolute;
          inset:28px;
          border-radius:26px;
          overflow:hidden;
          background:
            radial-gradient(circle at 50% 38%, rgba(40,100,255,.10), transparent 22%),
            linear-gradient(180deg, rgba(0,7,20,.98), rgba(0,5,16,1));
          border:1px solid rgba(95,177,255,.10);
        }

        .arrayGlobeCanvas{
          width:100%;
          height:100%;
          position:relative;
        }

        .arrayGlobeCanvas canvas{
          display:block;
          width:100%;
          height:100%;
        }

        .arrayGlobeHud{
          position:absolute;
          left:22px;
          top:22px;
          z-index:2;
          display:flex;
          gap:10px;
          flex-wrap:wrap;
          pointer-events:none;
        }

        .arrayGlobeLegend{
          display:inline-flex;
          align-items:center;
          gap:10px;
          min-height:38px;
          padding:0 14px;
          border-radius:999px;
          background:rgba(7,14,28,.66);
          border:1px solid rgba(255,255,255,.06);
          color:rgba(255,255,255,.86);
          font-size:12px;
          font-weight:600;
          letter-spacing:.08em;
          text-transform:uppercase;
          backdrop-filter: blur(12px);
          box-shadow: inset 0 0 24px rgba(255,255,255,.02);
        }

        .arrayLegendDot{
          width:11px;
          height:11px;
          border-radius:50%;
          display:inline-block;
          box-shadow:0 0 18px currentColor;
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
          right:20px;
          bottom:20px;
          z-index:2;
          padding:14px 16px;
          border-radius:18px;
          background:rgba(7,14,28,.72);
          border:1px solid rgba(255,255,255,.06);
          color:rgba(255,255,255,.76);
          font-size:12px;
          line-height:1.5;
          max-width:430px;
          backdrop-filter: blur(12px);
          pointer-events:none;
          box-shadow: inset 0 0 26px rgba(255,255,255,.02);
        }

        .pageTitle{
          margin:0 0 8px 0;
        }

        .pageText{
          margin:0;
        }

        .heroPanel{
          margin-bottom:14px;
        }

        .eyebrow{
          font-size:12px;
          letter-spacing:.3em;
          text-transform:uppercase;
          color:rgba(83, 221, 255, .88);
          margin-bottom:10px;
        }

        .gridFour{
          display:grid;
          grid-template-columns:repeat(4, minmax(0,1fr));
          gap:18px;
          margin-top:18px;
        }

        .smallPanel{
          min-height:146px;
        }

        .sectionKicker{
          font-size:12px;
          letter-spacing:.28em;
          text-transform:uppercase;
          color:rgba(83, 221, 255, .9);
          margin-bottom:12px;
        }

        .bigStat{
          font-size:34px;
          font-weight:800;
          line-height:1;
          margin-bottom:12px;
        }

        .sectionText{
          color:rgba(255,255,255,.68);
          line-height:1.45;
          font-size:14px;
        }

        @media (max-width: 1000px){
          .gridFour{
            grid-template-columns:repeat(2, minmax(0,1fr));
          }
        }

        @media (max-width: 720px){
          .arrayGlobeShell{
            min-height:430px;
          }

          .arrayGlobeInner{
            inset:16px;
          }

          .arrayGlobeFooter{
            left:16px;
            right:16px;
            max-width:none;
          }
        }

        @media (max-width: 640px){
          .gridFour{
            grid-template-columns:1fr;
          }

          .arrayGlobeShell{
            min-height:390px;
          }

          .bigStat{
            font-size:30px;
          }
        }
      `}</style>

      <section className="heroPanel">
        <div className="eyebrow">Network View</div>
        <h1 className="pageTitle">Make the global array legible.</h1>
        <p className="pageText">
          Observer density and live collection activity rendered on a real Earth texture.
        </p>
      </section>

      <section className="panel">
        <div className="arrayGlobeShell">
          <div className="arrayGlobeInner">
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
        </div>
      </section>

      <div className="gridFour">
        {cards.map((card) => (
          <section key={card.label} className="panel smallPanel">
            <div className="panelInner">
              <div className="sectionKicker">{card.label}</div>
              <div className="bigStat">{card.value}</div>
              <div className="sectionText">{card.note}</div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
