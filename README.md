# Agility Task Lite

Extensión de Chrome (MV3) para administrar un entregable completo de cualquier
proyecto de AgilityTask: burndown, carga por desarrollador, tablero de tareas
con semáforo de vencimiento, una agenda personal y un buscador con el detalle
de cada tarea. Consulta la API en vivo; no guarda copia de las tareas.

## Instalación

1. Copiar `src/env.example.js` a `src/env.js` y poner ahí la URL de tu instancia
   de AgilityTask. Es opcional: sin ese archivo la extensión arranca con la URL
   vacía y la escribes en Configuración.
2. `chrome://extensions` → activar **Modo de desarrollador**.
3. **Cargar descomprimida** → elegir esta carpeta.
4. Clic en el icono de la extensión → se abre el tablero.
5. Pestaña **Configuración**: revisar la URL base, pegar la API key, **Probar
   conexión**, **Cargar proyectos**, elegir el proyecto y **Guardar**. La primera
   vez Chrome pide autorizar el host de la API; hay que aceptar.

La API key se guarda en `chrome.storage.local` de este navegador. No está en el
código ni se envía a ningún destino que no sea la URL base configurada. Cada
quien configura la suya: la extensión ve exactamente los proyectos que ve esa
cuenta.

## La URL de la instancia no está en el repo

`src/env.js` queda fuera de git (`.gitignore`); el repo solo trae
`src/env.example.js` con una URL de ejemplo. El manifest tampoco fija el host:
declara `optional_host_permissions` y la extensión pide permiso en tiempo de
ejecución **solo para el host que configures**, al pulsar Probar conexión,
Cargar proyectos o Guardar. Si se revoca ese permiso, el tablero lo dice y
vuelve a pedirlo desde Configuración.

## Qué muestra

- **Encabezado**: las pestañas van arriba a la derecha; debajo, los selectores
  de proyecto y de grupo, y el botón Actualizar. El de proyecto lista los
  proyectos que ve la cuenta de la API key, así que se cambia de proyecto sin
  entrar a Configuración; al cambiarlo se reinicia el grupo elegido y el árbol
  abierto del pivote, que son del proyecto anterior. Si ningún objetivo del
  proyecto encaja con el patrón de agrupación, aparece un icono de aviso junto a
  los selectores; el detalle está en su tooltip, al pasar el ratón o al enfocarlo
  con el teclado.
- **Selector de grupo**: junta los objetivos que comparten una convención de
  nombre, de modo que un entregable repartido en varios objetivos se ve como
  uno solo. Ver «Agrupación de objetivos» más abajo.
- **Burndown**: línea ideal recta del inicio al fin del rango y línea real de
  tareas abiertas, reconstruida con `completedAt` de cada tarea cerrada. Se
  calcula en cada consulta; no hay histórico guardado.
- **Tareas por desarrollador**: barras apiladas por estado y tabla con
  completadas / en revisión / en curso / por hacer / vencidas / % de avance.
- **Objetivos del entregable**: tabla pivote de tres niveles. Cada objetivo se
  expande en las personas que lo trabajan, con sus propias tareas, completadas,
  vencidas y % de avance; cada persona se expande en sus tareas, y pulsar una
  abre su detalle en el tab Buscar. Una tarea con dos asignados cuenta y
  aparece bajo cada uno, así que la suma de las personas puede superar el total
  del objetivo. Plegar un objetivo pliega también las personas que colgaban de
  él.
- **Tabla de tareas**: Id, Prioridad, Tarea, Asignado, % Avance, Fecha con
  semáforo y Estado. Ordenable por cualquier columna. Los filtros de asignado,
  estado y vencimiento aceptan varias opciones a la vez: se marcan con casillas
  y suman, no intersectan —«En curso» más «Completada» muestra las dos—. Nada
  marcado significa sin filtro. El botón «Limpiar filtros» aparece solo cuando
  hay alguno puesto.
- **Agenda**: calendario mensual con la lista de tus tareas abiertas al lado.
  Arrastras una tarea a un día para planificar cuándo la vas a trabajar; la
  arrastras a otro día para moverla, al listado o a la × para desagendarla. El
  buscador de la lista filtra por nombre o por Id. Doble clic sobre una tarea,
  en el calendario o en la lista, la abre en el tab Buscar con su detalle. Por
  defecto muestra las del entregable seleccionado; la casilla amplía a todo el
  proyecto. El día que tiene vencimientos lo avisa en la esquina, aparte de lo
  agendado. Debajo del calendario, la casilla «Mostrar las tareas que cerré»
  dibuja también lo ya completado en el día en que se cerró, en gris y tachado:
  es historia, no se arrastra ni se desagenda, pero el doble clic abre su
  detalle. Las dos casillas recuerdan su estado entre sesiones.
- **Buscar**: por nombre o Id sobre todas las tareas del proyecto, con el
  detalle completo de la que elijas: avance, asignados, fechas (límite,
  original si fue extendida, creación, última edición, cierre), objetivo,
  horas, tipo, tarea madre, etiquetas, feedback y descripción.

