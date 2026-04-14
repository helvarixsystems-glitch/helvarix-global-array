import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useDeviceProfile } from "../hooks/useDeviceProfile";

declare global {
  interface Window {
    THREE?: any;
  }
}

type RawProfile = {
  id: string;
  city?: string | null;
  country?: string | null;
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
  city: string | null;
  country: string | null;
  label: string;
  source: "stored" | "geocoded";
};

type FocusNode = {
  lat: number;
  lon: number;
} | null;

type Coordinates = {
  latitude: number;
  longitude: number;
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

function isActiveNow(row: RawProfile, currentUserId: string | null) {
  if (row.id === currentUserId) return true;
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
    opacity: 0.14,
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

function buildLocationLabel(city: string | null | undefined, country: string | null | undefined) {
  const parts = [String(city ?? "").trim(), String(country ?? "").trim()].filter(Boolean);
  return parts.length ? parts.join(", ") : "Location unavailable";
}

async function geocodePlace(query: string): Promise<Coordinates | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    query
  )}&count=1&language=en&format=json`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("Unable to geocode profile location.");
  const json = await res.json();
  const result = json?.results?.[0];
  if (!result) return null;

  return {
    latitude: Number(result.latitude),
    longitude: Number(result.longitude),
  };
}

export default function Globe() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const device = useDeviceProfile("globe");
  const isMobile = device.deviceClass === "mobile";

  const [nodes, setNodes] = useState<SafeNode[]>([]);
  const [focusNode, setFocusNode] = useState<FocusNode>(null);
  const [loadingNodes, setLoadingNodes] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function loadNodes() {
      setLoadingNodes(true);
      setError(null);

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const currentUserId = session?.user?.id ?? null;
        if (alive) setSessionUserId(currentUserId);

        const { data, error } = await supabase
          .from("profiles")
          .select("id,city,country,lat,lon,is_online,last_seen_at")
          .limit(2500);

        if (error) throw error;

        const rows = ((data as RawProfile[] | null) ?? []).filter((row) => row?.id);

        const resolved = await Promise.all(
          rows.map(async (row): Promise<SafeNode | null> => {
            let lat = typeof row.lat === "number" ? row.lat : null;
            let lon = typeof row.lon === "number" ? row.lon : null;
            let source: "stored" | "geocoded" = "stored";

            if (lat == null || lon == null) {
              const query = [String(row.city ?? "").trim(), String(row.country ?? "").trim()]
                .filter(Boolean)
                .join(", ");

              if (query) {
                try {
                  const geocoded = await geocodePlace(query);
                  if (geocoded) {
                    lat = geocoded.latitude;
                    lon = geocoded.longitude;
                    source = "geocoded";
                  }
                } catch {
                  // Ignore geocoding failures.
                }
              }
            }

            if (lat == null || lon == null) return null;

            const safe = obfuscateNodeLocation(lat, lon, row.id);

            return {
              id: row.id,
              lat: safe.lat,
              lon: safe.lon,
              active: isActiveNow(row, currentUserId),
              isCurrentUser: row.id === currentUserId,
              city: row.city ?? null,
              country: row.country ?? null,
              label: buildLocationLabel(row.city ?? null, row.country ?? null),
              source,
            };
          })
        );

        if (!alive) return;

        const safeNodes = resolved.filter(Boolean) as SafeNode[];
        const currentNode =
          safeNodes.find((node) => node.isCurrentUser) ??
          (safeNodes.length > 0 ? safeNodes[0] : null);

        setNodes(safeNodes);
        setFocusNode(currentNode ? { lat: currentNode.lat, lon: currentNode.lon } : null);
      } catch (loadError: any) {
        console.error("Failed to load globe nodes:", loadError);
        if (!alive) return;
        setNodes([]);
        setFocusNode(null);
        setError(loadError?.message ?? "Unable to load globe nodes.");
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
        scene.fog = new THREE.FogExp2(0x020814, 0.013);

        const width = container.clientWidth || 1000;
        const height = container.clientHeight || (isMobile ? 620 : 640);

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
        controls.rotateSpeed = isMobile ? 0.52 : 0.62;
        controls.zoomSpeed = isMobile ? 0.72 : 0.82;
        controls.minDistance = 7.2;
        controls.maxDistance = 17;
        controls.target.set(0, 0, 0);

        const ambient = new THREE.AmbientLight(0xbfe7ff, 0.54);
        scene.add(ambient);

        const hemisphere = new THREE.HemisphereLight(0xa8e2ff, 0x04101c, 1.1);
        scene.add(hemisphere);

        const keyLight = new THREE.DirectionalLight(0xffffff, 1.35);
        keyLight.position.set(8, 4, 10);
        scene.add(keyLight);

        const fillLight = new THREE.DirectionalLight(0x5ab8ff, 0.48);
        fillLight.position.set(-9, -2, -7);
        scene.add(fillLight);

        const rimLight = new THREE.DirectionalLight(0x7cecff, 0.72);
        rimLight.position.set(-8, 1, 6);
        scene.add(rimLight);

        const starsGeometry = new THREE.BufferGeometry();
        const stars: number[] = [];
        for (let i = 0; i < 950; i += 1) {
          const range = 78;
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
            color: 0xcfe8ff,
            size: 0.048,
            transparent: true,
            opacity: 0.82,
            depthWrite: false,
          })
        );
        scene.add(starField);

        const milkyWayGeometry = new THREE.BufferGeometry();
        const milkyWayPoints: number[] = [];
        for (let i = 0; i < 2400; i += 1) {
          const angle = (Math.random() - 0.5) * Math.PI * 1.45;
          const radiusBand = 22 + (Math.random() - 0.5) * 10;
          const thickness = (Math.random() - 0.5) * 3.2;
          const spread = (Math.random() - 0.5) * 1.2;

          const x = Math.cos(angle) * radiusBand;
          const z = Math.sin(angle) * radiusBand;
          const y = thickness;

          milkyWayPoints.push(x, y + spread, z);
        }
        milkyWayGeometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(milkyWayPoints, 3)
        );
        const milkyWayBand = new THREE.Points(
          milkyWayGeometry,
          new THREE.PointsMaterial({
            color: 0xbfd8ff,
            size: 0.065,
            transparent: true,
            opacity: 0.2,
            depthWrite: false,
          })
        );
        milkyWayBand.rotation.z = -0.42;
        milkyWayBand.rotation.x = 0.26;
        scene.add(milkyWayBand);

        const globeGroup = new THREE.Group();
        scene.add(globeGroup);

        const radius = isMobile ? 3.72 : 3.48;

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
          opacity: 0.96,
          depthTest: false,
          depthWrite: false,
        });

        const activeNodeMaterial = new THREE.MeshBasicMaterial({
          color: 0x8f6cff,
          transparent: true,
          opacity: 0.98,
          depthTest: false,
          depthWrite: false,
        });

        const idleGlowMaterial = new THREE.MeshBasicMaterial({
          color: 0x57d9ff,
          transparent: true,
          opacity: 0.14,
          depthTest: false,
          depthWrite: false,
        });

        const activeGlowMaterial = new THREE.MeshBasicMaterial({
          color: 0x8f6cff,
          transparent: true,
          opacity: 0.22,
          depthTest: false,
          depthWrite: false,
        });

        const nodeGeometry = new THREE.SphereGeometry(0.019, 10, 10);
        const nodeGlowGeometry = new THREE.SphereGeometry(0.046, 10, 10);

        nodes.forEach((node) => {
          const pos = latLonToVector3(THREE, node.lat, node.lon, radius * 1.0015);

          const glow = new THREE.Mesh(
            nodeGlowGeometry,
            node.active ? activeGlowMaterial : idleGlowMaterial
          );
          glow.position.copy(pos);
          glow.renderOrder = 10;

          const marker = new THREE.Mesh(
            nodeGeometry,
            node.active ? activeNodeMaterial : idleNodeMaterial
          );
          marker.position.copy(pos);
          marker.renderOrder = 11;

          nodeGroup.add(glow);
          nodeGroup.add(marker);
        });

        if (focusNode) {
          globeGroup.rotation.y = ((-focusNode.lon + 90) * Math.PI) / 180;
          globeGroup.rotation.x = (((focusNode.lat || 0) * Math.PI) / 180) * 0.16;
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
          milkyWayBand.rotation.y -= 0.00004;
          renderer.render(scene, camera);
        };

        animate();

        resizeHandler = () => {
          if (!container || !camera || !renderer) return;
          const nextWidth = container.clientWidth || 1000;
          const nextHeight = container.clientHeight || (isMobile ? 620 : 640);
          camera.aspect = nextWidth / nextHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(nextWidth, nextHeight);
        };

        window.addEventListener("resize", resizeHandler);
      } catch (buildError) {
        console.error("Failed to initialize globe renderer:", buildError);
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
                if (material?.specularMap && typeof material.specularMap.dispose === "function") {
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
  }, [nodes, focusNode, isMobile]);

  return (
    <div className={`pageStack device-${device.deviceClass}`}>
      <style>{`
        .arrayPageIntro{
          margin-bottom: 10px;
        }

        .arrayGlobeShell{
          width:100%;
          min-height:620px;
          border-radius:28px;
          position:relative;
          overflow:hidden;
          background:
            radial-gradient(circle at 18% 14%, rgba(120, 88, 255, .16), transparent 18%),
            radial-gradient(circle at 78% 18%, rgba(112, 178, 255, .18), transparent 20%),
            radial-gradient(ellipse at 50% 44%, rgba(198, 222, 255, .10), transparent 18%),
            radial-gradient(ellipse at 56% 52%, rgba(112, 92, 255, .10), transparent 24%),
            linear-gradient(180deg, rgba(1,8,22,.98), rgba(1,6,18,1));
          border:1px solid rgba(95,177,255,.16);
          box-shadow:
            inset 0 0 0 1px rgba(255,255,255,.02),
            inset 0 0 180px rgba(77,92,255,.05),
            0 30px 80px rgba(0,0,0,.38);
        }

        .arrayGlobeInner{
          position:absolute;
          inset:22px;
          border-radius:24px;
          overflow:hidden;
          background:
            radial-gradient(ellipse at 38% 24%, rgba(255,255,255,.06), transparent 16%),
            radial-gradient(ellipse at 50% 44%, rgba(145, 159, 255, .09), transparent 18%),
            radial-gradient(ellipse at 60% 50%, rgba(179, 214, 255, .07), transparent 16%),
            radial-gradient(circle at 22% 18%, rgba(92,214,255,.08), transparent 20%),
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
          left:16px;
          top:16px;
          z-index:2;
          display:flex;
          gap:8px;
          flex-wrap:wrap;
          pointer-events:none;
          max-width:calc(100% - 32px);
        }

        .arrayGlobeLegend{
          display:inline-flex;
          align-items:center;
          gap:8px;
          min-height:34px;
          padding:0 12px;
          border-radius:999px;
          background:rgba(7,14,28,.60);
          border:1px solid rgba(255,255,255,.06);
          color:rgba(255,255,255,.86);
          font-size:11px;
          font-weight:700;
          letter-spacing:.08em;
          text-transform:uppercase;
          backdrop-filter: blur(10px);
          box-shadow: inset 0 0 24px rgba(255,255,255,.02);
          white-space:nowrap;
        }

        .arrayLegendDot{
          width:10px;
          height:10px;
          border-radius:50%;
          display:inline-block;
          box-shadow:0 0 18px currentColor;
          flex:0 0 auto;
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
          right:16px;
          bottom:16px;
          z-index:2;
          padding:12px 14px;
          border-radius:16px;
          background:rgba(7,14,28,.64);
          border:1px solid rgba(255,255,255,.06);
          color:rgba(255,255,255,.76);
          font-size:11px;
          line-height:1.45;
          max-width:360px;
          backdrop-filter: blur(10px);
          pointer-events:none;
          box-shadow: inset 0 0 26px rgba(255,255,255,.02);
        }

        .pageTitle{
          margin:0 0 6px 0;
        }

        .pageText{
          margin:0;
        }

        .heroPanel{
          margin-bottom:12px;
        }

        .eyebrow{
          font-size:12px;
          letter-spacing:.3em;
          text-transform:uppercase;
          color:rgba(83, 221, 255, .88);
          margin-bottom:8px;
        }

        .arrayMetaRow{
          display:flex;
          gap:10px;
          flex-wrap:wrap;
          margin-top:10px;
        }

        .arrayMetaChip{
          display:inline-flex;
          align-items:center;
          min-height:28px;
          padding:0 10px;
          border-radius:999px;
          font-size:11px;
          letter-spacing:.08em;
          text-transform:uppercase;
          color:rgba(255,255,255,.84);
          background:rgba(255,255,255,.04);
          border:1px solid rgba(255,255,255,.06);
        }

        @media (max-width: 960px){
          .arrayGlobeShell{
            min-height:560px;
          }
        }

        @media (max-width: 720px){
          .heroPanel{
            padding:16px;
            margin-bottom:10px;
          }

          .eyebrow{
            margin-bottom:6px;
          }

          .pageTitle{
            font-size:clamp(26px, 8vw, 42px);
            line-height:1.02;
            margin-bottom:6px;
          }

          .pageText{
            font-size:13px;
            line-height:1.45;
          }

          .arrayMetaRow{
            margin-top:8px;
            gap:8px;
          }

          .arrayMetaChip{
            min-height:26px;
            padding:0 9px;
            font-size:10px;
          }

          .arrayGlobeShell{
            min-height:620px;
            border-radius:24px;
          }

          .arrayGlobeInner{
            inset:12px;
            border-radius:20px;
          }

          .arrayGlobeHud{
            left:12px;
            top:12px;
            gap:6px;
            max-width:calc(100% - 24px);
          }

          .arrayGlobeLegend{
            min-height:30px;
            padding:0 10px;
            font-size:10px;
            gap:7px;
          }

          .arrayLegendDot{
            width:9px;
            height:9px;
          }

          .arrayGlobeFooter{
            left:12px;
            right:12px;
            bottom:12px;
            max-width:none;
            padding:10px 12px;
            font-size:10px;
            line-height:1.4;
            border-radius:14px;
          }
        }

        @media (max-width: 520px){
          .heroPanel{
            padding:14px;
          }

          .pageTitle{
            font-size:clamp(22px, 9vw, 30px);
          }

          .pageText{
            font-size:12px;
          }

          .arrayGlobeShell{
            min-height:640px;
          }

          .arrayGlobeInner{
            inset:10px;
          }

          .arrayGlobeHud{
            flex-direction:column;
            align-items:flex-start;
          }

          .arrayGlobeLegend{
            min-height:28px;
            padding:0 9px;
            font-size:9px;
          }

          .arrayGlobeFooter{
            font-size:10px;
          }
        }
      `}</style>

      <section className="heroPanel arrayPageIntro">
        <div className="eyebrow">Network View</div>
        <h1 className="pageTitle">
          {isMobile ? "Live Nodes." : "Live nodes from actual profile data."}
        </h1>
       
        <div className="arrayMetaRow">
          <span className="arrayMetaChip">
            {loadingNodes ? "Syncing nodes" : `${nodes.length} visible nodes`}
          </span>
          <span className="arrayMetaChip">
            {sessionUserId ? "Centered on your node" : "Network overview"}
          </span>
        </div>
      </section>

      {error ? <div className="alert error">{error}</div> : null}

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
              Drag to rotate. Scroll to zoom. Locations remain rounded and slightly offset so exact
              addresses cannot be inferred.
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
