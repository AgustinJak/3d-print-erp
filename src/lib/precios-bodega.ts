/**
 * La fórmula de precios de Bodega, copiada tal cual (docs/sdd/003, TASK-007).
 *
 * Copia de Bodega 2.35.0: `src/renderer/src/lib/precios.ts` entero salvo `preciosDeImpresion`
 * (el atajo desde gramos y horas; acá la fabricación ya viene de `costos-bodega.ts`) y, al final,
 * la política del modelo y `tresPrecios` de `src/renderer/src/lib/politica.ts`.
 *
 * No se edita a mano: lo arma `scripts/sdd-003-copiar-formula.ts`, con el estilo de Bodega para
 * que un diff contra el original muestre sólo lo que cambió allá. Después de copiar se corre
 * `npx tsx scripts/sdd-003-comparar-formula.ts`, que falla si las dos dan distinto.
 */

/**
 * Qué precio hay que poner para ganar de verdad.
 *
 * La calculadora vieja multiplicaba el costo de fabricación por 4 (minorista),
 * 3 (mayorista) o 5 (llaveros), y para Mercado Libre le sumaba un ×1.8 fijo.
 * Ese 1.8 era el único intento de cubrir la comisión, y se queda corto por dos
 * motivos distintos.
 *
 * **Uno: los gastos porcentuales no se suman, se despejan.** La comisión, la
 * publicidad y el IIBB se llevan un porcentaje del precio final, no del costo.
 * Si se los suma al costo y después se multiplica, el número sale mal siempre.
 * La cuenta correcta es despejar:
 *
 *     precio = costosFijos / (1 − %gastos − %margen)
 *
 * Así "45 % de margen" significa lo que uno espera: de cada $100 que paga el
 * cliente, $45 quedan después de todo.
 *
 * **Dos: el envío no es proporcional, es un escalón.** Arriba de cierto monto
 * el envío lo pagamos nosotros y aparece de golpe: en Mercado Libre a los
 * ~$30.000, en la web a los $34.000. Un multiplicador no puede representar eso,
 * y es justo donde más plata se pierde.
 *
 * Los valores por defecto no son inventados: salen de la facturación real de
 * Mercado Libre y de las ventas del ERP. Ver `GASTOS_MEDIDOS`.
 */

/**
 * Dónde se vende. Son tres precios distintos a propósito, no el mismo número
 * en tres lugares:
 *
 * - `ml`: paga comisión, publicidad, cuotas e IIBB.
 * - `web`: sale más barato porque no paga nada de Mercado Libre. Esa
 *   diferencia es justamente el motivo para que el cliente compre ahí.
 * - `personalizado`: trabajos a pedido fuera de las tiendas. Sin impuestos ni
 *   comisiones: es fabricación más margen, el número crudo.
 */
export type Canal = 'ml' | 'web' | 'personalizado'

export interface GastosVenta {
  /** Comisión de ML como % del precio (el "cargo por vender"). */
  mlComisionPct: number
  /** Cargo fijo de ML por unidad vendida, en pesos. */
  mlCargoFijo: number
  /** Product Ads, como % de lo facturado. */
  mlPublicidadPct: number
  /** Costo por ofrecer cuotas. */
  mlCuotasPct: number
  /** Mantenimiento de Mi página y otros cargos chicos. */
  mlOtrosPct: number
  /**
   * Descuento de promoción que se muestra en ML, y que no es real: el precio
   * publicado se infla para que el cliente pague lo calculado. Ver
   * `precioConPromo`.
   */
  mlPromoPct: number
  /** Desde este precio, el envío de ML lo pagamos nosotros. */
  mlEnvioDesde: number
  /** Lo que nos cuesta ese envío. */
  mlEnvioCosto: number

  /** Comisión de cobro en la web (Mercado Pago, promediado con transferencias). */
  webCobroPct: number
  /** Publicidad atribuible a la web (Meta, TikTok). */
  webPublicidadPct: number
  /** Envío gratis desde este monto. */
  webEnvioGratisDesde: number
  /** Lo que nos cuesta mandarlo. */
  webEnvioCosto: number

  /** IIBB Convenio Multilateral, efectivo sobre la base declarada. */
  iibbPct: number

  /**
   * Lo que tiene que quedar en una venta normal, como % del precio.
   *
   * Son dos objetivos y no uno porque el precio de lista tiene que aguantar el
   * descuento por cantidad sin caerse: el mayorista es el piso, no la meta.
   */
  margenMinorista: number
  /** El piso: lo que tiene que quedar incluso con el mayor descuento por cantidad. */
  margenMayorista: number
}

