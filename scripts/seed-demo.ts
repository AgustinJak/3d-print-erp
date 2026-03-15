/**
 * Script para poblar datos de demostración (tenant_id = 'demo').
 * Ejecutar con: npx tsx scripts/seed-demo.ts
 */

import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient();

const TENANT_DEMO = "demo";

async function main() {
  console.log("Sembrando datos demo...");

  // ==================== FILAMENTOS ====================
  const filPLA = await prisma.filamento.create({
    data: {
      tenantId: TENANT_DEMO,
      marca: "Bambu Lab",
      tipoMaterial: "PLA",
      color: "Blanco",
      tempExtrusor: 220,
      tempCama: 60,
      velocidadRec: 100,
      pesoCarreteGr: 1000,
      pesoRestanteGr: 650,
      costoPorGr: 0.08,
      notas: "PLA básico para piezas estándar",
    },
  });

  const filRESINA = await prisma.filamento.create({
    data: {
      tenantId: TENANT_DEMO,
      marca: "Elegoo",
      tipoMaterial: "Resina ABS-Like",
      color: "Gris",
      tempExtrusor: null,
      tempCama: null,
      velocidadRec: null,
      pesoCarreteGr: 500,
      pesoRestanteGr: 320,
      costoPorGr: 0.15,
      notas: "Resina para detalles finos",
    },
  });

  const filTPU = await prisma.filamento.create({
    data: {
      tenantId: TENANT_DEMO,
      marca: "eSUN",
      tipoMaterial: "TPU",
      color: "Negro",
      tempExtrusor: 230,
      tempCama: 40,
      velocidadRec: 30,
      pesoCarreteGr: 1000,
      pesoRestanteGr: 810,
      costoPorGr: 0.12,
      notas: "Flexible, ideal para fundas y accesorios",
    },
  });

  console.log(`Filamentos creados: ${filPLA.id}, ${filRESINA.id}, ${filTPU.id}`);

  // ==================== CATEGORÍAS ====================
  const catAnime = await prisma.categoria.create({
    data: {
      tenantId: TENANT_DEMO,
      nombre: "Figuras Anime",
      descripcion: "Figuras de personajes de anime y manga",
      color: "#e74c3c",
    },
  });

  const catMiniaturas = await prisma.categoria.create({
    data: {
      tenantId: TENANT_DEMO,
      nombre: "Miniaturas",
      descripcion: "Miniaturas para juegos de mesa (Warhammer, D&D, etc.)",
      color: "#8e44ad",
    },
  });

  const catLlaveros = await prisma.categoria.create({
    data: {
      tenantId: TENANT_DEMO,
      nombre: "Llaveros",
      descripcion: "Llaveros personalizados en PLA",
      color: "#f39c12",
    },
  });

  const catGaming = await prisma.categoria.create({
    data: {
      tenantId: TENANT_DEMO,
      nombre: "Accesorios Gaming",
      descripcion: "Fundas, soportes y accesorios para gamers",
      color: "#2ecc71",
    },
  });

  const catEscritorio = await prisma.categoria.create({
    data: {
      tenantId: TENANT_DEMO,
      nombre: "Escritorio",
      descripcion: "Organización y decoración para escritorio",
      color: "#3498db",
    },
  });

  console.log(`Categorías creadas: ${catAnime.id}, ${catMiniaturas.id}, ${catLlaveros.id}, ${catGaming.id}, ${catEscritorio.id}`);

  // ==================== MODELOS ====================
  const modLuffy = await prisma.modelo.create({
    data: {
      tenantId: TENANT_DEMO,
      nombre: "Luffy Gear 5",
      serie: "One Piece",
      pesoGr: 45,
      costoFab: 350,
      precioVenta: 1200,
      precioCreditoPorc: 15,
      notas: "Figura de Luffy en Gear 5, tamaño estándar 15cm",
      activo: true,
      categorias: {
        create: [{ categoriaId: catAnime.id }],
      },
    },
  });

  const modZoro = await prisma.modelo.create({
    data: {
      tenantId: TENANT_DEMO,
      nombre: "Roronoa Zoro - Enma",
      serie: "One Piece",
      pesoGr: 50,
      costoFab: 380,
      precioVenta: 1300,
      precioCreditoPorc: 15,
      notas: "Zoro con espada Enma, tamaño estándar 15cm",
      activo: true,
      categorias: {
        create: [{ categoriaId: catAnime.id }],
      },
    },
  });

  const modGoblin = await prisma.modelo.create({
    data: {
      tenantId: TENANT_DEMO,
      nombre: "Goblin Arquero",
      serie: "D&D Minis",
      pesoGr: 8,
      costoFab: 120,
      precioVenta: 500,
      precioCreditoPorc: 10,
      notas: "Miniatura en resina, alta resolución",
      activo: true,
      categorias: {
        create: [{ categoriaId: catMiniaturas.id }],
      },
    },
  });

  const modDragon = await prisma.modelo.create({
    data: {
      tenantId: TENANT_DEMO,
      nombre: "Dragón Joven",
      serie: "D&D Minis",
      pesoGr: 15,
      costoFab: 200,
      precioVenta: 750,
      precioCreditoPorc: 10,
      notas: "Dragón tamaño mediano para encuentros épicos",
      activo: true,
      categorias: {
        create: [{ categoriaId: catMiniaturas.id }],
      },
    },
  });

  const modLlaveroTriforce = await prisma.modelo.create({
    data: {
      tenantId: TENANT_DEMO,
      nombre: "Llavero Triforce",
      serie: null,
      pesoGr: 12,
      costoFab: 80,
      precioVenta: 350,
      precioCreditoPorc: 10,
      notas: "Llavero con diseño de Triforce de Zelda",
      activo: true,
      categorias: {
        create: [
          { categoriaId: catLlaveros.id },
          { categoriaId: catGaming.id },
        ],
      },
    },
  });

  const modFundaPS5 = await prisma.modelo.create({
    data: {
      tenantId: TENANT_DEMO,
      nombre: "Funda Joystick PS5",
      serie: null,
      pesoGr: 25,
      costoFab: 180,
      precioVenta: 700,
      precioCreditoPorc: 12,
      notas: "Funda TPU flexible para DualSense PS5",
      activo: true,
      categorias: {
        create: [{ categoriaId: catGaming.id }],
      },
    },
  });

  const modFundaXbox = await prisma.modelo.create({
    data: {
      tenantId: TENANT_DEMO,
      nombre: "Funda Joystick Xbox",
      serie: null,
      pesoGr: 25,
      costoFab: 180,
      precioVenta: 700,
      precioCreditoPorc: 12,
      notas: "Funda TPU flexible para control Xbox Series",
      activo: true,
      categorias: {
        create: [{ categoriaId: catGaming.id }],
      },
    },
  });

  const modOrganizador = await prisma.modelo.create({
    data: {
      tenantId: TENANT_DEMO,
      nombre: "Organizador Modular 4 Módulos",
      serie: "Organizer Pro",
      pesoGr: 150,
      costoFab: 600,
      precioVenta: 2200,
      precioCreditoPorc: 15,
      notas: "Sistema modular de organización para escritorio gamer",
      activo: true,
      categorias: {
        create: [
          { categoriaId: catEscritorio.id },
          { categoriaId: catGaming.id },
        ],
      },
    },
  });

  console.log(`Modelos creados: ${modLuffy.id}, ${modZoro.id}, ${modGoblin.id}, ${modDragon.id}, ${modLlaveroTriforce.id}, ${modFundaPS5.id}, ${modFundaXbox.id}, ${modOrganizador.id}`);

  // ==================== CLIENTES ====================
  const clienteMarcos = await prisma.cliente.create({
    data: {
      tenantId: TENANT_DEMO,
      nombre: "Marcos Villanueva",
      telefono: "1154321098",
      email: "marcos.v@gmail.com",
      direccion: "Av. Cabildo 1250, CABA",
      notas: "Cliente frecuente, le gustan las figuras de One Piece",
    },
  });

  const clienteSofia = await prisma.cliente.create({
    data: {
      tenantId: TENANT_DEMO,
      nombre: "Sofia Gutierrez",
      telefono: "1167890123",
      email: "sofi.gtz@hotmail.com",
      direccion: "San Martín 456, Quilmes",
      notas: "Pide miniaturas para D&D regularmente",
    },
  });

  const clienteRodrigo = await prisma.cliente.create({
    data: {
      tenantId: TENANT_DEMO,
      nombre: "Rodrigo Pereyra",
      telefono: "1145678901",
      email: null,
      direccion: "Corrientes 3000, CABA",
      notas: "Contacto por Instagram @rod.gamer",
    },
  });

  const clienteValentina = await prisma.cliente.create({
    data: {
      tenantId: TENANT_DEMO,
      nombre: "Valentina Ríos",
      telefono: "1178901234",
      email: "vale.rios@gmail.com",
      direccion: "Belgrano 789, Lomas de Zamora",
      notas: null,
    },
  });

  console.log(`Clientes creados: ${clienteMarcos.id}, ${clienteSofia.id}, ${clienteRodrigo.id}, ${clienteValentina.id}`);

  // ==================== PEDIDOS ====================

  // Pedido 1: Completado - Figuras de One Piece para Marcos
  const pedido1 = await prisma.pedido.create({
    data: {
      tenantId: TENANT_DEMO,
      prioridad: "MEDIA",
      clienteId: clienteMarcos.id,
      fechaPedido: new Date("2026-02-10"),
      fechaEntrega: new Date("2026-02-20"),
      estado: "COMPLETADO",
      metodoEnvio: "envio",
      metodoPago: "transferencia",
      precioEnvio: 500,
      senia: 600,
      contacto: "1154321098",
      notas: "Luffy y Zoro, tamaño estándar",
      etiquetas: ["anime", "one-piece"],
      canalVenta: "directa",
      items: {
        create: [
          {
            modeloId: modLuffy.id,
            cantidad: 1,
            precioUnitario: 1200,
            costoUnitario: 350,
            ajusteManual: 0,
          },
          {
            modeloId: modZoro.id,
            cantidad: 1,
            precioUnitario: 1300,
            costoUnitario: 380,
            ajusteManual: 0,
          },
        ],
      },
    },
  });

  // Pedido 2: En producción - Miniaturas para Sofia
  const pedido2 = await prisma.pedido.create({
    data: {
      tenantId: TENANT_DEMO,
      prioridad: "ALTA",
      clienteId: clienteSofia.id,
      fechaPedido: new Date("2026-03-05"),
      fechaEntrega: new Date("2026-03-18"),
      estado: "EN_PRODUCCION",
      metodoEnvio: "retiro",
      metodoPago: "efectivo",
      precioEnvio: 0,
      senia: 1000,
      contacto: "1167890123",
      notas: "Set de miniaturas para campaña nueva: 3 goblins y 2 dragones",
      etiquetas: ["miniaturas", "dnd"],
      canalVenta: "directa",
      items: {
        create: [
          {
            modeloId: modGoblin.id,
            cantidad: 3,
            precioUnitario: 500,
            costoUnitario: 120,
            ajusteManual: -150,
          },
          {
            modeloId: modDragon.id,
            cantidad: 2,
            precioUnitario: 750,
            costoUnitario: 200,
            ajusteManual: -100,
          },
        ],
      },
    },
  });

  // Pedido 3: Pendiente de pago - Llaveros para Rodrigo
  const pedido3 = await prisma.pedido.create({
    data: {
      tenantId: TENANT_DEMO,
      prioridad: "BAJA",
      clienteId: clienteRodrigo.id,
      fechaPedido: new Date("2026-03-12"),
      fechaEntrega: null,
      estado: "PENDIENTE_PAGO",
      metodoEnvio: "envio",
      metodoPago: "mercadopago",
      precioEnvio: 300,
      senia: 0,
      contacto: "@rod.gamer",
      notas: "3 llaveros Triforce personalizados",
      etiquetas: ["llaveros", "gaming"],
      canalVenta: "instagram",
      items: {
        create: [
          {
            modeloId: modLlaveroTriforce.id,
            cantidad: 3,
            precioUnitario: 350,
            costoUnitario: 80,
            ajusteManual: 0,
          },
        ],
      },
    },
  });

  // Pedido 4: Confirmado - Fundas para joystick (Valentina)
  const pedido4 = await prisma.pedido.create({
    data: {
      tenantId: TENANT_DEMO,
      prioridad: "MEDIA",
      clienteId: clienteValentina.id,
      fechaPedido: new Date("2026-03-10"),
      fechaEntrega: new Date("2026-03-20"),
      estado: "CONFIRMADO",
      metodoEnvio: "envio",
      metodoPago: "transferencia",
      precioEnvio: 400,
      senia: 350,
      contacto: "1178901234",
      notas: "Funda PS5 negra y una Xbox blanca",
      etiquetas: ["gaming", "accesorios"],
      canalVenta: "directa",
      items: {
        create: [
          {
            modeloId: modFundaPS5.id,
            cantidad: 1,
            precioUnitario: 700,
            costoUnitario: 180,
            ajusteManual: 0,
          },
          {
            modeloId: modFundaXbox.id,
            cantidad: 1,
            precioUnitario: 700,
            costoUnitario: 180,
            ajusteManual: 0,
          },
        ],
      },
    },
  });

  // Pedido 5: Esperando liquidación ML - Organizer (sin cliente asignado)
  const pedido5 = await prisma.pedido.create({
    data: {
      tenantId: TENANT_DEMO,
      prioridad: "MEDIA",
      clienteId: null,
      fechaPedido: new Date("2026-02-25"),
      fechaEntrega: new Date("2026-03-08"),
      estado: "ESPERANDO_LIQUIDACION_ML",
      metodoEnvio: "mercadoenvios",
      metodoPago: "mercadopago",
      precioEnvio: 650,
      senia: 0,
      contacto: "comprador_ml_4521",
      notas: "Venta por ML - organizer negro 4 módulos",
      etiquetas: ["escritorio", "organizer"],
      canalVenta: "mercadolibre",
      items: {
        create: [
          {
            modeloId: modOrganizador.id,
            cantidad: 1,
            precioUnitario: 2200,
            costoUnitario: 600,
            ajusteManual: 0,
          },
        ],
      },
    },
  });

  // Pedido 6: Cancelado - Miniatura (cliente no se presentó)
  const pedido6 = await prisma.pedido.create({
    data: {
      tenantId: TENANT_DEMO,
      prioridad: "BAJA",
      clienteId: clienteMarcos.id,
      fechaPedido: new Date("2026-01-15"),
      fechaEntrega: new Date("2026-01-25"),
      estado: "CANCELADO",
      metodoEnvio: "retiro",
      metodoPago: "efectivo",
      precioEnvio: 0,
      senia: 0,
      contacto: "1154321098",
      notas: "El cliente no respondió más",
      etiquetas: [],
      canalVenta: "directa",
      items: {
        create: [
          {
            modeloId: modGoblin.id,
            cantidad: 2,
            precioUnitario: 500,
            costoUnitario: 120,
            ajusteManual: 0,
          },
        ],
      },
    },
  });

  console.log(`Pedidos creados: ${pedido1.id}, ${pedido2.id}, ${pedido3.id}, ${pedido4.id}, ${pedido5.id}, ${pedido6.id}`);

  // ==================== GASTOS ====================
  const gasto1 = await prisma.gasto.create({
    data: {
      tenantId: TENANT_DEMO,
      fecha: new Date("2026-02-05"),
      categoria: "filamentos",
      monto: 4500,
      descripcion: "Compra 3 rollos PLA Bambu Lab",
    },
  });

  const gasto2 = await prisma.gasto.create({
    data: {
      tenantId: TENANT_DEMO,
      fecha: new Date("2026-03-01"),
      categoria: "electricidad",
      monto: 1800,
      descripcion: "Factura de luz - parte proporcional impresión",
    },
  });

  console.log(`Gastos creados: ${gasto1.id}, ${gasto2.id}`);

  console.log("\nDatos demo sembrados correctamente.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
