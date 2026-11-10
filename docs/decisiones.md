# Decisiones de arquitectura

Cada decisión sigue el formato ADR: contexto, decisión, alternativas consideradas y consecuencias. Estados posibles: **Propuesta** (pendiente de confirmar), **Aceptada**, **Sustituida** (indica por cuál).

Resumen y visión general en el [README principal](../README.md).

---

## ADR-001 · Ordenador de a bordo que se conecta al backend

- **Estado:** Aceptada
- **Contexto:** la controladora de vuelo (ArduPilot) solo habla MAVLink por puerto serie o por radio. No puede conectarse a internet ni ejecutar nuestro código, pero la app y el backend necesitan comandar el dron.
- **Decisión:** el dron lleva una Raspberry Pi conectada por cable a la controladora. En ella corre el servicio de a bordo (Python + pymavlink), que traduce órdenes de alto nivel a MAVLink. Es el dron quien abre la conexión con el backend (`/ws/drone/{identifier}`).
- **Alternativas consideradas:**
  - *Móvil conectado directamente al dron* (puente WiFi–MAVLink a bordo). Menor latencia y funciona sin internet, pero el alcance es corto y habría que reescribir la lógica de pymavlink en TypeScript, con módulos nativos de UDP en la app.
  - *El backend habla MAVLink directamente*, reenviando MAVLink tal cual por la red (por ejemplo, con mavlink-router). Reutiliza los scripts sin cambios, pero exige un enlace directo con el dron, no funciona detrás de NAT ni en redes móviles, expone MAVLink a internet sin autenticación, satura el enlace con telemetría y hace que la seguridad del vuelo dependa de la red.
- **Consecuencias:**
  - ✅ El mismo código funciona en simulación y en el dron real; solo cambia la conexión.
  - ✅ Reutiliza lo aprendido con los scripts de pymavlink.
  - ✅ El backend no necesita saber MAVLink.
  - ⚠️ Hardware extra a bordo (peso y alimentación) y un componente más que desplegar.

## ADR-002 · Órdenes de alto nivel con un catálogo cerrado de acciones