/**
 * Lo que cada cosa cuesta de verdad, medido sobre los datos del negocio.
 *
 * - **Mercado Libre**, período de facturación 2026-09-01 (cubre del 9/8 al 8/9),
 *   845 cargos contra $3.203.589 facturados en esa misma ventana:
 *   comisión por vender 12,5 % bruto, que neto de anulaciones y descontando el
 *   cargo fijo por unidad da **11,3 % + $1.053 por unidad**; Product Ads
 *   **15,8 %**; cuotas **3,1 %**; Mi página **0,5 %**.
 *   La comisión se verificó contra los 174 pedidos de esa ventana: el payload
 *   dice $584.363 y la facturación $591.088, 1,1 % de diferencia.
 * - **Envío de ML**: de 488 ventas de una unidad, abajo de $30.000 no lo
 *   pagamos nunca; entre $30.000 y $35.000 lo pagamos en la mitad; arriba de
 *   $35.000, siempre. Cuando lo pagamos cuesta **$9.900** promedio.
 * - **Web**: envío gratis desde $34.000, y cuando lo cobramos la media es
 *   **$6.315** (de $4.000 a $9.808 según destino y correo).
 *   De 41 pedidos, 27 se pagaron por transferencia (sin comisión), 11 por
 *   Mercado Pago y 3 en efectivo: por eso la comisión de cobro promedio es baja.
 * - **IIBB**: el impuesto determinado sobre la base declarada dio 3,5 % en un
 *   período ($260.427 sobre $7.440.144) y 4,05 % en otro ($124.078 sobre
 *   $3.066.394). Al ser monotributo **no hay IVA**.
 *   Las percepciones no se cuentan acá: son crédito contra ese mismo impuesto,
 *   no un costo aparte.
 */
export const GASTOS_MEDIDOS: GastosVenta = {
  mlComisionPct: 11.3,
  mlCargoFijo: 1053,
  mlPublicidadPct: 15.8,
  mlCuotasPct: 3.1,
  mlOtrosPct: 0.5,
  mlPromoPct: 0,
  mlEnvioDesde: 30000,
  mlEnvioCosto: 9900,

  webCobroPct: 1.6,
  webPublicidadPct: 0,
  webEnvioGratisDesde: 34000,
  webEnvioCosto: 6315,

  iibbPct: 4,
  margenMinorista: 55,
  margenMayorista: 45
}

/** Descuentos por cantidad. Un pedido de 7 unidades entra en el tramo de 5. */
export const TRAMOS_MAYORISTA = [
  { desde: 5, descuento: 10 },
  { desde: 10, descuento: 20 },
  { desde: 20, descuento: 30 }
] as const

export interface Gasto {
  concepto: string
  monto: number
  /** true si se lleva un % del precio; false si son pesos fijos. */
  porcentual: boolean
}

export interface PrecioSugerido {
  canal: Canal
  /** El precio que cumple el margen objetivo. */
  precio: number
  /** Costos en pesos que no dependen del precio. */
  costosFijos: number
  /** Suma de los % que se llevan del precio, sin contar el margen. */
  gastosPct: number
  /** Lo que queda en el bolsillo. */
  ganancia: number
  /** Ganancia sobre el precio. Debería dar el objetivo. */
  margenReal: number
  /** Cuánto de ese precio es envío que absorbemos. */
  envio: number
  gastos: Gasto[]
  /** Precios en los que conviene no caer. Ver `zonaMuerta`. */
  zonaMuerta: { desde: number; hasta: number } | null
  /**
   * Cuál de los dos objetivos fijó el precio.
   *
   * `minorista` es el caso normal. `mayorista` quiere decir que el precio tuvo
   * que subir por encima de lo que pedía la venta suelta para que el descuento
   * por cantidad más grande siga dejando el piso: si no, cada caja vendida al
   * por mayor rompería el objetivo.
   */
  manda: 'minorista' | 'mayorista'
  /** El precio que pedía la venta suelta, antes de considerar el mayorista. */
  precioMinorista: number
  /** El piso que impone el descuento por cantidad más grande. */
  pisoMayorista: number
  /**
   * El mejor precio posible sin cruzar el umbral del envío, cuando el objetivo
   * sólo se alcanza cruzándolo.
   *
   * Existe porque el precio "correcto" puede ser absurdo. Si para llegar al
   * objetivo hay que pasar el umbral, el envío entra entero y el precio se
   * dispara: una pieza que da 54,4 % a $29.999 necesita $127.961 para dar
   * 55 %. Quedarse abajo casi siempre es el mejor negocio, y hay que poder
   * verlo al lado del otro número en vez de descubrirlo vendiendo.
   */
  alternativaBajoUmbral: { precio: number; margen: number } | null
  /**
   * Cruzar el umbral recuperando el envío, sin pedir más ganancia por eso.
   *
   * Exigir un *porcentaje* fijo cuando aparece un costo fijo se retroalimenta:
   * el envío sube el costo, el costo sube el precio, y como la ganancia es un
   * % del precio, también sube la ganancia pedida. Por eso $9.900 de envío
   * empujan el precio $97.000. Casi nunca es lo que uno quiere: lo que uno
   * quiere es **recuperar** el envío y ganar lo mismo que ganaba.
   *
   * Este es ese precio, y coincide con el techo de la zona muerta: por debajo
   * de él, cruzar deja menos plata que quedarse abajo.
   */
  precioRecuperandoEnvio: number | null
  /**
   * Lo que conviene hacer, que no siempre es el precio del objetivo.
   *
   * Cuando el objetivo sólo se alcanza cruzando el umbral, el número "correcto"
   * es comercialmente imposible y recomendarlo sería peor que no decir nada.
   */
  recomendado: { precio: number; margen: number; motivo: 'objetivo' | 'bajo_umbral' }
  /**
   * true si ni la recomendación se acerca al objetivo: el producto no cierra
   * en ese canal. Con tolerancia, porque quedar en 54,4 % contra un objetivo
   * de 55 % no es un problema y avisarlo sería ruido.
   */
  noLlega: boolean
}

