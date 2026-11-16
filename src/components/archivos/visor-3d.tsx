"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * Visor 3D de la biblioteca (docs/sdd/012): STL, 3MF y OBJ, girando con el mouse. Se carga recién
 * cuando se abre (three.js es pesado). `onMiniatura` recibe un PNG del primer cuadro, para guardar
 * la miniatura del archivo.
 */
export function Visor3d({ url, extension, onMiniatura }: { url: string; extension: string; onMiniatura?: (png: Blob) => void }) {
  const caja = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<"cargando" | "listo" | "error">("cargando");
  const [error, setError] = useState("");

  useEffect(() => {
    let vigente = true;
    let limpiar = () => {};
    (async () => {
      try {
        const THREE = await import("three");
        const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
        const el = caja.current;
        if (!el || !vigente) return;

        const ancho = el.clientWidth;
        const alto = el.clientHeight;
        const escena = new THREE.Scene();
        const camara = new THREE.PerspectiveCamera(40, ancho / alto, 0.1, 100000);
        const render = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        render.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        render.setSize(ancho, alto);
        el.appendChild(render.domElement);

        // Luz de taller: una general y dos direccionales, sin colores.
        escena.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.6));
        const luz = new THREE.DirectionalLight(0xffffff, 1.4);
        luz.position.set(1, 2, 1.5);
        escena.add(luz);
        const contra = new THREE.DirectionalLight(0xffffff, 0.5);
        contra.position.set(-1.5, -0.5, -1);
        escena.add(contra);

        // El material: el naranja filamento del ERP, mate.
        const material = new THREE.MeshStandardMaterial({ color: 0xd9733b, roughness: 0.55, metalness: 0.05 });
        let objeto: import("three").Object3D;
        const ext = extension.toLowerCase();
        if (ext === "stl") {
          const { STLLoader } = await import("three/examples/jsm/loaders/STLLoader.js");
          const geo = await new STLLoader().loadAsync(url);
          geo.computeVertexNormals();
          objeto = new THREE.Mesh(geo, material);
          // Los STL vienen con Z hacia arriba (la cama de impresión).
          objeto.rotation.x = -Math.PI / 2;
        } else if (ext === "3mf") {
          const { ThreeMFLoader } = await import("three/examples/jsm/loaders/3MFLoader.js");
          objeto = await new ThreeMFLoader().loadAsync(url);
          objeto.traverse((o) => {
            if ((o as import("three").Mesh).isMesh) (o as import("three").Mesh).material = material;
          });
          objeto.rotation.x = -Math.PI / 2;
        } else {
          const { OBJLoader } = await import("three/examples/jsm/loaders/OBJLoader.js");
          objeto = await new OBJLoader().loadAsync(url);
          objeto.traverse((o) => {
            if ((o as import("three").Mesh).isMesh) (o as import("three").Mesh).material = material;
          });
        }
        if (!vigente) return;
        escena.add(objeto);

        // Encuadre: el objeto centrado y entero.
        const bbox = new THREE.Box3().setFromObject(objeto);
        const centro = bbox.getCenter(new THREE.Vector3());
        const tamano = bbox.getSize(new THREE.Vector3()).length();
        objeto.position.sub(centro);
        camara.position.set(tamano * 0.7, tamano * 0.5, tamano * 0.9);
        camara.near = tamano / 100;
        camara.far = tamano * 100;
        camara.updateProjectionMatrix();

        const controles = new OrbitControls(camara, render.domElement);
        controles.enableDamping = true;
        controles.autoRotate = true;
        controles.autoRotateSpeed = 1.2;
        controles.addEventListener("start", () => (controles.autoRotate = false));

        let cuadro = 0;
        let pedido = 0;
        const animar = () => {
          controles.update();
          render.render(escena, camara);
          // La miniatura sale del primer cuadro ya dibujado.
          if (++cuadro === 2 && onMiniatura) render.domElement.toBlob((b) => b && onMiniatura(b), "image/png");
          pedido = requestAnimationFrame(animar);
        };
        animar();
        setEstado("listo");

        const alCambiar = () => {
          const w = el.clientWidth;
          const h = el.clientHeight;
          camara.aspect = w / h;
          camara.updateProjectionMatrix();
          render.setSize(w, h);
        };
        const obs = new ResizeObserver(alCambiar);
        obs.observe(el);

        limpiar = () => {
          cancelAnimationFrame(pedido);
          obs.disconnect();
          controles.dispose();
          render.dispose();
          render.domElement.remove();
          objeto.traverse((o) => (o as import("three").Mesh).geometry?.dispose?.());
          material.dispose();
        };
      } catch (e) {
        if (!vigente) return;
        setError(e instanceof Error ? e.message : String(e));
        setEstado("error");
      }
    })();
    return () => {
      vigente = false;
      limpiar();
    };
    // onMiniatura se usa una sola vez; recargar el visor por un callback nuevo no tiene sentido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, extension]);

  return (
    <div ref={caja} className="relative h-full w-full cursor-grab overflow-hidden rounded-lg bg-muted/40 active:cursor-grabbing">
      {estado === "cargando" && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando el modelo
        </div>
      )}
      {estado === "error" && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">No se pudo mostrar este archivo{error ? `: ${error.slice(0, 120)}` : ""}</div>
      )}
    </div>
  );
}