- **Estado:** Aceptada
- **Contexto:** las órdenes viajan por la red, con latencia variable. Además, en el futuro no solo las dará una persona: también un comportamiento autónomo, como una red neuronal ([ADR-011](#adr-011--la-red-neuronal-queda-fuera-del-alcance-inicial)).
- **Decisión:** las órdenes son acciones de un catálogo cerrado (armar, despegar, ir a un punto, aterrizar, seguir…). Cada acción define sus parámetros, precondiciones, condición de fin y tiempo máximo (patrón Command). Las acciones y los mensajes son modelos Pydantic de un paquete compartido (`protocol/`) que usan tanto el backend como el servicio de a bordo. Catálogo en [acciones-y-protocolo.md](acciones-y-protocolo.md).
- **Alternativas consideradas:** reenviar mensajes MAVLink arbitrarios desde la app; definir mensajes libres sin catálogo.
- **Consecuencias:**
  - ✅ Las órdenes toleran latencia.
  - ✅ Menos superficie de ataque: el dron solo ejecuta lo que está en el catálogo.
  - ✅ La app puede activar o desactivar botones según las precondiciones.
  - ✅ El catálogo es el espacio de acciones que usará una futura red neuronal.
  - ⚠️ Cada capacidad nueva exige añadir una acción al catálogo.

## ADR-003 · Control manual con hombre muerto

- **Estado:** Aceptada (2026-11-10)
- **Contexto:** la app tiene flechas para mover el dron (adelante, atrás, izquierda, derecha, subir y bajar). El protocolo inicial mandaba `{"type": "move", "dir": "forward", "active": true}` al pulsar y `active: false` al soltar. Si el mensaje de soltar se pierde, el dron seguiría moviéndose. Y mientras el botón está pulsado no viaja ningún mensaje, así que el dron no puede distinguir "sigue pulsado" de "se ha perdido la conexión".
- **Decisión:** se mantiene el formato `move`, pero **mientras el botón esté pulsado la app repite el mensaje cada 200 ms**. El servicio de a bordo convierte cada dirección activa en una consigna de velocidad (por defecto 1 m/s, relativa al morro del dron) y **la anula si no recibe repetición en 500 ms**. `stop` detiene el dron inmediatamente. Cómo se traduce esa consigna a MAVLink está en [ADR-012](#adr-012--control-manual-con-consignas-de-velocidad-en-modo-guided).
- **Mensajes atrasados (2026-11-10):** tras un corte de red, los `move` acumulados llegan de golpe y moverían el dron cuando el usuario ya ha soltado el botón. Por eso cada `move` lleva `sent_at` (hora del servidor, que la app conoce por el mensaje `welcome`). El backend y el servicio de a bordo **descartan los `move` con más de 500 ms de antigüedad**. `stop` no caduca nunca.
- **Alternativas consideradas:** solo mensajes al pulsar y soltar (el problema descrito arriba); joystick analógico (más mensajes y más sensible a la latencia, se deja para más adelante).
- **Consecuencias:**
  - ✅ Ante cualquier fallo, el dron se para en medio segundo como máximo.
  - ⚠️ Más tráfico: unos 5 mensajes por segundo por botón pulsado, que sigue siendo poco.
  - ⚠️ A 1 m/s y con 200 ms de latencia, el dron recorre unos 20 cm más después de soltar.

## ADR-004 · La seguridad del vuelo reside en el dron

- **Estado:** Aceptada
- **Contexto:** la red puede fallar en cualquier momento, y un dron en vuelo no puede quedarse esperando a que vuelva.
- **Decisión:** dos barreras independientes en el propio dron:
  1. **ArduPilot:** failsafe de estación de tierra (`FS_GCS_ENABLE`, alimentado por un HEARTBEAT a 1 Hz del servicio de a bordo), batería (`BATT_FS_*`) y geovalla (`FENCE_*`).
  2. **Servicio de a bordo:** límites de altura, distancia y velocidad; caducidad de órdenes; hombre muerto del control manual; pérdida del backend: mantener posición a los 5 s y volver a casa a los 30 s (configurable).

  Prioridad entre fuentes de órdenes: **seguridad > operador > comportamiento autónomo**.
- **Consecuencias:**
  - ✅ El dron vuela de forma segura aunque el backend se caiga.
  - ⚠️ Los parámetros de ArduPilot pasan a formar parte de la configuración del proyecto: hay que documentarlos y versionarlos.

## ADR-005 · WebSocket como transporte inicial, un solo proceso de backend

- **Estado:** Aceptada (2026-11-10)
- **Contexto:** hacen falta canales bidireccionales app ↔ backend y dron ↔ backend. Las dos opciones habituales son WebSocket y MQTT.
- **Decisión:** WebSocket en FastAPI para los dos canales, con un formato de mensajes independiente del transporte. Las conexiones activas se guardan en memoria (un "hub"), lo que obliga a ejecutar **un solo proceso de uvicorn**.
- **Alternativas consideradas:** MQTT con un broker (Mosquitto). Aporta aviso automático de desconexión (*last will*), calidad de servicio y está pensado para redes inestables. A cambio, añade una pieza al despliegue, y su calidad de servicio no sustituye a la confirmación de la propia aplicación. Además, con sesiones persistentes puede entregar órdenes con retraso al reconectar, que es justo lo que no queremos.
- **Consecuencias:**
  - ✅ Un único stack (FastAPI).
  - ⚠️ La reconexión y la detección de desconexión las implementamos nosotros.
  - ⚠️ No escala a varios procesos sin algo como Redis o MQTT.
  - **Revisar si:** hace falta más de un proceso de backend, hay decenas de drones o se pasa a 4G real.

## ADR-006 · Sesión con token de acceso corto y renovación revocable; clave propia por dron

- **Estado:** Aceptada (2026-11-10)
- **Contexto:** un JWT no se puede revocar antes de que caduque. Robar un token de usuario equivale a controlar sus drones (RNF2), y robar la clave de un dron permite suplantarlo (RNF4).
- **Decisión:**
  - **Usuarios:** contraseña con bcrypt. Token de acceso JWT de unos 15 minutos y token de renovación guardado (hasheado) en la base de datos, revocable y rotado en cada uso.
  - **WebSocket de la app:** la app pide por HTTP autenticado un *ticket* de un solo uso y lo presenta al conectarse, así el token no viaja en la URL. El servidor cierra la conexión si se revoca la sesión.
  - **Drones:** el servidor genera una clave aleatoria (`secrets.token_urlsafe(32)`), la muestra una sola vez y guarda su SHA-256, que se compara con `hmac.compare_digest`. El dron la presenta en la cabecera `Authorization`. Regenerarla invalida la anterior y corta la conexión del dron.
  - **Autorización:** cada orden comprueba que el dron pertenece al usuario.
  - **Fuera de la red local:** HTTPS y `wss://` obligatorios.
- **Alternativas consideradas:** JWT de larga duración (irrevocable); sesiones guardadas en el servidor (revocables, pero con consulta a la base de datos en cada petición).
- **Consecuencias:**
  - ✅ Un token robado deja de servir en 15 minutos como máximo, o al momento si se revoca la sesión.
  - ⚠️ Hace falta una tabla de tokens de renovación y la lógica de rotación.

## ADR-007 · SQLite + SQLModel; la telemetría no se guarda

- **Estado:** Aceptada
- **Contexto:** hay pocos datos y pocos usuarios, y el despliegue debe ser simple.
- **Decisión:** SQLite con SQLModel; se migrará a PostgreSQL si el despliegue lo exige. Se guardan usuarios, drones, tokens de renovación e historial de órdenes. **La telemetría solo se reenvía, no se guarda:** el registro detallado del vuelo ya lo escribe ArduPilot en sus logs (`.bin`).
- **Consecuencias:**
  - ✅ No hay nada que desplegar aparte del backend.
  - ⚠️ Las escrituras concurrentes son limitadas, aunque suficientes para esta escala.

## ADR-008 · Fotos en base64 dentro del JSON, guardadas en disco

- **Estado:** Aceptada
- **Contexto:** las fotos de drones y perfiles se suben desde la app, tanto en web como en móvil.
- **Decisión:** la foto viaja en base64 dentro del mismo JSON que el formulario (`expo-image-picker` con `base64: true`). El backend la guarda en `media/` con un nombre aleatorio y solo almacena la ruta. Detalles y reglas de validación en [backend/README.md](../backend/README.md#fotos-base64-en-el-json--archivos-en-disco).
- **Alternativas consideradas:** `multipart/form-data` con `python-multipart`. Es más eficiente, pero obliga a tener código distinto en web y en móvil.
- **Consecuencias:**
  - ✅ Un solo formato de petición y el mismo código en todas las plataformas.
  - ⚠️ El base64 ocupa alrededor de un 33 % más, así que se limita el tamaño y se comprime en el cliente.

## ADR-009 · Seguimiento como comportamiento propio en modo GUIDED

- **Estado:** Aceptada (2026-11-10)
- **Contexto:** hay dos formas de que el dron siga al usuario (RF9): el modo FOLLOW nativo de ArduPilot (probado en `followed_system.py`), o un comportamiento propio que manda consignas en modo GUIDED.
- **Decisión:** comportamiento propio. El servicio de a bordo recibe la posición del objetivo y manda consignas a la controladora a 5 Hz como máximo. El origen del objetivo es intercambiable: GPS del móvil en real, `walk_sim` en pruebas.
- **Alternativas consideradas:** modo FOLLOW nativo. Supone menos código y está muy probado, pero es una caja negra y no sirve como base para la red neuronal.
- **Consecuencias:**
  - ✅ Es el mismo mecanismo que usará un comportamiento basado en red neuronal.
  - ✅ Control total sobre distancia, desfase y suavizado (el GPS del móvil tiene unos 5 m de error).
  - ⚠️ Más código propio que probar. FOLLOW se mantiene como referencia para comparar resultados.

## ADR-010 · Versión estable y fija de ArduCopter

- **Estado:** Aceptada (2026-11-10). Falta elegir la versión.
- **Contexto:** el SITL local usa la rama `master` de ArduPilot (4.8.0-dev), que cambia a diario.
- **Decisión:** fijar un tag estable (el último `Copter-4.x` estable disponible), documentarlo aquí y usar la misma versión en la controladora real.
- **Consecuencias:**
  - ✅ Resultados reproducibles y una versión que se puede citar en la memoria.
  - ⚠️ Las novedades de ArduPilot se incorporan solo cuando se decide actualizar.

## ADR-011 · La red neuronal queda fuera del alcance inicial

- **Estado:** Aceptada (2026-10-09)
- **Contexto:** el objetivo a largo plazo incluye una red neuronal que mapee el entorno y siga al usuario visualmente.
- **Decisión:** el alcance inicial es el control por código: acciones básicas, control manual y seguimiento por GPS. La red neuronal queda como trabajo futuro, pero con su punto de extensión diseñado: será un comportamiento más que emite acciones del catálogo, con menos prioridad que el operador ([ADR-004](#adr-004--la-seguridad-del-vuelo-reside-en-el-dron)).
- **Consecuencias:**
  - ✅ Alcance realista y arquitectura preparada para crecer.
  - ⚠️ Cuando llegue, conviene una Raspberry Pi 5, a ser posible con acelerador de IA.

## ADR-012 · Control manual con consignas de velocidad en modo GUIDED

- **Estado:** Aceptada (2026-11-10)
- **Contexto:** las flechas de la app deben mover el dron como lo haría un mando: mientras se pulsa "adelante", el dron avanza; al soltar, se queda quieto. Hay que decidir con qué mensajes MAVLink se consigue. ArduCopter ofrece tres vías (comprobadas en el código de `ArduCopter/GCS_MAVLink_Copter.cpp`):

  | Vía | Qué se manda | Modo de vuelo | Qué significa |
  |---|---|---|---|
  | `SET_POSITION_TARGET_LOCAL_NED` | Velocidad en m/s en los ejes del dron | GUIDED | "Avanza a 1 m/s" |
  | `MANUAL_CONTROL` | Posición de las palancas, de −1000 a 1000 (gas de 0 a 1000) | LOITER, ALT_HOLD… | "Palanca de cabeceo al 50 %" |
  | `RC_CHANNELS_OVERRIDE` | Valor PWM de cada canal (1000–2000) | LOITER, ALT_HOLD… | "Canal 2 a 1300" |

- **Decisión:** las flechas se traducen a **consignas de velocidad en el sistema de ejes del dron**, con `SET_POSITION_TARGET_LOCAL_NED` en modo GUIDED:
  - `coordinate_frame = MAV_FRAME_BODY_OFFSET_NED` (9): `vx` es hacia el morro, `vy` hacia la derecha y `vz` hacia abajo.
  - `type_mask = 0x05C7` (1479): se ignoran posición, aceleración y rumbo; se usan la velocidad y la velocidad de giro (`yaw_rate`).
  - Correspondencia, con `v` = velocidad horizontal (1 m/s por defecto) y `vz` = velocidad vertical (0,5 m/s por defecto):

    | Flecha | `vx` | `vy` | `vz` |
    |---|---|---|---|
    | Adelante / atrás | `+v` / `−v` | 0 | 0 |
    | Derecha / izquierda | 0 | `+v` / `−v` | 0 |
    | Subir / bajar | 0 | 0 | `−vz` / `+vz` |

    Las direcciones activas se suman (adelante y subir a la vez es `vx = +v`, `vz = −vz`). `yaw_rate = 0` mantiene el rumbo; dos flechas de giro serían `yaw_rate = ±ω` sin cambiar nada más.
  - Mientras haya alguna dirección activa, el servicio de a bordo **reenvía la consigna a 5 Hz**. Cuando no queda ninguna, manda velocidad cero y el dron frena y mantiene la posición.
  - Si ArduPilot deja de recibir consignas, detiene el dron por su cuenta a los `GUID_TIMEOUT` segundos (3 por defecto; se bajará a 1). Es una tercera barrera, además del hombre muerto de 500 ms ([ADR-003](#adr-003--control-manual-con-hombre-muerto)) y de los failsafes ([ADR-004](#adr-004--la-seguridad-del-vuelo-reside-en-el-dron)).
- **Alternativas consideradas:** emular el mando con `MANUAL_CONTROL` o `RC_CHANNELS_OVERRIDE` en modo LOITER. Es lo más parecido a volar con una emisora, y funciona también sin GPS en ALT_HOLD. Se descarta por ahora porque:
  - Se mandan posiciones de palanca, no velocidades: los límites de velocidad dependerían de parámetros de ArduPilot (`LOIT_SPEED`…) y no del servicio de a bordo.
  - El gas no es una velocidad: hay que mandar siempre el punto medio para mantener la altura, y un valor erróneo hace caer o subir al dron.
  - Depende de la calibración y el orden de los canales (`RCMAP_*`, `RCx_MIN/MAX`, inversiones), que cambian de un dron a otro.
  - Obliga a salir de GUIDED y volver para cada acción (`goto`, `follow`), y ArduPilot solo acepta estos mensajes del sistema configurado como estación de tierra.
  - Sin emisora real, al caducar los valores (`RC_OVERRIDE_TIME`, 3 s) entra en juego el failsafe de radio, que habría que configurar aparte.
- **Consecuencias:**
  - ✅ Las flechas, las acciones y los comportamientos usan el mismo modo (GUIDED) y el mismo tipo de consigna; una futura red neuronal también.
  - ✅ Las unidades son m/s: los límites de velocidad se aplican en el servicio de a bordo y son los mismos en cualquier dron.
  - ⚠️ Necesita posición fiable (GPS o equivalente): sin ella, GUIDED no funciona y no hay control manual.
  - ⚠️ El tacto es el de un mando digital (todo o nada). La aceleración y el frenado los decide ArduPilot.
  - **Revisar si:** se añade un joystick analógico (bastaría con mandar velocidades proporcionales) o hay que volar sin GPS (entonces sí haría falta `MANUAL_CONTROL` en ALT_HOLD).

## ADR-013 · Parada de emergencia

- **Estado:** Propuesta (2026-11-10)
- **Contexto:** el catálogo no tenía ninguna forma de parar los motores en vuelo. Si el dron va hacia una persona o no responde a `land` ni a `hold`, el operador no puede hacer nada.
- **Decisión:** se añade la acción `emergency_stop`, que desarma los motores de inmediato con `MAV_CMD_COMPONENT_ARM_DISARM` (`param1 = 0`, `param2 = 21196` para forzarlo en vuelo). Es la única acción sin precondiciones y se acepta también durante un failsafe. En la app exige mantener pulsado el botón para evitar toques accidentales.
- **Alternativas consideradas:** `MAV_CMD_DO_FLIGHTTERMINATION` (pensado para paracaídas, requiere configurar `AFS_*`); no ofrecer parada y confiar en `land`.
- **Consecuencias:**
  - ✅ Existe una última salida ante un comportamiento peligroso.
  - ⚠️ **El dron cae.** Es peor que `land` en casi todos los casos, y hay que explicarlo en la app.
  - ⚠️ Como cualquier orden, depende de que haya red; no sustituye a los failsafes de ArduPilot.