/** Cuántos puntos por debajo del objetivo se toleran antes de avisar. */
export const TOLERANCIA_MARGEN = 2

/**
 * El precio a publicar en Mercado Libre para una promoción que no es tal.
 *
 * La promo de ML descuenta un % sobre el precio publicado. Para que el cliente
 * termine pagando exactamente lo que calculamos —y no perder ese %—, el precio
 * publicado se infla antes. Ojo que no alcanza con sumarle el %: con 5 %,
 * $29.990 × 1,05 = $31.490, y el 5 % de eso deja $29.915. Hay que dividir:
 *
 *     publicado = final / (1 − promo)
 *
 * Las comisiones, la publicidad y el IIBB se cobran sobre lo que paga el
 * cliente, así que la cuenta del margen no cambia.
 *
 * Se redondea al peso **hacia arriba**, para que el precio final quede igual o
 * apenas por encima del calculado, nunca por debajo. Salvo que eso empuje el
 * final por encima del umbral del envío: en ese caso se baja lo justo. Se
 * asume que ML mira el umbral sobre el precio con el descuento aplicado.
 */
export function precioConPromo(
  final: number,
  promoPct: number,
  techo?: number
): { publicado: number; final: number } {
  if (!Number.isFinite(final) || final <= 0 || !(promoPct > 0) || promoPct >= 100) {
    return { publicado: final, final }
  }
  const f = 1 - promoPct / 100
  let publicado = Math.ceil(final / f)
  if (techo != null && publicado * f > techo) publicado = Math.floor(techo / f)
  return { publicado, final: publicado * f }
}

export type Redondeo = 'exacto' | 'cien' | 'quinientos' | 'mil' | 'noventa'

export const REDONDEOS: Array<{ id: Redondeo; label: string }> = [
  { id: 'exacto', label: 'Exacto' },
  { id: 'cien', label: '$100' },
  { id: 'quinientos', label: '$500' },
  { id: 'mil', label: '$1.000' },
  { id: 'noventa', label: 'Terminado en 90' }
]

/**
 * Redondea un precio para que sea publicable.
 *
 * Siempre **hacia arriba**: redondear para abajo se come margen en silencio, y
 * la diferencia entre $21.204 y $21.200 no se nota en la venta pero sí en la
 * cuenta cuando son cien unidades.
 *
 * `noventa` deja el precio terminado en 90 (de los cien), que es como se
 * publica casi todo: $21.204 → $21.290.
 */
export function redondear(precio: number, modo: Redondeo, techo?: number): number {
  if (!Number.isFinite(precio) || precio <= 0 || modo === 'exacto') return precio

  const arriba = (paso: number) => Math.ceil(precio / paso) * paso

  const paso = modo === 'cien' ? 100 : modo === 'quinientos' ? 500 : modo === 'mil' ? 1000 : null

  let r: number
  if (paso) {
    r = arriba(paso)
    // Redondear para arriba es lo correcto salvo cuando empuja el precio por
    // encima del umbral del envío: ahí el redondeo dispararía los $9.900 que
    // justamente estábamos esquivando, y el precio "más lindo" saldría carísimo.
    if (techo != null && r > techo) r = Math.floor(techo / paso) * paso
  } else {
    const cien = Math.ceil(precio / 100) * 100
    r = cien - 10 >= precio ? cien - 10 : cien + 90
    // El mayor terminado en 90 que no pase el techo: $29.999 → $29.990.
    if (techo != null && r > techo) r = Math.floor((techo - 90) / 100) * 100 + 90
  }

  // Si al bajar quedó en cero o negativo, no hay redondeo que sirva.
  return r > 0 ? r : precio
}

const pctDeCanal = (g: GastosVenta, canal: Canal): number => {
  if (canal === 'ml') return g.mlComisionPct + g.mlPublicidadPct + g.mlCuotasPct + g.mlOtrosPct + g.iibbPct
  if (canal === 'web') return g.webCobroPct + g.webPublicidadPct + g.iibbPct
  return 0 // personalizado: sin impuestos ni comisiones
}

/**
 * Lo que se lleva una venta directa declarada: sólo IIBB.
 *
 * No es lo mismo que el canal `personalizado`. Una venta por cantidad sí
 * declara, así que el piso mayorista se calcula con el impuesto adentro
 * aunque el precio de personalizados se muestre sin nada.
 */
const pctDirectaDeclarada = (g: GastosVenta): number => g.iibbPct

const umbralEnvio = (g: GastosVenta, canal: Canal): { desde: number; costo: number } | null => {
  if (canal === 'ml') return { desde: g.mlEnvioDesde, costo: g.mlEnvioCosto }
  if (canal === 'web') return { desde: g.webEnvioGratisDesde, costo: g.webEnvioCosto }
  return null // personalizado: se entrega en mano, no hay envío
}

/**
 * El precio que deja el margen pedido, en un canal.
 *
 * El envío entra como un escalón, no como un porcentaje: primero se resuelve
 * como si no lo pagáramos y, si ese precio ya pasa el umbral, se resuelve otra
 * vez con el envío adentro. El segundo resultado siempre queda por encima del
 * umbral, así que no hay que iterar.
 */