Semáforo de la columna Fecha: rojo = vencida, ámbar = vence en 3 días o menos,
verde = al día, verde tenue = completada, gris = sin fecha.

## La agenda no toca AgilityTask

El día en que piensas trabajar una tarea se guarda en `chrome.storage.local` de
este navegador, en una clave aparte (`schedule`), como `{ idTarea: 'AAAA-MM-DD' }`.
No se escribe en AgilityTask, no lo ve el equipo y no pisa el `dueDate`, que es
el compromiso con el cliente. Si reinstalas la extensión o limpias los datos del
sitio, la agenda se pierde; las tareas no.

La lista lateral muestra las tareas asignadas a la cuenta de la API key, en
estado Por hacer, En curso o En revisión. Las cerradas se ubican por
`completedAt`, con `updatedAt` como respaldo cuando la tarea se cerró sin
sellarlo; una tarea sin ninguna de las dos fechas no se dibuja en ningún día.

## Agrupación de objetivos

El selector de arriba junta objetivos por lo que coincide con una expresión
regular sobre su título, configurable en Configuración. El patrón por defecto
reconoce las convenciones más usadas:

```
(entregable|fase|hito|sprint|etapa|release)\s*\d+
```

Lo que coincide es el nombre del grupo, así que «Entregable 3 - Documentación» y
«Entregable 3 — Pagos» caen juntos bajo «Entregable 3», y «Sprint 10» ordena
después de «Sprint 2», no antes. Los objetivos del proyecto que no coincidan
quedan en un grupo «Sin agrupar» al final.

Si el proyecto no tiene ninguna convención —ningún objetivo coincide, o dejas el
patrón en blanco— el selector arranca en **«Mostrar todos»**, que junta todos los
objetivos del proyecto, y debajo quedan los objetivos sueltos por si quieres
mirar uno solo. Con un único objetivo no se agrega «Mostrar todos», que sería el
mismo grupo repetido. Un patrón inválido se trata como patrón en blanco,
no rompe la vista. Para una convención propia basta con escribirla:
`EPIC-\d+`, `R\d+\.\d+`, lo que use el equipo.

## Criterios de conteo

- Las tareas `DISCARDED` quedan fuera de todos los totales, del burndown y de la
  carga por desarrollador. Solo aparecen si se las filtra a propósito.
- Una tarea `COMPLETED` cuenta como 100 % de avance aunque su campo `progress`
  diga otra cosa, y nunca se marca como vencida.
- Una tarea con dos asignados suma a los dos en la carga por desarrollador: la
  suma de la columna Total puede superar el número de tareas.
- Las subtareas cuentan como tareas.
- Rango por defecto del burndown: de la tarea más antigua del entregable al
  vencimiento más lejano. Se puede fijar a mano en Configuración.

## Por qué no usa los contadores del objetivo

`GET /objectives` trae `totalTasks` y `progress` por objetivo, pero pueden estar
desactualizados: se han visto objetivos reportando bastantes menos tareas de las
que apuntan a ellos por `objectiveId`, sin que ninguna regla (excluir subtareas,
excluir descartadas, filtrar por tipo) explique la diferencia. `completedTasks`
sí coincide.

El tablero cuenta siempre desde `GET /tasks` filtrando por `objectiveId`, que es
el dato vivo. Por eso sus totales pueden no cuadrar con los que muestra la vista
de objetivos de AgilityTask.

## Paginación

`GET /tasks`, `/objectives` y `/members` paginan con `limit=20` por defecto y
recortan `limit` a 100 sin avisar. El cliente drena todas las páginas y compara
contra `meta.total`: si faltan registros aborta con error en vez de dibujar un
burndown a medias.

## Pruebas

```
npm test
```

Sin dependencias: solo Node. `scripts/dom-double.mjs` es un doble mínimo de DOM
y de las APIs de `chrome` —unas cien líneas— que permite arrancar
`src/dashboard.js` fuera del navegador.

- `model.test.mjs`: semáforo, exclusión de descartadas, doble asignación,
  agrupación de objetivos (convención, sin convención, patrón propio o
  inválido) y la forma de la curva de burndown.
- `view.test.mjs`: la grilla del calendario, que lo agendado caiga en su día,
  el aviso de vencimiento, el detalle de tarea, el pivote de objetivos (qué se
  ve en cada nivel, la tarea compartida bajo sus dos dueños, la descartada
  fuera) y el escapado de HTML en títulos y descripciones.
- `startup.test.mjs`: el arranque completo del tablero. Sin configuración no
  revienta y no llama a la API; con configuración consulta, agrupa y pinta;
  soltar una tarea en un día la guarda en `chrome.storage`; el doble clic abre
  el tab Buscar con el detalle; y la casilla de tareas cerradas las dibuja en su
  día y recuerda la elección al reabrir; y el pivote de objetivos abre un nivel
  por pulsación hasta llegar al detalle de la tarea; y cambiar de proyecto desde
  el encabezado guarda el nuevo, limpia el grupo anterior y vuelve a consultar.
  El doble de DOM devuelve `null` para un
  id que no exista en `dashboard.html`, así que un id mal escrito también falla
  aquí.
