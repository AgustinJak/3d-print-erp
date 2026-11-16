---
id: 012
feature: tareas-y-archivos
estado: validated
creado: 2026-11-16
---

# 012: Tareas del día y archivos 3D

## Qué se quiere

Agustín, el 2026-11-16: un tablero tipo Trello de las tareas del día, parecido al de Pedidos, con
estados Por hacer, Haciendo, Trabadas y Terminadas. Las terminadas son diarias: al pasar al otro
día quedan guardadas como tareas de ese día y la columna se limpia. Poder ver los días anteriores
para saber qué se hizo y cuándo. Y una sección para guardar archivos 3D, descargarlos después y
adjuntarlos a las tareas ("terminar este modelo", "imprimir este modelo").

## Decisiones (Agustín, 2026-11-16)

| Tema | Decisión |
|---|---|
| Extras | Tareas que se repiten y vista previa 3D. Vincular a pedidos y tareas automáticas, más adelante. |
| Personas | Varios: cada tarea puede tener responsable (Agustín, Taiel) y se filtra por persona. |
| Archivos | Privados: sólo se bajan desde el ERP, con links que vencen. |
| Plataforma | Vercel Pro y Supabase Pro (100 GB de almacenamiento). |

## Reglas

- **RN-1.** Terminadas muestra lo terminado hoy (hora de Argentina). Al otro día arranca vacía sin
  borrar nada: cada tarea guarda cuándo se terminó.
- **RN-2.** Lo que queda en Por hacer, Haciendo o Trabadas sigue al otro día, con "desde hace N días".
- **RN-3.** Pasar a Trabadas pide el motivo (se puede dejar vacío); salir de Trabadas lo borra.
- **RN-4.** Una tarea que se repite aparece en Por hacer el día que toca, una sola vez por día.
  Mensual en un día que el mes no tiene (31) cae el último día.
- **RN-5.** Los archivos se suben directo del navegador al almacenamiento privado y se ven o bajan
  con links firmados de 10 minutos. Borrar un archivo lo saca de las tareas.
- **RN-6.** El visor 3D muestra STL, 3MF y OBJ; los demás formatos se guardan y se bajan igual.