export function precioPara(
  g: GastosVenta,
  canal: Canal,
  fabricacion: number,
  insumos: number
): PrecioSugerido {
  const pct = pctDeCanal(g, canal) / 100
  const objetivo = g.margenMinorista / 100
  const divisor = 1 - pct - objetivo

  const fijoBase = fabricacion + insumos + (canal === 'ml' ? g.mlCargoFijo : 0)
  const envioInfo = umbralEnvio(g, canal)

  // Con el divisor en cero o negativo no hay precio posible: los gastos más el
  // margen ya se comen todo. Se devuelve Infinity para que la UI lo diga.
  const resolver = (fijo: number) => (divisor > 0 ? fijo / divisor : Infinity)

  let precio = resolver(fijoBase)
  let envio = 0
  if (envioInfo && precio >= envioInfo.desde) {
    envio = envioInfo.costo
    precio = resolver(fijoBase + envio)
  }

  // El precio de la web también tiene que aguantar el descuento por cantidad más
  // grande sin caerse del piso. Si ese piso es más alto que lo que pedía la
  // venta suelta, manda el piso: de nada sirve un precio lindo que se rompe la
  // primera vez que alguien compra 20.
  //
  // Sólo la web, porque es sobre ese precio que se hace el descuento: es la
  // más barata y es adonde se quiere llevar a la gente, así que nadie va a
  // comprar 20 unidades con descuento sobre el precio de Mercado Libre. Los
  // personalizados son trabajos únicos y no llevan descuento por cantidad.
  const precioMinorista = precio
  const piso = canal === 'web' ? pisoPorMayorista(g, fabricacion, insumos) : 0
  const manda: 'minorista' | 'mayorista' = piso > precio ? 'mayorista' : 'minorista'
  if (manda === 'mayorista') {
    precio = piso
    // Subir el precio puede cruzar el umbral del envío que antes no se cruzaba.
    if (envioInfo && envio === 0 && precio >= envioInfo.desde) envio = envioInfo.costo
  }

  const costosFijos = fijoBase + envio
  const gastos = desgloseEn(g, canal, precio)

  const ganancia = precio - fabricacion - insumos - gastos.reduce((a, x) => a + x.monto, 0)

  return {
    canal,
    precio,
    costosFijos,
    gastosPct: pct * 100,
    ganancia,
    margenReal: precio > 0 && Number.isFinite(precio) ? (ganancia / precio) * 100 : 0,
    envio,
    gastos,
    zonaMuerta: envioInfo ? zonaMuerta(g, canal, envioInfo) : null,
    manda,
    precioMinorista,
    pisoMayorista: piso,
    ...resolverAlternativas(g, canal, pct, fijoBase, envio, envioInfo, precio, ganancia)
  }
}

/**
 * Las otras dos salidas cuando el precio del objetivo cruza el umbral del
 * envío, y cuál de todas recomendar.
 */
function resolverAlternativas(
  g: GastosVenta,
  canal: Canal,
  pct: number,
  fijoBase: number,
  envio: number,
  envioInfo: { desde: number; costo: number } | null,
  precio: number,
  ganancia: number
): Pick<PrecioSugerido, 'alternativaBajoUmbral' | 'precioRecuperandoEnvio' | 'recomendado' | 'noLlega'> {
  const objetivo = g.margenMinorista
  const sinCruce = !envioInfo || envio === 0 || !Number.isFinite(precio)

  if (sinCruce) {
    return {
      alternativaBajoUmbral: null,
      precioRecuperandoEnvio: null,
      recomendado: {
        precio,
        margen: Number.isFinite(precio) && precio > 0 ? (ganancia / precio) * 100 : 0,
        motivo: 'objetivo'
      },
      noLlega: false
    }
  }

  const neto = 1 - pct
  const pAbajo = envioInfo!.desde - 1
  const gAbajo = pAbajo * neto - fijoBase
  const mAbajo = pAbajo > 0 ? (gAbajo / pAbajo) * 100 : 0

  // Cruzar cobrando el envío pero sin pedir más ganancia en pesos por hacerlo.
  const recuperando = neto > 0 ? (fijoBase + envioInfo!.costo + gAbajo) / neto : Infinity

  // Quedarse abajo es casi siempre mejor negocio: misma plata, cuarta parte del
  // precio. Sólo deja de serlo si abajo del umbral el producto no da nada, y en
  // ese caso tampoco sirve recomendar el precio del objetivo: no cierra.
  return {
    alternativaBajoUmbral: { precio: pAbajo, margen: mAbajo },
    precioRecuperandoEnvio: Number.isFinite(recuperando) ? recuperando : null,
    recomendado: { precio: pAbajo, margen: mAbajo, motivo: 'bajo_umbral' },
    noLlega: mAbajo < objetivo - TOLERANCIA_MARGEN
  }
}

/**
 * El precio de lista mínimo para que el descuento por cantidad más grande
 * todavía deje el piso de ganancia.
 *
 * Una venta por cantidad no paga comisión de Mercado Libre ni publicidad,
 * sólo IIBB. Despejando sobre el precio ya descontado:
 *
 *     precio · (1 − d) · (1 − IIBB) − costos = margen · precio · (1 − d)
 *     precio = costos / [ (1 − IIBB − margen) · (1 − d) ]
 */
