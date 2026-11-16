# Viabilidad de la arquitectura y de los protocolos

Dos preguntas:

1. ¿Backend más servicio de a bordo, o un servicio de a bordo que hace también de backend?
2. ¿Aguantan los protocolos elegidos lo que viene: vuelo real, 4G, voz, agente de IA?

Es un análisis, no una decisión. Las decisiones están en [decisiones.md](decisiones.md); lo que aquí se propone aparece como tarea en [pendientes.md](pendientes.md).

## Conclusión

- **Mantener backend + servicio de a bordo** (ADR-001). Es la única opción que cubre varios drones por usuario, cuentas e historial, y es la que mejor se defiende como proyecto de Ingeniería del Software.
- **Dejar abierta la puerta al "modo directo"** (el móvil habla con el dron sin backend) con una sola regla de diseño: el servicio de a bordo no debe saber por dónde le llegan las órdenes.
- **WebSocket + JSON es viable** para todo el TFG, incluido 4G. Su límite conocido es el control manual con mala cobertura, y falla hacia el lado seguro (el dron se para).
- Hay que añadir al protocolo cuatro cosas pequeñas: latido, versión, resincronización al reconectar y origen de la orden.

## 1. Dónde vive el backend

### Las tres topologías

| | A · Backend + servicio de a bordo (actual) | B · El servicio de a bordo es el backend | C · Híbrido: A más modo directo |
|---|---|---|---|
| Camino de una orden | App → backend → dron | App → dron | App → backend → dron, o app → dron |
| Necesita internet | Sí, el móvil y el dron | No | Solo en modo normal |
| Latencia | Dos saltos | Un salto | Según el modo |
| Alcance | El de la red del dron (ilimitado con 4G) | El del WiFi de la Raspberry: decenas de metros | Según el modo |
| Usuarios, historial, varios drones | En un sitio | Repartidos: cada dron tiene su base de datos | En el backend; el dron guarda un diario local |
| Autenticación | Central (ADR-006) | Cada dron gestiona sus usuarios | La más compleja: el dron debe verificar al usuario sin backend |
| Si cae el servidor | Se pierde el control de todos los drones; actúan los failsafes | No hay servidor | Se puede pasar a modo directo |
| Carga en la Raspberry | Solo el servicio | Servicio, API, base de datos y punto de acceso WiFi | Servicio y un servidor mínimo |
| El móvil | Mantiene sus datos | Conectado al WiFi del dron pierde internet (mapas incluidos) | Según el modo |
| Trabajo | El previsto | Menos piezas, pero se rehace la autenticación y la gestión | El previsto más el modo directo |

### Por qué no B

- RF1, RF5, RF6 y RF12 (alta de drones, cuentas, historial) piden un sitio central. Con B, dar de alta un dron sería conectarse a él.
- El punto de acceso de la Raspberry da poco alcance, y con el móvil enganchado a él no hay mapa ni datos.
- Mete una base de datos y un servidor web en el mismo ordenador que vigila la seguridad del vuelo.

B sí tiene sentido para un caso: volar sin cobertura. Eso es el modo directo de C.

### Qué hace falta para que C sea posible más adelante

Nada de esto es trabajo ahora; son reglas para no cerrarse la puerta.

