# Pendientes

Listas separadas por tema, salidas de la revisión del 2026-11-15. Cada punto enlaza con el documento que lo explica. Los identificadores (D-xx, V-xx) son los del [informe de revisión](revision-2026-11-15.md).

Las listas A–D son del proyecto actual. Las listas E y F son **ideas**: no hay que hacer nada salvo no impedirlas.

## A · Decisiones que tienes que tomar

- [ ] **ADR-010:** fijar la versión. Copter-4.7.0 es la estable y el tag está en el checkout local; mirar si ya hay 4.7.x.
- [ ] **ADR-013:** aceptar o descartar `emergency_stop`.
- [ ] **`hold`:** velocidad cero en GUIDED o modo BRAKE, tras probarlo en SITL ([V-03](revision-2026-11-15.md#v-03)).
- [ ] **`move`:** dejarlo por dirección o pasarlo a vector ([propuesta](viabilidad-arquitectura-y-protocolos.md#una-simplificación-a-valorar-move-como-vector)).
- [ ] **Un operador o varios** por dron.
- [ ] **`DroneType`:** mantenerlo o cambiarlo por tipo de vehículo.
- [ ] **`takeoff`:** si arma por sí mismo cuando hace falta (D-08).
- [ ] **Conexión del dron en el campo:** punto de acceso del móvil o módem 4G ([V-01](revision-2026-11-15.md#v-01)).
- [ ] **Emisora de radio** en la lista de hardware ([V-02](revision-2026-11-15.md#v-02)).

## B · Correcciones a los documentos

No he tocado los documentos de diseño. Cuando decidas, se actualizan.

- [ ] D-01: añadir `follow` a las tablas de acciones y de comandos.
- [ ] D-02: escribir a qué modo cambia `hold` (depende de la lista A).
- [ ] D-03: ejemplo y campos de `welcome`; `protocol_version`.
- [ ] D-04: llevar al documento del protocolo el `stop` por desconexión del operador.
- [ ] D-05: completar los códigos de `reason`.
- [ ] D-06: campos de seguridad en `telemetry`.
- [ ] D-07: reenviar el motivo de ArduPilot en `detail`.
- [ ] D-09: RNF1 con una cifra por escenario.
- [ ] D-10: dependencias con versión fijada.
- [ ] README: marcar "monorepo con git" como hecho en la fase 0.
- [ ] Borrar `Piloto/frontend-trial/frontend-trial` y poner al día `explanation.md`.

## C · Arquitectura y protocolo

Detalle en [viabilidad-arquitectura-y-protocolos.md](viabilidad-arquitectura-y-protocolos.md).

Antes de escribir el servicio de a bordo:

- [ ] Exportar el catálogo a JSON Schema y generar los tipos de la app ([V-08](revision-2026-11-15.md#v-08)).
- [ ] Diseñar el lector único de MAVLink y su convivencia con `asyncio` (V-09).
- [ ] Definir la resincronización al reconectar y el descarte de órdenes repetidas ([V-05](revision-2026-11-15.md#v-05)).
- [ ] Heartbeat a la controladora ligado a la salud del bucle, con identificador de sistema propio ([V-06](revision-2026-11-15.md#v-06)).
- [ ] El núcleo del servicio no conoce el transporte (regla 1 del modo directo).
- [ ] Enviar la consigna en cuanto cambia, además de a 5 Hz.

Antes de cerrar el backend:

- [ ] Latido de protocolo cada 1–2 s en los dos canales ([V-04](revision-2026-11-15.md#v-04)).
- [ ] Desfase de reloj medido con el latido, no con una sola muestra (V-07).
- [ ] Cola de telemetría de tamaño uno por cliente (V-11).
- [ ] Campo `source` en `command` y en `CommandLog` (V-17).
- [ ] Modo de registro de tiempos para experimentos (V-13).

Antes del hardware:

- [ ] Documentar la Raspberry: alimentación, arranque automático, puerto serie, hora, clave (V-12).
- [ ] Confirmar la normativa con AESA (V-15).

## D · Pruebas

Detalle en [plan-de-pruebas.md](plan-de-pruebas.md).

- [ ] Carpeta de mensajes de ejemplo, válidos e inválidos (nivel 0).
- [ ] Primera prueba en SITL: consigna de velocidad de ADR-012.
- [ ] Segunda prueba en SITL: `hold` sin mando.
- [ ] Controladora falsa y reloj controlable para el nivel 1.
- [ ] Una prueba por acción contra SITL (RNF6).
- [ ] Dron falso para las pruebas del backend.
- [ ] Perfiles de red con `netem`.
- [ ] Recorrer la [matriz de fallos](plan-de-pruebas.md#matriz-de-fallos).
- [ ] Comprar: 1–3 ESP32, adaptador USB-serie de 3,3 V, cables, LED.
- [ ] ESP32 U1: dron falso por WiFi.
- [ ] ESP32 U3: banco del hombre muerto con LED.
- [ ] ESP32 U4: medir la latencia de punta a punta.
- [ ] SITL por cable contra el UART de la Raspberry (nivel 5).
- [ ] Tabla de medidas de RNF1.

## E · Idea: órdenes por voz

Detalle en [futuro-voz-a-comandos.md](futuro-voz-a-comandos.md). Nada que hacer ahora más allá de C.

Si algún día se empieza:

- [ ] Conjunto de frases en español con su orden esperada.
- [ ] Prototipo sin modelo de lenguaje: reconocedor del sistema y reglas.
- [ ] Tabla de confirmación por acción.
- [ ] Acción de movimiento relativo en el catálogo (V-14).
- [ ] Comparar reglas, modelo local restringido y modelo en la nube sobre el mismo conjunto.

## F · Idea: agente de IA a bordo

Detalle en [futuro-agente-ia-a-bordo.md](futuro-agente-ia-a-bordo.md). Nada que hacer ahora más allá de C.

Si algún día se empieza:

- [ ] Elegir un caso de uso concreto.
- [ ] Canal local entre el agente y el servicio de a bordo, con hombre muerto.
- [ ] Decidir el hardware según peso y consumo.
- [ ] Simular la cámara en Gazebo.