export function pisoPorMayorista(g: GastosVenta, fabricacion: number, insumos: number): number {
  const pct = pctDirectaDeclarada(g) / 100
  const m = g.margenMayorista / 100
  const divisor = 1 - pct - m
  if (divisor <= 0) return Infinity
  // El insumo se cobra al costo: se le exige el margen sólo a la parte propia.
  // Si no, una cadena de $5.000 obligaba a subir la lista ~$14.000 por sí sola.
  const lista = fabricacion / divisor + insumos / (1 - pct)
  return TRAMOS_MAYORISTA.reduce((peor, t) => {
    const necesario = lista / (1 - t.descuento / 100)
    return Math.max(peor, necesario)
  }, 0)
}

/**
 * El tramo de precios donde conviene no estar.
 *
 * Justo arriba del umbral, el envío aparece entero de una y se come más de lo
 * que suma el aumento. Vender a $34.000 puede dejar lo mismo que vender a
 * $25.800: todo lo que esté en el medio rinde menos que quedarse abajo del
 * umbral. O se baja el precio por debajo, o se sube por encima del tramo.
 */
export function zonaMuerta(
  g: GastosVenta,
  canal: Canal,
  envioInfo: { desde: number; costo: number }
): { desde: number; hasta: number } | null {
  const neto = 1 - pctDeCanal(g, canal) / 100
  if (neto <= 0) return null
  const hasta = envioInfo.desde + envioInfo.costo / neto
  return { desde: envioInfo.desde, hasta }
}

export interface PrecioMayorista {
  desde: number
  descuento: number
  precioUnitario: number
  ganancia: number
  margen: number
  /** true si con ese descuento todavía ganamos. */
  rentable: boolean
  /**
   * true si deja el piso de ganancia sobre la parte propia del precio.
   *
   * El `margen` de arriba es sobre el precio completo, y con insumos caros
   * baja aunque la venta esté bien: la cadena pasa al costo y no deja nada.
   * Comparar ese % contra el piso marcaba en rojo ventas que cumplían.
   */
  cumplePiso: boolean
}

/**
 * Qué queda con cada descuento por cantidad.
 *
 * Una venta mayorista no paga comisión de ML ni publicidad, sólo IIBB. Por eso
 * aguanta descuentos que en Mercado Libre serían imposibles. El descuento se
 * calcula sobre el precio de lista que se le pasa.
 */
export function preciosMayoristas(
  g: GastosVenta,
  precioLista: number,
  fabricacion: number,
  insumos: number
): PrecioMayorista[] {
  const pct = pctDirectaDeclarada(g) / 100
  return TRAMOS_MAYORISTA.map((t) => {
    const precioUnitario = precioLista * (1 - t.descuento / 100)
    const ganancia = precioUnitario * (1 - pct) - fabricacion - insumos
    const propio = precioUnitario - insumos / (1 - pct)
    return {
      desde: t.desde,
      descuento: t.descuento,
      precioUnitario,
      ganancia,
      margen: precioUnitario > 0 ? (ganancia / precioUnitario) * 100 : 0,
      rentable: ganancia > 0,
      cumplePiso: ganancia >= (g.margenMayorista / 100) * propio - 0.5
    }
  })
}

/**
 * El descuento máximo que todavía deja el margen pedido, sobre un precio de
 * lista. Si ni con 0 % de descuento se llega, devuelve 0.
 */
export function descuentoMaximo(
  g: GastosVenta,
  precioLista: number,
  fabricacion: number,
  insumos: number,
  margenMinimo: number
): number {
  const pct = pctDirectaDeclarada(g) / 100
  const m = margenMinimo / 100
  if (precioLista <= 0 || 1 - pct - m <= 0) return 0
  // precioUnitario · (1 − pct − m) = fabricación + insumos
  const minimo = (fabricacion + insumos) / (1 - pct - m)
  const d = (1 - minimo / precioLista) * 100
  return Math.max(0, d)
}

/** El margen real de un precio que ya está puesto, para auditar lo que se vende hoy. */
export function margenDe(
  g: GastosVenta,
  canal: Canal,
  precio: number,
  fabricacion: number,
  insumos: number
): { ganancia: number; margen: number; envio: number; gastos: Gasto[] } {
  const gastos = desgloseEn(g, canal, precio)
  const ganancia = precio - fabricacion - insumos - gastos.reduce((a, x) => a + x.monto, 0)
  const envio = gastos.find((x) => x.concepto === ENVIO)?.monto ?? 0
  return { ganancia, margen: precio > 0 ? (ganancia / precio) * 100 : 0, envio, gastos }
}

const ENVIO = 'Envío que absorbemos'

/**
 * Qué se lleva cada uno, vendiendo a **este** precio.
 *
 * Es la única fuente del desglose: la usa el cálculo del precio y la usa la
 * pantalla. Antes la pantalla tomaba los montos calculados sobre el precio
 * teórico y los reescalaba al precio mostrado, y eso mentía en dos casos: al
 * recomendar $29.999 seguía restando los $9.900 de envío del precio de
 * $127.647 (mostraba 21 % en vez de 54 %), y si el redondeo cruzaba el
 * umbral no sumaba el envío que de verdad aparecía.
 */
