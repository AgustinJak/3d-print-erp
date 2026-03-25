export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

const DEFAULT_CONFIG_SENDERO3D = {
  socios: [
    { nombre: "Agustin Jaksetic", porcentaje: 50 },
    { nombre: "Taiel Cleiman", porcentaje: 50 },
  ],
};

const DEFAULT_CONFIG_SHAYJUGUETES = {
  socios: [
    { nombre: "ShayJuguetes", porcentaje: 100 },
  ],
};

const DEFAULT_CONFIG_DEMO = {
  socios: [
    { nombre: "Lucas Fernández", porcentaje: 50 },
    { nombre: "Martina Soria", porcentaje: 50 },
  ],
};

function getDefaultConfig(tenantId: string) {
  if (tenantId === "sendero3d") return DEFAULT_CONFIG_SENDERO3D;
  if (tenantId === "shayjuguetes") return DEFAULT_CONFIG_SHAYJUGUETES;
  return DEFAULT_CONFIG_DEMO;
}

export async function GET() {
  try {
    const { tenantId } = await getAuthenticatedTenant();

    let config = await prisma.configTenant.findUnique({ where: { tenantId } });

    if (!config) {
      config = await prisma.configTenant.create({
        data: { tenantId, data: getDefaultConfig(tenantId) },
      });
    }

    return NextResponse.json(config.data);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const body = await request.json();

    const config = await prisma.configTenant.upsert({
      where: { tenantId },
      update: { data: body },
      create: { tenantId, data: body },
    });

    return NextResponse.json(config.data);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