1. **El núcleo del servicio de a bordo no conoce el transporte.** Recibe órdenes ya validadas en forma de objetos del catálogo y emite `ack` y telemetría. Quien las trae (hoy, un cliente WebSocket hacia el backend) es una pieza cambiable. Mañana puede ser un servidor local, un modelo de voz o un agente de IA.
2. **Toda validación que afecte a la seguridad está en el dron.** Ya es así (ADR-004). El backend valida para dar errores pronto, no para proteger el vuelo.
3. **El servicio de a bordo lleva su propio diario de órdenes.** Sirve hoy para reenviar los `ack` perdidos al reconectar ([V-05](revision-2026-11-15.md#v-05)) y mañana para sincronizar el historial tras un vuelo en modo directo.
4. **La autorización se podrá comprobar sin conexión.** Hoy el dron se fía del backend. En modo directo necesitaría verificar por sí mismo un permiso firmado por el backend. No se diseña ahora; basta con no asumir en el código que toda orden viene del backend.

### Escenarios de conexión

| Escenario | Móvil | Dron | Backend | Sirve para |
|---|---|---|---|---|
| E1 · Desarrollo | Navegador en el PC | SITL y servicio en el PC | PC | Fases 0–2 |
| E2 · Red local | WiFi de casa | Raspberry en el mismo WiFi, SITL en el PC | PC | Fase 3a y 3b |
| E3 · Campo, punto de acceso del móvil | 4G | Raspberry conectada al punto de acceso del móvil | Servidor público | Primeros vuelos, cerca |
| E4 · Campo, módem en el dron | 4G | Módem 4G propio | Servidor público | Vuelo con alcance real |
| E5 · Modo directo | WiFi del dron | Punto de acceso propio | No hay | Sin cobertura (futuro) |

Cosas a tener en cuenta:

- **E3 limita el alcance al del punto de acceso del móvil.** Las órdenes van del móvil al servidor por 4G y vuelven al dron por el mismo móvil. Si el dron se aleja, pierde el backend, se para a los 5 s y vuelve a los 30 s. Es aceptable para los primeros vuelos y hay que decirlo en la memoria.
- **E3 y E4 necesitan un servidor accesible desde internet con TLS.** Para pruebas, una red privada tipo Tailscale entre el móvil, el PC y la Raspberry evita desplegar nada: los tres se ven como si estuvieran en la misma red.
- **E4 no cambia el software**, solo el hardware y la configuración. Por eso puede quedarse como trabajo futuro, siempre que E3 baste para la demostración.

## 2. Protocolos, enlace por enlace

### App ↔ backend: HTTPS + WebSocket

| Aspecto | Valoración |
|---|---|
| Compatibilidad | WebSocket funciona igual en React Native y en navegador. El ticket de un solo uso resuelve que el navegador no deje poner cabeceras |
| Alternativas | WebTransport/QUIC no existe en React Native. MQTT sobre WebSocket añade un broker sin ventaja aquí |
| Riesgo | En navegador, una página HTTPS no puede abrir `ws://`: todo cifrado o nada. Micrófono y GPS exigen HTTPS |
| Veredicto | **Viable sin cambios** |

### Dron ↔ backend: WebSocket abierto por el dron

| Aspecto | Valoración |
|---|---|
| NAT y red móvil | Funciona: la conexión es saliente. Las operadoras cortan conexiones inactivas, así que el latido de [V-04](revision-2026-11-15.md#v-04) también mantiene vivo el NAT |
| Pérdidas | WebSocket va sobre TCP: un paquete perdido retiene a los siguientes hasta que se recupera. Con mala cobertura, los `move` llegan a ráfagas |
| Efecto en el control manual | El hombre muerto de 500 ms salta y el dron se para a tirones. **Falla hacia el lado seguro.** `sent_at` evita que la ráfaga mueva el dron después |
| Reconexión | Hay que implementarla (espera creciente con algo de azar) y definir la resincronización ([V-05](revision-2026-11-15.md#v-05)) |
| TLS | Necesita hora correcta en la Raspberry ([V-07](revision-2026-11-15.md#3-huecos-de-viabilidad)) |
| Veredicto | **Viable.** Límite conocido: control manual fino con mala cobertura |

### ¿Y MQTT, o WebRTC?

| Protocolo | Qué aportaría | Por qué no ahora | Cuándo revisarlo |
|---|---|---|---|
| MQTT | Aviso automático de desconexión, clientes maduros en microcontroladores | También va sobre TCP: no arregla las ráfagas. Añade un broker. Las sesiones persistentes entregan órdenes viejas | Decenas de drones o varios procesos de backend (ya en ADR-005) |
| WebRTC, canal de datos | Mensajes sin orden ni reenvío: un `move` perdido se pierde y el siguiente llega a tiempo. Conexión directa móvil ↔ dron cuando la red lo permite | Negociación compleja, servidor de señalización, más código en la Raspberry | **Cuando se añada vídeo.** El vídeo ya obliga a montar WebRTC, y entonces mover `move` a un canal de datos sale casi gratis |
| UDP propio | Mínima latencia | No atraviesa NAT, no existe en navegador, hay que hacer el cifrado a mano | No |

Como el formato de los mensajes no depende del transporte (ADR-005), cambiar de WebSocket a otro canal es sustituir la pieza del punto 1 de "Qué hace falta para C", no rediseñar.

### Servicio de a bordo ↔ controladora: MAVLink por cable

| Aspecto | Valoración |
|---|---|
| Madurez | Es el uso estándar de un ordenador de a bordo con ArduPilot |
| Velocidad | 921600 baudios es lo habitual; 115200 basta para este volumen de mensajes. Las dos puntas deben coincidir |
| Frecuencia de la telemetría | ArduPilot no manda nada útil hasta que se le pide: el servicio debe solicitar cada mensaje con `SET_MESSAGE_INTERVAL` |
| Lectura | Un solo lector ([V-09](revision-2026-11-15.md#3-huecos-de-viabilidad)) |
| Identificadores | El servicio usa un identificador de sistema propio, distinto del de cualquier estación de tierra ([V-06](revision-2026-11-15.md#v-06)) |
| Puerto serie de la Raspberry | En la Pi 4, el UART fiable lo usa el Bluetooth por defecto y hay que liberarlo. En la Pi 5 el dispositivo es otro. Comprobar a qué apunta `/dev/serial0` |
| Veredicto | **Viable.** Los riesgos son de configuración, y se pueden probar sin controladora ([plan de pruebas](plan-de-pruebas.md#nivel-5--raspberry-pi-sin-controladora)) |

### Formato: JSON

Suficiente. La telemetría son unos 250 bytes a 5 Hz, poco más de 1 kB/s. Un formato binario no aporta nada a esta escala y complica depurar. Lo que sí hace falta es que el esquema sea único y compartido ([V-08](revision-2026-11-15.md#v-08)).

## 3. Presupuesto de latencia del control manual

Estimación para ordenar las medidas; hay que sustituirla por datos reales (RNF1).

| Tramo | Red local | 4G en los dos saltos |
|---|---|---|
| Pulsación → mensaje enviado | 20–50 ms | 20–50 ms |
| App → backend | 2–10 ms | 30–80 ms |
| Backend → dron | 2–10 ms | 30–80 ms |
| Espera al siguiente envío a la controladora | 0–200 ms si se espera al ciclo de 5 Hz; casi 0 si se envía al cambiar | Igual |
| Cable y ArduPilot | < 20 ms | < 20 ms |
| **Total hasta que ArduPilot recibe la consigna** | **50–100 ms** | **100–250 ms** |

Dos consecuencias:

- **La consigna debe enviarse en cuanto cambia**, y después repetirse a 5 Hz. Si se espera al siguiente ciclo, ese tramo es el mayor de todos.
- El objetivo de 200 ms se cumple en red local con margen, y en 4G solo a veces. RNF1 debería dar una cifra por escenario.

A esto se suma el tiempo que tarda el dron en acelerar y frenar, que decide ArduPilot y no depende de la red.

## 4. Cambios pequeños que el protocolo necesita

Ninguno rompe lo ya diseñado. Detalle y motivo en el [informe de revisión](revision-2026-11-15.md).

| Cambio | Para qué |
|---|---|
| Latido cada 1–2 s en los dos canales | Detectar desconexiones rápido, mantener vivo el NAT y medir el desfase de reloj |
| `protocol_version` en `welcome` | Rechazar con un error claro un dron o una app con una versión incompatible |
| Mensaje de estado al reconectar, y descarte de `id` repetidos | Que el historial no se quede a medias ni se ejecute una orden dos veces |
| Campo `source` en `command` | Distinguir órdenes manuales, por voz y autónomas en el historial y en las prioridades |
| Campos de seguridad en `telemetry` (failsafe activo, listo para armar, satélites) | Que la app pueda desactivar botones y explicar por qué |
| Texto de ArduPilot en `detail` cuando rechaza una orden | Cumplir RF11: decir por qué |

### Una simplificación a valorar: `move` como vector

Hoy cada flecha manda su propio mensaje (`dir`, `active`) y el dron lleva un temporizador por dirección. Alternativa: un solo mensaje con el estado completo.

```json
{ "type": "move", "x": 1, "y": 0, "z": -1, "yaw": 0, "sent_at": "…" }
```

- Cada mensaje se basta solo: si se pierde uno, el siguiente trae todo el estado. Un único temporizador de hombre muerto.
- Soltar todo es mandar ceros; ya no hay un `active: false` que se pueda perder.
- El joystick analógico de ADR-003 sale gratis: valores entre −1 y 1 en vez de −1, 0 y 1.

A cambio, hay que tocar ADR-003 y el documento del protocolo. Es decisión tuya.