export function desgloseEn(g: GastosVenta, canal: Canal, precio: number): Gasto[] {
  const gastos: Gasto[] = []
  const pct = (x: number) => (precio * x) / 100
  if (canal === 'ml') {
    gastos.push({ concepto: 'Comisión de ML', monto: pct(g.mlComisionPct), porcentual: true })
    gastos.push({ concepto: 'Cargo fijo por unidad', monto: g.mlCargoFijo, porcentual: false })
    gastos.push({ concepto: 'Publicidad (Product Ads)', monto: pct(g.mlPublicidadPct), porcentual: true })
    gastos.push({ concepto: 'Cuotas', monto: pct(g.mlCuotasPct), porcentual: true })
    if (g.mlOtrosPct) gastos.push({ concepto: 'Otros cargos de ML', monto: pct(g.mlOtrosPct), porcentual: true })
  } else if (canal === 'web') {
    if (g.webCobroPct) gastos.push({ concepto: 'Comisión de cobro', monto: pct(g.webCobroPct), porcentual: true })
    if (g.webPublicidadPct) gastos.push({ concepto: 'Publicidad', monto: pct(g.webPublicidadPct), porcentual: true })
  }
  // Personalizados va sin impuestos: es el número crudo, a pedido.
  if (canal !== 'personalizado') gastos.push({ concepto: 'IIBB', monto: pct(g.iibbPct), porcentual: true })

  const envioInfo = umbralEnvio(g, canal)
  if (envioInfo && precio >= envioInfo.desde) {
    gastos.push({ concepto: ENVIO, monto: envioInfo.costo, porcentual: false })
  }
  return gastos
}

/**
 * Hasta dónde se puede redondear sin cruzar el umbral del envío.
 *
 * Sólo aplica si el precio está abajo del umbral: si ya lo cruzó, el envío
 * ya está pagado y redondear para arriba no cambia nada.
 */
export function techoDeRedondeo(g: GastosVenta, canal: Canal, precio: number): number | undefined {
  const envioInfo = umbralEnvio(g, canal)
  return envioInfo && precio < envioInfo.desde ? envioInfo.desde - 1 : undefined
}

export function gastosFromMap(map: Record<string, string>): GastosVenta {
  const num = (k: keyof GastosVenta) => {
    const v = parseFloat(map[`precio_${k}`])
    return Number.isFinite(v) ? v : GASTOS_MEDIDOS[k]
  }
  return {
    mlComisionPct: num('mlComisionPct'),
    mlCargoFijo: num('mlCargoFijo'),
    mlPublicidadPct: num('mlPublicidadPct'),
    mlCuotasPct: num('mlCuotasPct'),
    mlOtrosPct: num('mlOtrosPct'),
    mlPromoPct: num('mlPromoPct'),
    mlEnvioDesde: num('mlEnvioDesde'),
    mlEnvioCosto: num('mlEnvioCosto'),
    webCobroPct: num('webCobroPct'),
    webPublicidadPct: num('webPublicidadPct'),
    webEnvioGratisDesde: num('webEnvioGratisDesde'),
    webEnvioCosto: num('webEnvioCosto'),
    iibbPct: num('iibbPct'),
    margenMinorista: num('margenMinorista'),
    margenMayorista: num('margenMayorista')
  }
}

/**
 * El precio que deja **exactamente esta ganancia en pesos** en un canal.
 *
 * La ganancia es del producto, no del canal: lo que queda vendiendo en Mercado
 * Libre tiene que quedar igual vendiendo en la web o en mano. Cada canal suma
 * arriba lo suyo —comisiones, publicidad, IIBB, envío— y por eso los precios
 * difieren, pero la plata que queda es la misma. Si la web se calculara con el
 * mismo % que ML, como cada canal tiene costos distintos, quedaría muchísimo
 * menos plata en la web: un producto dejaba $16.197 en ML y $4.076 en la web.
 *
 *     precio = (fabricación + cargos fijos + envío + ganancia) / (1 − %canal)
 *
 * Como la meta es en pesos y no en %, el envío no se retroalimenta: si el
 * precio cruza el umbral, se suma el envío una vez y listo.
 */
export function precioConGanancia(
  g: GastosVenta,
  canal: Canal,
  fabricacion: number,
  insumos: number,
  ganancia: number
): PrecioSugerido {
  const pct = pctDeCanal(g, canal) / 100
  const neto = 1 - pct
  const fijoBase = fabricacion + insumos + (canal === 'ml' ? g.mlCargoFijo : 0)
  const envioInfo = umbralEnvio(g, canal)
  const resolver = (extra: number) => (neto > 0 ? (fijoBase + extra + ganancia) / neto : Infinity)

  let precio = resolver(0)
  let envio = 0
  if (envioInfo && precio >= envioInfo.desde) {
    envio = envioInfo.costo
    precio = resolver(envio)
  }

  // La web además tiene que aguantar el descuento por cantidad. Con la misma
  // ganancia que ML casi nunca manda, pero se respeta igual.
  const precioMinorista = precio
  const piso = canal === 'web' ? pisoPorMayorista(g, fabricacion, insumos) : 0
  const manda: 'minorista' | 'mayorista' = piso > precio ? 'mayorista' : 'minorista'
  if (manda === 'mayorista') {
    precio = piso
    if (envioInfo && envio === 0 && precio >= envioInfo.desde) envio = envioInfo.costo
  }

  const gastos = desgloseEn(g, canal, precio)
  const real = precio - fabricacion - insumos - gastos.reduce((a, x) => a + x.monto, 0)
  const margen = Number.isFinite(precio) && precio > 0 ? (real / precio) * 100 : 0

  return {
    canal,
    precio,
    costosFijos: fijoBase + envio,
    gastosPct: pct * 100,
    ganancia: real,
    margenReal: margen,
    envio,
    gastos,
    zonaMuerta: envioInfo ? zonaMuerta(g, canal, envioInfo) : null,
    manda,
    precioMinorista,
    pisoMayorista: piso,
    alternativaBajoUmbral: null,
    precioRecuperandoEnvio: null,
    recomendado: { precio, margen, motivo: 'objetivo' },
    noLlega: false
  }
}

