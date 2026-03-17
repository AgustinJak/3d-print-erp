export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextResponse } from "next/server";

interface SugerenciaSeed {
  nombre: string;
  tipoProducto: string;
  potencialVenta: number;
  dificultad: string;
  ventanaInicio: string;
}

interface EventoSeed {
  fuenteId: string;
  titulo: string;
  tipo: string;
  fecha: string;
  nivelViral: string;
  descripcion: string;
  sugerencias: SugerenciaSeed[];
}

const CALENDARIO_AR_2026: EventoSeed[] = [
  {
    fuenteId: "ar-2026-san-valentin",
    titulo: "San Valentín",
    tipo: "fecha_comercial",
    fecha: "2026-02-14",
    nivelViral: "medio",
    descripcion: "Día de los Enamorados - oportunidad para productos temáticos de amor y parejas",
    sugerencias: [
      { nombre: "Porta anillos corazón", tipoProducto: "decoracion", potencialVenta: 2, dificultad: "baja", ventanaInicio: "2 semanas antes" },
      { nombre: "Lámpara corazón", tipoProducto: "funcional", potencialVenta: 2, dificultad: "media", ventanaInicio: "2 semanas antes" },
    ],
  },
  {
    fuenteId: "ar-2026-dia-padre",
    titulo: "Día del Padre",
    tipo: "fecha_comercial",
    fecha: "2026-06-21",
    nivelViral: "alto",
    descripcion: "Día del Padre - alta demanda de productos funcionales y organizadores",
    sugerencias: [
      { nombre: "Soporte auriculares", tipoProducto: "funcional", potencialVenta: 3, dificultad: "baja", ventanaInicio: "2 semanas antes" },
      { nombre: "Organizador escritorio", tipoProducto: "funcional", potencialVenta: 2, dificultad: "media", ventanaInicio: "2 semanas antes" },
      { nombre: "Soporte celular", tipoProducto: "funcional", potencialVenta: 2, dificultad: "baja", ventanaInicio: "2 semanas antes" },
    ],
  },
  {
    fuenteId: "ar-2026-dia-nino",
    titulo: "Día del Niño",
    tipo: "fecha_comercial",
    fecha: "2026-08-16",
    nivelViral: "explosivo",
    descripcion: "Día del Niño - demanda explosiva de juguetes y figuras",
    sugerencias: [
      { nombre: "Espadas de juguete", tipoProducto: "replica", potencialVenta: 3, dificultad: "media", ventanaInicio: "2 semanas antes" },
      { nombre: "Porta lápices temático", tipoProducto: "funcional", potencialVenta: 2, dificultad: "baja", ventanaInicio: "2 semanas antes" },
      { nombre: "Mini figuras articuladas", tipoProducto: "replica", potencialVenta: 2, dificultad: "media", ventanaInicio: "2 semanas antes" },
    ],
  },
  {
    fuenteId: "ar-2026-dia-madre",
    titulo: "Día de la Madre",
    tipo: "fecha_comercial",
    fecha: "2026-10-18",
    nivelViral: "explosivo",
    descripcion: "Día de la Madre - máxima demanda de productos decorativos y regalos",
    sugerencias: [
      { nombre: "Joyero decorativo", tipoProducto: "decoracion", potencialVenta: 3, dificultad: "media", ventanaInicio: "2 semanas antes" },
      { nombre: "Maceta decorativa", tipoProducto: "decoracion", potencialVenta: 2, dificultad: "baja", ventanaInicio: "2 semanas antes" },
      { nombre: "Porta velas", tipoProducto: "decoracion", potencialVenta: 2, dificultad: "baja", ventanaInicio: "2 semanas antes" },
    ],
  },
  {
    fuenteId: "ar-2026-halloween",
    titulo: "Halloween",
    tipo: "fecha_comercial",
    fecha: "2026-10-31",
    nivelViral: "alto",
    descripcion: "Halloween - demanda de disfraces, decoración temática y accesorios",
    sugerencias: [
      { nombre: "Máscaras temáticas", tipoProducto: "replica", potencialVenta: 3, dificultad: "media", ventanaInicio: "2 semanas antes" },
      { nombre: "Decoración calaveras", tipoProducto: "decoracion", potencialVenta: 2, dificultad: "baja", ventanaInicio: "2 semanas antes" },
      { nombre: "Porta velas Halloween", tipoProducto: "decoracion", potencialVenta: 2, dificultad: "baja", ventanaInicio: "2 semanas antes" },
    ],
  },
  {
    fuenteId: "ar-2026-navidad",
    titulo: "Navidad",
    tipo: "fecha_comercial",
    fecha: "2026-12-25",
    nivelViral: "explosivo",
    descripcion: "Navidad - máxima demanda de adornos, decoración y regalos",
    sugerencias: [
      { nombre: "Adornos para árbol", tipoProducto: "decoracion", potencialVenta: 3, dificultad: "baja", ventanaInicio: "2 semanas antes" },
      { nombre: "Porta velas navideño", tipoProducto: "decoracion", potencialVenta: 2, dificultad: "baja", ventanaInicio: "2 semanas antes" },
      { nombre: "Soporte luces LED", tipoProducto: "funcional", potencialVenta: 2, dificultad: "media", ventanaInicio: "2 semanas antes" },
    ],
  },
  {
    fuenteId: "ar-2026-ano-nuevo",
    titulo: "Año Nuevo",
    tipo: "fecha_comercial",
    fecha: "2026-12-31",
    nivelViral: "alto",
    descripcion: "Año Nuevo - demanda de decoración festiva y productos temáticos",
    sugerencias: [
      { nombre: "Números 2027 decorativos", tipoProducto: "decoracion", potencialVenta: 2, dificultad: "baja", ventanaInicio: "2 semanas antes" },
      { nombre: "Porta copas", tipoProducto: "funcional", potencialVenta: 2, dificultad: "media", ventanaInicio: "2 semanas antes" },
    ],
  },
];

export async function POST() {
  try {
    const { tenantId } = await getAuthenticatedTenant();

    const results = await Promise.all(
      CALENDARIO_AR_2026.map((evento) =>
        prisma.eventoTendencia.upsert({
          where: {
            tenantId_fuente_fuenteId: {
              tenantId,
              fuente: "calendario_ar",
              fuenteId: evento.fuenteId,
            },
          },
          update: {
            titulo: evento.titulo,
            tipo: evento.tipo,
            fecha: new Date(evento.fecha),
            nivelViral: evento.nivelViral,
            descripcion: evento.descripcion,
            activo: true,
          },
          create: {
            tenantId,
            titulo: evento.titulo,
            tipo: evento.tipo,
            fecha: new Date(evento.fecha),
            nivelViral: evento.nivelViral,
            descripcion: evento.descripcion,
            fuente: "calendario_ar",
            fuenteId: evento.fuenteId,
            sugerencias: {
              create: evento.sugerencias,
            },
          },
          include: { sugerencias: true },
        })
      )
    );

    return NextResponse.json({
      message: `Calendario argentino 2026 sembrado: ${results.length} eventos`,
      eventos: results,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
