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

function seededRandom(seed: string) {
  let state = hashString(seed) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
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

function drawPolygon(
  ctx: CanvasRenderingContext2D,
  polygon: Array<[number, number]>,
  width: number,
  height: number
) {
  if (!polygon.length) return;

  ctx.beginPath();
  ctx.moveTo(polygon[0][0] * width, polygon[0][1] * height);

  for (let i = 1; i < polygon.length; i += 1) {
    ctx.lineTo(polygon[i][0] * width, polygon[i][1] * height);
  }

  ctx.closePath();
}

function pathEllipse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number
) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
}

function createEarthTextureCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 4096;
  canvas.height = 2048;

  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const { width, height } = canvas;

  const ocean = ctx.createLinearGradient(0, 0, width, height);
  ocean.addColorStop(0, "#03152d");
  ocean.addColorStop(0.28, "#08264b");
  ocean.addColorStop(0.55, "#0a315f");
  ocean.addColorStop(0.78, "#071f40");
  ocean.addColorStop(1, "#020d1e");
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, width, height);

  const glowA = ctx.createRadialGradient(width * 0.27, height * 0.42, 0, width * 0.27, height * 0.42, width * 0.38);
  glowA.addColorStop(0, "rgba(65, 212, 255, 0.18)");
  glowA.addColorStop(1, "rgba(65, 212, 255, 0)");
  ctx.fillStyle = glowA;
  ctx.fillRect(0, 0, width, height);

  const glowB = ctx.createRadialGradient(width * 0.73, height * 0.55, 0, width * 0.73, height * 0.55, width * 0.42);
  glowB.addColorStop(0, "rgba(95, 115, 255, 0.16)");
  glowB.addColorStop(1, "rgba(95, 115, 255, 0)");
  ctx.fillStyle = glowB;
  ctx.fillRect(0, 0, width, height);

  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = "#7fd8ff";
  ctx.lineWidth = 2;

  for (let i = 1; i < 12; i += 1) {
    const y = (height / 12) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  for (let i = 1; i < 24; i += 1) {
    const x = (width / 24) * i;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;

  const landPolygons: Array<Array<[number, number]>> = [
    // North America
    [
      [0.058, 0.233],[0.084, 0.178],[0.127, 0.136],[0.166, 0.115],[0.214, 0.103],[0.258, 0.115],
      [0.291, 0.145],[0.313, 0.183],[0.325, 0.232],[0.319, 0.277],[0.295, 0.314],[0.265, 0.337],
      [0.245, 0.367],[0.22, 0.396],[0.181, 0.412],[0.146, 0.401],[0.123, 0.381],[0.103, 0.36],
      [0.082, 0.321],[0.065, 0.281]
    ],
    // Greenland
    [
      [0.257, 0.066],[0.29, 0.051],[0.322, 0.061],[0.342, 0.089],[0.333, 0.126],[0.301, 0.145],
      [0.267, 0.133],[0.248, 0.102]
    ],
    // Central America
    [
      [0.245, 0.388],[0.267, 0.395],[0.286, 0.408],[0.294, 0.428],[0.28, 0.44],[0.259, 0.43],[0.239, 0.412]
    ],
    // South America
    [
      [0.279, 0.432],[0.305, 0.462],[0.324, 0.511],[0.333, 0.564],[0.328, 0.621],[0.317, 0.691],
      [0.299, 0.759],[0.278, 0.826],[0.259, 0.873],[0.238, 0.9],[0.219, 0.878],[0.209, 0.827],
      [0.206, 0.759],[0.212, 0.682],[0.226, 0.605],[0.241, 0.539],[0.258, 0.478]
    ],
    // Europe
    [
      [0.403, 0.174],[0.433, 0.158],[0.471, 0.157],[0.507, 0.169],[0.525, 0.19],[0.519, 0.214],
      [0.488, 0.228],[0.455, 0.225],[0.427, 0.214],[0.405, 0.193]
    ],
    // Africa
    [
      [0.459, 0.271],[0.493, 0.298],[0.526, 0.344],[0.545, 0.405],[0.553, 0.471],[0.549, 0.55],
      [0.536, 0.617],[0.512, 0.688],[0.487, 0.738],[0.46, 0.774],[0.438, 0.746],[0.425, 0.695],
      [0.418, 0.625],[0.419, 0.55],[0.426, 0.476],[0.438, 0.397],[0.448, 0.338]
    ],
    // Asia
    [
      [0.498, 0.158],[0.547, 0.147],[0.603, 0.153],[0.664, 0.17],[0.722, 0.19],[0.78, 0.211],
      [0.83, 0.247],[0.867, 0.286],[0.893, 0.327],[0.911, 0.372],[0.918, 0.418],[0.906, 0.455],
      [0.879, 0.473],[0.842, 0.465],[0.809, 0.447],[0.773, 0.429],[0.734, 0.419],[0.699, 0.412],
      [0.666, 0.403],[0.628, 0.393],[0.588, 0.381],[0.552, 0.366],[0.523, 0.34],[0.507, 0.304],
      [0.495, 0.257]
    ],
    // Arabian Peninsula
    [
      [0.577, 0.386],[0.607, 0.408],[0.628, 0.441],[0.621, 0.478],[0.589, 0.485],[0.566, 0.455],[0.56, 0.414]
    ],
    // India
    [
      [0.648, 0.414],[0.677, 0.431],[0.697, 0.468],[0.693, 0.511],[0.674, 0.542],[0.649, 0.526],[0.638, 0.487]
    ],
    // Southeast Asia
    [
      [0.705, 0.425],[0.735, 0.441],[0.759, 0.472],[0.757, 0.511],[0.735, 0.535],[0.707, 0.522],[0.695, 0.489]
    ],
    // Japan
    [
      [0.845, 0.332],[0.855, 0.353],[0.853, 0.381],[0.842, 0.398],[0.832, 0.378],[0.836, 0.348]
    ],
    // Indonesia
    [
      [0.697, 0.557],[0.726, 0.566],[0.754, 0.574],[0.779, 0.585],[0.764, 0.598],[0.732, 0.594],[0.705, 0.582]
    ],
    // Australia
    [
      [0.759, 0.656],[0.792, 0.667],[0.831, 0.688],[0.851, 0.722],[0.845, 0.761],[0.818, 0.786],
      [0.778, 0.789],[0.737, 0.772],[0.718, 0.738],[0.724, 0.699]
    ],
    // Madagascar
    [
      [0.555, 0.723],[0.566, 0.744],[0.567, 0.777],[0.557, 0.806],[0.546, 0.783],[0.546, 0.744]
    ],
    // UK
    [
      [0.413, 0.168],[0.425, 0.161],[0.431, 0.179],[0.422, 0.196],[0.41, 0.189]
    ],
    // New Zealand
    [
      [0.875, 0.807],[0.886, 0.827],[0.88, 0.851],[0.868, 0.839]
    ],
    // Antarctica
    [
      [0.088, 0.92],[0.164, 0.908],[0.247, 0.904],[0.343, 0.911],[0.433, 0.908],[0.529, 0.902],
      [0.637, 0.907],[0.739, 0.918],[0.835, 0.932],[0.905, 0.951],[0.873, 0.975],[0.126, 0.975],[0.081, 0.947]
    ]
  ];

  const fillLand = ctx.createLinearGradient(0, 0, width, height);
  fillLand.addColorStop(0, "#0f5f85");
  fillLand.addColorStop(0.34, "#19adc9");
  fillLand.addColorStop(0.66, "#36d7ff");
  fillLand.addColorStop(1, "#6be7ff");

  ctx.save();
  ctx.fillStyle = fillLand;
  ctx.strokeStyle = "rgba(176, 245, 255, 0.92)";
  ctx.lineWidth = 5;
  ctx.shadowColor = "rgba(95, 228, 255, 0.7)";
  ctx.shadowBlur = 22;

  landPolygons.forEach((polygon) => {
    drawPolygon(ctx, polygon, width, height);
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 2.5;
  ctx.shadowColor = "rgba(255,255,255,0.34)";
  ctx.shadowBlur = 10;
  landPolygons.forEach((polygon) => {
    drawPolygon(ctx, polygon, width, height);
    ctx.stroke();
  });
  ctx.restore();

  // land dot field
  ctx.save();
  landPolygons.forEach((polygon, polygonIndex) => {
    const xs = polygon.map((p) => p[0] * width);
    const ys = polygon.map((p) => p[1] * height);
    const minX = Math.max(0, Math.floor(Math.min(...xs)));
    const maxX = Math.min(width, Math.ceil(Math.max(...xs)));
    const minY = Math.max(0, Math.floor(Math.min(...ys)));
    const maxY = Math.min(height, Math.ceil(Math.max(...ys)));

    ctx.save();
    drawPolygon(ctx, polygon, width, height);
    ctx.clip();

    const rand = seededRandom(`land-dots-${polygonIndex}`);
    for (let i = 0; i < 1100; i += 1) {
      const x = minX + rand() * (maxX - minX);
      const y = minY + rand() * (maxY - minY);
      const r = 0.6 + rand() * 1.9;

      const alpha = 0.16 + rand() * 0.36;
      ctx.beginPath();
      ctx.fillStyle = `rgba(212, 253, 255, ${alpha})`;
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  });
  ctx.restore();

  // bright nodes / hubs
  const hubs = [
    [0.154, 0.214],[0.236, 0.286],[0.273, 0.227],[0.292, 0.67],
    [0.428, 0.191],[0.509, 0.283],[0.533, 0.512],[0.573, 0.319],
    [0.635, 0.284],[0.688, 0.314],[0.742, 0.354],[0.8, 0.71],
    [0.845, 0.366],[0.889, 0.418]
  ];

  ctx.save();
  hubs.forEach(([nx, ny], idx) => {
    const x = nx * width;
    const y = ny * height;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, 28 + (idx % 3) * 10);
    glow.addColorStop(0, "rgba(255,255,255,0.95)");
    glow.addColorStop(0.2, "rgba(107, 231, 255, 0.95)");
    glow.addColorStop(0.48, "rgba(62, 201, 255, 0.42)");
    glow.addColorStop(1, "rgba(62, 201, 255, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, 32 + (idx % 3) * 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = "#ffffff";
    ctx.arc(x, y, 2.6, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();

  // connection lines across the texture
  const links = [
    [0, 4],[4, 8],[8, 12],[12, 13],[8, 10],[10, 11],[4, 7],[7, 9],[7, 10],[1, 4],[2, 4],[3, 4],
    [0, 1],[5, 7],[5, 6],[6, 11],[2, 8]
  ];

  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(121, 235, 255, 0.4)";
  ctx.shadowColor = "rgba(95, 225, 255, 0.4)";
  ctx.shadowBlur = 7;

  links.forEach(([a, b]) => {
    const ax = hubs[a][0] * width;
    const ay = hubs[a][1] * height;
    const bx = hubs[b][0] * width;
    const by = hubs[b][1] * height;

    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  });
  ctx.restore();

  // subtle cloud/sheen bands
  ctx.save();
  ctx.fillStyle = "rgba(180, 240, 255, 0.08)";
  ctx.beginPath();
  ctx.ellipse(width * 0.34, height * 0.33, width * 0.18, height * 0.09, 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(width * 0.66, height * 0.54, width * 0.22, height * 0.1, -0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  return canvas;
}

function createCloudTextureCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 1024;

  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const rand = seededRandom("clouds-helvarix-globe");

  for (let i = 0; i < 80; i += 1) {
    const x = rand() * canvas.width;
    const y = rand() * canvas.height;
    const rx = 70 + rand() * 170;
    const ry = 18 + rand() * 54;
    const rot = rand() * Math.PI;
    const alpha = 0.018 + rand() * 0.04;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    grad.addColorStop(0, `rgba(255,255,255,${alpha})`);
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  return canvas;
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
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        loadNodes();
      })
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
        scene.fog = new THREE.FogExp2(0x020713, 0.016);

        const width = container.clientWidth || 1000;
        const height = container.clientHeight || 520;

        camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 1000);
        camera.position.set(0, 0.35, 11.8);

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
        controls.dampingFactor = 0.06;
        controls.enablePan = false;
        controls.enableZoom = true;
        controls.enableRotate = true;
        controls.autoRotate = false;
        controls.rotateSpeed = 0.62;
        controls.zoomSpeed = 0.8;
        controls.minDistance = 7.4;
        controls.maxDistance = 17;
        controls.target.set(0, 0, 0);

        const ambient = new THREE.AmbientLight(0xbfe9ff, 0.55);
        scene.add(ambient);

        const hemi = new THREE.HemisphereLight(0xa8e7ff, 0x040b15, 1.08);
        scene.add(hemi);

        const key = new THREE.DirectionalLight(0xd9f8ff, 1.5);
        key.position.set(8, 4, 9);
        scene.add(key);

        const fill = new THREE.DirectionalLight(0x49b7ff, 0.55);
        fill.position.set(-7, -3, -7);
        scene.add(fill);

        const rim = new THREE.DirectionalLight(0x78e9ff, 0.85);
        rim.position.set(-11, 1, 5);
        scene.add(rim);

        const earthTextureCanvas = createEarthTextureCanvas();
        const cloudTextureCanvas = createCloudTextureCanvas();

        const earthTexture = new THREE.CanvasTexture(earthTextureCanvas);
        earthTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        earthTexture.needsUpdate = true;

        const cloudTexture = new THREE.CanvasTexture(cloudTextureCanvas);
        cloudTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        cloudTexture.needsUpdate = true;

        const root = new THREE.Group();
        scene.add(root);

        const globeGroup = new THREE.Group();
        root.add(globeGroup);

        const radius = 3.42;

        const globeGeometry = new THREE.SphereGeometry(radius, 160, 160);
        const globeMaterial = new THREE.MeshStandardMaterial({
          map: earthTexture,
          color: 0xffffff,
          roughness: 0.78,
          metalness: 0.05,
          emissive: 0x04101b,
          emissiveIntensity: 0.24,
          transparent: false,
          opacity: 1
        });

        const globeMesh = new THREE.Mesh(globeGeometry, globeMaterial);
        globeGroup.add(globeMesh);

        const clouds = new THREE.Mesh(
          new THREE.SphereGeometry(radius * 1.01, 120, 120),
          new THREE.MeshPhongMaterial({
            map: cloudTexture,
            transparent: true,
            opacity: 0.18,
            depthWrite: false,
            shininess: 10,
            side: THREE.DoubleSide
          })
        );
        globeGroup.add(clouds);

        const atmosphere = new THREE.Mesh(
          new THREE.SphereGeometry(radius * 1.045, 120, 120),
          new THREE.MeshPhongMaterial({
            color: 0x56dcff,
            transparent: true,
            opacity: 0.11,
            shininess: 0,
            side: THREE.BackSide,
            depthWrite: false
          })
        );
        globeGroup.add(atmosphere);

        const halo = new THREE.Mesh(
          new THREE.SphereGeometry(radius * 1.13, 96, 96),
          new THREE.MeshBasicMaterial({
            color: 0x38a8ff,
            transparent: true,
            opacity: 0.06,
            side: THREE.BackSide,
            depthWrite: false
          })
        );
        globeGroup.add(halo);

        const starsGeometry = new THREE.BufferGeometry();
        const starPositions: number[] = [];
        for (let i = 0; i < 520; i += 1) {
          const range = 70;
          starPositions.push(
            (Math.random() - 0.5) * range,
            (Math.random() - 0.5) * range,
            (Math.random() - 0.5) * range
          );
        }
        starsGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
        const stars = new THREE.Points(
          starsGeometry,
          new THREE.PointsMaterial({
            color: 0xaedfff,
            size: 0.05,
            transparent: true,
            opacity: 0.82,
            depthWrite: false
          })
        );
        scene.add(stars);

        const orbitLayer = new THREE.Group();
        root.add(orbitLayer);

        const orbitRingMaterial = new THREE.LineBasicMaterial({
          color: 0x6de6ff,
          transparent: true,
          opacity: 0.24,
          depthWrite: false
        });

        const orbitRadii = [radius * 1.18, radius * 1.245, radius * 1.315];
        const orbitTilts = [
          [0.55, -0.18, 0.24],
          [0.24, 0.33, -0.42],
          [-0.42, 0.1, 0.6]
        ];

        const orbitSatellites: Array<{ mesh: any; angle: number; speed: number; ringIndex: number }> = [];

        orbitRadii.forEach((orbitRadius, ringIndex) => {
          const curve = new THREE.EllipseCurve(0, 0, orbitRadius, orbitRadius, 0, Math.PI * 2, false, 0);
          const points2d = curve.getPoints(160);
          const points3d = points2d.map((p: any) => new THREE.Vector3(p.x, p.y, 0));
          const geometry = new THREE.BufferGeometry().setFromPoints(points3d);
          const line = new THREE.LineLoop(geometry, orbitRingMaterial);
          line.rotation.x = orbitTilts[ringIndex][0];
          line.rotation.y = orbitTilts[ringIndex][1];
          line.rotation.z = orbitTilts[ringIndex][2];
          orbitLayer.add(line);

          for (let i = 0; i < 7; i += 1) {
            const sat = new THREE.Mesh(
              new THREE.SphereGeometry(0.028, 10, 10),
              new THREE.MeshBasicMaterial({
                color: i % 3 === 0 ? 0xffffff : 0x72e9ff,
                transparent: true,
                opacity: 0.95,
                depthWrite: false
              })
            );

            sat.userData.orbitRadius = orbitRadius;
            sat.userData.rotation = {
              x: orbitTilts[ringIndex][0],
              y: orbitTilts[ringIndex][1],
              z: orbitTilts[ringIndex][2]
            };
            orbitLayer.add(sat);

            orbitSatellites.push({
              mesh: sat,
              angle: (Math.PI * 2 * i) / 7 + ringIndex * 0.55,
              speed: 0.0012 + i * 0.00014 + ringIndex * 0.00018,
              ringIndex
            });
          }
        });

        const nodeGroup = new THREE.Group();
        globeGroup.add(nodeGroup);

        const idleMaterial = new THREE.MeshBasicMaterial({
          color: 0x57d9ff,
          transparent: true,
          opacity: 0.98,
          depthTest: false,
          depthWrite: false
        });

        const activeMaterial = new THREE.MeshBasicMaterial({
          color: 0x8f6cff,
          transparent: true,
          opacity: 1,
          depthTest: false,
          depthWrite: false
        });

        const currentMaterial = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 1,
          depthTest: false,
          depthWrite: false
        });

        const idleGlowMaterial = new THREE.MeshBasicMaterial({
          color: 0x57d9ff,
          transparent: true,
          opacity: 0.18,
          depthTest: false,
          depthWrite: false
        });

        const activeGlowMaterial = new THREE.MeshBasicMaterial({
          color: 0x8f6cff,
          transparent: true,
          opacity: 0.32,
          depthTest: false,
          depthWrite: false
        });

        const currentGlowMaterial = new THREE.MeshBasicMaterial({
          color: 0x9cf2ff,
          transparent: true,
          opacity: 0.34,
          depthTest: false,
          depthWrite: false
        });

        const nodeGeometry = new THREE.SphereGeometry(0.04, 12, 12);
        const nodeGlowGeometry = new THREE.SphereGeometry(0.1, 12, 12);

        nodes.forEach((node) => {
          const pos = latLonToVector3(THREE, node.lat, node.lon, radius * 1.012);

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
              ? currentMaterial
              : node.active
              ? activeMaterial
              : idleMaterial
          );
          marker.position.copy(pos);
          marker.renderOrder = 11;

          nodeGroup.add(glow);
          nodeGroup.add(marker);

          if (node.isCurrentUser) {
            const ringGeo = new THREE.RingGeometry(0.078, 0.108, 48);
            const ringMat = new THREE.MeshBasicMaterial({
              color: 0x9cf2ff,
              transparent: true,
              opacity: 0.8,
              side: THREE.DoubleSide,
              depthTest: false,
              depthWrite: false
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.position.copy(pos.clone().multiplyScalar(1.002));
            ring.lookAt(pos.clone().multiplyScalar(2));
            ring.renderOrder = 12;
            nodeGroup.add(ring);
          }
        });

        const arcGroup = new THREE.Group();
        globeGroup.add(arcGroup);

        const activeNodes = nodes.filter((n) => n.active);
        const arcCandidates = activeNodes.length > 1 ? activeNodes : nodes;

        if (arcCandidates.length > 1) {
          const pairCount = Math.min(12, Math.floor(arcCandidates.length / 2));
          for (let i = 0; i < pairCount; i += 1) {
            const a = arcCandidates[i % arcCandidates.length];
            const b = arcCandidates[(i * 3 + 2) % arcCandidates.length];
            if (!a || !b || a.id === b.id) continue;

            const start = latLonToVector3(THREE, a.lat, a.lon, radius * 1.02);
            const end = latLonToVector3(THREE, b.lat, b.lon, radius * 1.02);

            const mid = start.clone().add(end).multiplyScalar(0.5);
            const lift = mid.clone().normalize().multiplyScalar(radius * 1.38);

            const curve = new THREE.QuadraticBezierCurve3(start, lift, end);
            const points = curve.getPoints(48);
            const geometry = new THREE.BufferGeometry().setFromPoints(points);

            const material = new THREE.LineBasicMaterial({
              color: a.active && b.active ? 0x7ff2ff : 0x57d9ff,
              transparent: true,
              opacity: a.active && b.active ? 0.42 : 0.18,
              depthWrite: false
            });

            const line = new THREE.Line(geometry, material);
            arcGroup.add(line);
          }
        }

        if (focusNode) {
          globeGroup.rotation.y = ((-focusNode.lon + 92) * Math.PI) / 180;
          globeGroup.rotation.x = ((focusNode.lat || 0) * Math.PI) / 180 * 0.16;
        } else {
          globeGroup.rotation.y = 0.72;
          globeGroup.rotation.x = 0.08;
        }

        camera.lookAt(0, 0, 0);

        const tempVector = new THREE.Vector3();

        const animate = () => {
          if (cancelled) return;

          frameId = window.requestAnimationFrame(animate);

          controls.update();
          clouds.rotation.y += 0.00022;
          stars.rotation.y += 0.00008;

          orbitSatellites.forEach((sat) => {
            sat.angle += sat.speed;

            tempVector.set(
              Math.cos(sat.angle) * sat.mesh.userData.orbitRadius,
              Math.sin(sat.angle) * sat.mesh.userData.orbitRadius,
              0
            );

            tempVector.applyEuler(
              new THREE.Euler(
                sat.mesh.userData.rotation.x,
                sat.mesh.userData.rotation.y,
                sat.mesh.userData.rotation.z
              )
            );

            sat.mesh.position.copy(tempVector);
          });

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
                if (material && typeof material.dispose === "function") {
                  material.dispose();
                }
              });
            } else if (typeof object.material.dispose === "function") {
              object.material.dispose();
            }
          }

          if (object.material?.map && typeof object.material.map.dispose === "function") {
            object.material.map.dispose();
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
        note: "Approximate observer locations rendered on the globe"
      },
      {
        label: "Live sessions",
        value: loadingNodes ? "…" : liveSessions.toLocaleString(),
        note: "Purple nodes indicate members active in the app"
      },
      {
        label: "Best window",
        value: "21:00–02:00",
        note: "Peak local collection band"
      },
      {
        label: "Verification queue",
        value: "126",
        note: "Items awaiting review"
      }
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
          Observer density and live collection activity rendered as a clean, orbital systems view.
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