/**
 * El precio de Mercado Libre, que es el que define la ganancia del producto.
 *
 * La ganancia sale del % objetivo sobre el precio de ML **sin** el escalón del
 * envío. Si para dejarla hay que cruzar el umbral, el envío se suma una vez,
 * sin pedirle más ganancia: exigir el mismo % con el envío adentro hace que el
 * envío se pague a sí mismo diez veces, y una pieza de $10.000 de fabricación
 * terminaba pidiendo precios imposibles.
 *
 * Quedarse justo abajo del umbral se recomienda sólo si cuesta hasta
 * `TOLERANCIA_MARGEN` puntos. Antes se recomendaba siempre, y una pieza grande
 * quedaba trabada en $29.990 dejando 26 % cuando el objetivo era 55 %.
 */
export function precioMl(g: GastosVenta, fabricacion: number, insumos: number): PrecioSugerido {
  const pct = pctDeCanal(g, 'ml') / 100
  const m = g.margenMinorista / 100
  const fijo = fabricacion + insumos + g.mlCargoFijo
  const divisor = 1 - pct - m
  if (divisor <= 0) return precioPara(g, 'ml', fabricacion, insumos) // sin precio posible

  const ganancia = m * (fijo / divisor)
  const p = precioConGanancia(g, 'ml', fabricacion, insumos, ganancia)
  const envioInfo = umbralEnvio(g, 'ml')
  if (!envioInfo || p.envio === 0) return p

  const neto = 1 - pct
  const pAbajo = envioInfo.desde - 1
  const gAbajo = pAbajo * neto - fijo
  const mAbajo = pAbajo > 0 ? (gAbajo / pAbajo) * 100 : 0
  const quedarse = mAbajo >= g.margenMinorista - TOLERANCIA_MARGEN

  return {
    ...p,
    alternativaBajoUmbral: { precio: pAbajo, margen: mAbajo },
    // Desde dónde cruzar deja al menos lo mismo que quedarse abajo.
    precioRecuperandoEnvio: (fijo + envioInfo.costo + gAbajo) / neto,
    recomendado: quedarse ? { precio: pAbajo, margen: mAbajo, motivo: 'bajo_umbral' } : p.recomendado,
    noLlega: false
  }
}

/**
 * Los tres precios encadenados, tal como los muestra la calculadora.
 *
 * La ganancia es del producto, no del canal: lo que queda vendiendo en Mercado
 * Libre tiene que quedar igual en la web y en personalizados. ML se calcula con
 * el % objetivo, y lo que deja —al precio que de verdad se publica, ya
 * redondeado— es la meta en pesos de los otros dos.
 *
 * Dos cosas quedan afuera de esa ganancia y se suman después, sin pedirles
 * margen:
 *
 * - **Los insumos** se cobran al costo. Antes se les aplicaba el % como si
 *   fueran fabricación propia: una cadena de $5.000 subía ML ~$48.000.
 * - **Las cuotas** son lo que cuesta financiarle la compra al cliente de ML, no
 *   parte del producto. Como la ganancia es un % del precio de ML, si entraran
 *   en la cuenta subirían también la web y los personalizados, que no ofrecen
 *   cuotas. Se calcula sin ellas y después ML sube lo justo para cubrirlas.
 */
export function preciosPorCanal(
  g: GastosVenta,
  fabricacion: number,
  insumos: number,
  redondeo: Redondeo
): { precios: Record<Canal, PrecioSugerido>; ganancia: number | null } {
  const sinCuotas = { ...g, mlCuotasPct: 0 }
  const base = precioMl(sinCuotas, fabricacion, 0)
  const crudo = base.recomendado.precio
  const visible = redondear(crudo, redondeo, techoDeRedondeo(sinCuotas, 'ml', crudo))
  const ganancia = Number.isFinite(visible) ? margenDe(sinCuotas, 'ml', visible, fabricacion, 0).ganancia : NaN
  const hayGanancia = Number.isFinite(ganancia) && ganancia > 0

  const ml =
    insumos <= 0 && !(g.mlCuotasPct > 0)
      ? base
      : hayGanancia
        ? precioMlConGanancia(g, fabricacion, insumos, ganancia)
        : precioMl(g, fabricacion, insumos)

  // Si ML no tiene precio posible no hay ganancia que copiar: los otros dos
  // vuelven a calcularse con el % por su cuenta.
  const igualar = (canal: Canal) =>
    hayGanancia
      ? precioConGanancia(g, canal, fabricacion, insumos, ganancia)
      : precioPara(g, canal, fabricacion, insumos)

  return {
    precios: { ml, web: igualar('web'), personalizado: igualar('personalizado') },
    ganancia: hayGanancia ? ganancia : null
  }
}

/**
 * El precio de ML que deja una ganancia dada, con la regla del umbral del envío.
 *
 * Lo usan los productos con insumos: la ganancia se fija sobre el producto sin
 * ellos, y el insumo se suma al costo. Si eso empuja el precio por encima del
 * umbral, se recomienda quedarse justo abajo cuando lo que se deja de ganar no
 * pasa de `TOLERANCIA_MARGEN` puntos del precio; si no, se cruza y se paga el
 * envío.
 */
export function precioMlConGanancia(
  g: GastosVenta,
  fabricacion: number,
  insumos: number,
  ganancia: number
): PrecioSugerido {
  const p = precioConGanancia(g, 'ml', fabricacion, insumos, ganancia)
  const envioInfo = umbralEnvio(g, 'ml')
  if (!envioInfo || p.envio === 0 || !Number.isFinite(p.precio)) return p

  const neto = 1 - pctDeCanal(g, 'ml') / 100
  const fijo = fabricacion + insumos + g.mlCargoFijo
  const pAbajo = envioInfo.desde - 1
  const gAbajo = pAbajo * neto - fijo
  const mAbajo = pAbajo > 0 ? (gAbajo / pAbajo) * 100 : 0
  const falta = pAbajo > 0 ? ((ganancia - gAbajo) / pAbajo) * 100 : Infinity

  return {
    ...p,
    alternativaBajoUmbral: { precio: pAbajo, margen: mAbajo },
    precioRecuperandoEnvio: (fijo + envioInfo.costo + gAbajo) / neto,
    recomendado:
      falta <= TOLERANCIA_MARGEN ? { precio: pAbajo, margen: mAbajo, motivo: 'bajo_umbral' } : p.recomendado,
    noLlega: false
  }
}

// ─── De politica.ts ─────────────────────────────────────────────────────────

/**
 * La política de precio de un modelo: margen, redondeo y promo de ML propios.
 *
 * Cada uno en `null` sigue al general de la calculadora. Se guarda sólo con "Guardar
 * precios en el modelo": es una decisión, no un dato medido (SDD 003 del inventario,
 * spec 002). El ERP lee esta política para calcular el precio de cada combinación que
 * se vende con la pieza (la katana con su funda).
 */
export interface Politica {
  margen: number | null
  redondeo: Redondeo | null
  promo: number | null
}

export const SIN_POLITICA: Politica = { margen: null, redondeo: null, promo: null }

/** El redondeo general, el que arranca seleccionado si nadie eligió otro. */
export const REDONDEO_POR_DEFECTO: Redondeo = 'noventa'

export function esRedondeo(v: unknown): v is Redondeo {
  return typeof v === 'string' && REDONDEOS.some((r) => r.id === v)
}

const numONull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export function politicaDeModelo(m: { margen?: number | null; redondeo?: string | null; promoMl?: number | null }): Politica {
  return {
    margen: numONull(m.margen),
    redondeo: esRedondeo(m.redondeo) ? m.redondeo : null,
    promo: numONull(m.promoMl)
  }
}

/** Los gastos y el redondeo con que se calcula un modelo: los generales, pisados por los suyos. */
export function aplicarPolitica(
  general: GastosVenta,
  redondeoGeneral: Redondeo,
  p: Politica
): { gastos: GastosVenta; redondeo: Redondeo } {
  return {
    gastos: {
      ...general,
      margenMinorista: p.margen ?? general.margenMinorista,
      mlPromoPct: p.promo ?? general.mlPromoPct
    },
    redondeo: p.redondeo ?? redondeoGeneral
  }
}

export interface TresPrecios {
  /** Lo que paga el cliente en Mercado Libre. */
  ml: number
  /** Lo que se publica en ML: igual a `ml` sin promo; inflado por la promo si la hay. */
  mlPublicado: number
  web: number
  personalizado: number
  /** Lo que deja cada unidad; null si no hay precio posible en ML. */
  ganancia: number | null
}

/** Los tres precios redondeados, exactamente como los muestra la calculadora. */
export function tresPrecios(gastos: GastosVenta, fabricacion: number, insumos: number, redondeo: Redondeo): TresPrecios {
  const { precios, ganancia } = preciosPorCanal(gastos, fabricacion, insumos, redondeo)
  const visible = (canal: 'ml' | 'web' | 'personalizado') => {
    const crudo = precios[canal].recomendado.precio
    return redondear(crudo, redondeo, techoDeRedondeo(gastos, canal, crudo))
  }
  const ml = visible('ml')
  const techoMl = techoDeRedondeo(gastos, 'ml', precios.ml.recomendado.precio)
  return {
    ml,
    mlPublicado: precioConPromo(ml, gastos.mlPromoPct, techoMl).publicado,
    web: visible('web'),
    personalizado: visible('personalizado'),
    ganancia
  }
}
