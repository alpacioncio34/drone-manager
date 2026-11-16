# Plan de pruebas

Cómo comprobar que el sistema hace lo que dicen los documentos, por niveles: de lo que se prueba en el PC sin nada más, a lo que necesita el dron. Incluye el uso de un ESP32 para probar protocolos y enlaces.

Es una propuesta. Describe **qué** probar y **con qué**; el código de las pruebas es parte del desarrollo. Las tareas están en [pendientes.md](pendientes.md).

## Principios

1. **Cada nivel se puede ejecutar sin el siguiente.** Las pruebas del protocolo no necesitan SITL; las de SITL no necesitan la Raspberry; las de la Raspberry no necesitan la controladora.
2. **Probar los fallos, no solo el camino feliz.** Lo que distingue a este proyecto es qué hace el dron cuando algo se rompe. La [matriz de fallos](#matriz-de-fallos) es la parte más importante.
3. **Una prueba por promesa del documento.** Cada fila del catálogo y cada valor de la tabla de seguridad de [acciones-y-protocolo.md](acciones-y-protocolo.md) debería tener al menos una prueba que falle si se incumple (RNF6).
4. **Medir, no solo pasar.** Las pruebas de latencia producen números para la memoria (RNF1).

## Niveles

| Nivel | Qué se prueba | Hace falta | Fase |
|---|---|---|---|
| 0 | Mensajes y catálogo (contrato) | Nada | 0 |
| 1 | Lógica del servicio de a bordo, sin ArduPilot | Nada | 0 |
| 2 | Acciones contra SITL | SITL | 0 |
| 3 | Backend, con un dron falso | Nada | 1 |
| 4 | Sistema completo con red degradada | SITL | 1–2 |
| 5 | Raspberry Pi sin controladora | Raspberry, adaptador USB-serie o ESP32 | 3a |
| 6 | Banco: controladora real, sin hélices | Dron | 3b |
| 7 | Vuelo | Dron, campo | 3c |

### Nivel 0 · Contrato

- El catálogo se exporta a JSON Schema ([V-08](revision-2026-11-15.md#v-08)).
- Una carpeta de **mensajes de ejemplo** (uno válido y varios inválidos por tipo) es la referencia común. Los validan los modelos Pydantic, los tipos de la app y, si se usa, el firmware del ESP32.
- Si alguien cambia un mensaje en un lado y no en los otros, falla aquí, en segundos.

### Nivel 1 · Lógica del servicio de a bordo

Con una controladora falsa (un objeto que responde como ArduPilot) y un reloj que la prueba controla:

- Precondiciones de cada acción: se rechaza lo que el catálogo dice que se rechaza.
- Hombre muerto: una dirección sin repetir se anula a los 500 ms exactos.
- Caducidad: una orden pasada de `expires_at` y un `move` viejo no se ejecutan.
- Prioridades: una orden nueva cancela la anterior; con failsafe activo solo pasan `land`, `rtl` y `emergency_stop`.
- Pérdida del backend: mantener posición a los 5 s, volver a los 30 s.
- Órdenes repetidas con el mismo `id`: se ejecutan una vez.

Controlar el reloj es lo que hace que estas pruebas tarden milisegundos y no den resultados distintos cada vez.

### Nivel 2 · Acciones contra SITL

- Una prueba por acción: se lanza SITL, se ejecuta la acción y se comprueba la condición de fin de la tabla (por ejemplo, altura ≥ 95 % del objetivo).
- SITL acepta un factor de aceleración, así que un despegue no tarda lo que en la realidad.
- Arrancar con los parámetros a valores de fábrica en cada ejecución, y cargar los del proyecto desde un fichero versionado (ADR-004 dice que los parámetros forman parte de la configuración).
- Primera prueba que conviene escribir: la consigna de velocidad de ADR-012 (avanzar 3 s, soltar, comprobar que frena). Es la decisión con más riesgo técnico y aún no está probada.
- Segunda: `hold` sin mando ([V-03](revision-2026-11-15.md#v-03)).

ArduPilot trae su propio sistema de pruebas automáticas contra SITL (`Tools/autotest`), útil como referencia de cómo esperan a que se cumplan condiciones.

### Nivel 3 · Backend

- Con el cliente de pruebas de FastAPI, que abre WebSockets sin red.
- Un **dron falso** (unas líneas que se conectan a `/ws/drone/…`, responden `ack` y mandan telemetría) sustituye al servicio de a bordo.
- Autenticación: ticket usado dos veces, ticket caducado, clave de dron incorrecta, regenerar la clave corta la conexión, token revocado cierra el WebSocket.
- Autorización: un usuario no puede mandar órdenes al dron de otro.
- Historial: cada orden acaba en un estado final.

### Nivel 4 · Sistema completo con red degradada

App (o un cliente de pruebas), backend, servicio de a bordo y SITL, todos en el PC, con la red estropeada a propósito.

Linux trae la herramienta para ello (`tc` con `netem`). Añade retardo, variación, pérdidas y desorden a una interfaz de red:

```bash
sudo tc qdisc add dev <interfaz> root netem delay 80ms 30ms loss 2%   # activar
sudo tc qdisc del dev <interfaz> root                                 # quitar
```

Perfiles a definir una vez y reutilizar:

| Perfil | Retardo | Pérdidas | Representa |
|---|---|---|---|
| Red local | 2 ms | 0 % | E1, E2 |
| 4G bueno | 50 ms ± 15 ms | 0,5 % | E3, E4 con cobertura |
| 4G malo | 150 ms ± 80 ms | 5 % | Borde de cobertura |
| Corte | 100 % durante N segundos | — | Túnel, cambio de antena |

Aplicarlo sobre la interfaz por la que hablan el servicio de a bordo y el backend, no sobre la que une el servicio con SITL: esa simula un cable.

### Nivel 5 · Raspberry Pi sin controladora

Objetivo: validar la Raspberry (puerto serie, arranque, red, rendimiento) antes de tener dron. Tres montajes, de menos a más material:

1. **Raspberry por red contra SITL en el PC** (fase 3a). Prueba el rendimiento y el servicio en ARM, pero no el puerto serie.
2. **SITL por cable.** SITL puede sacar uno de sus puertos serie por un dispositivo real (`--serial2=uart:/dev/ttyUSB0:921600`). Con un adaptador USB-serie de 3,3 V en el PC, cableado al UART de la Raspberry, **la Raspberry cree que habla con una controladora real**. Prueba la configuración del puerto, la velocidad y el cableado con el ArduPilot de verdad al otro lado. Es la prueba con mejor relación entre coste y valor de este nivel.
3. **ESP32 como controladora falsa.** Ver el apartado siguiente.

Además, en la propia Raspberry: el servicio arranca solo al encender, se reinicia si muere, espera a tener hora antes de conectar, y sobrevive a que se le corte la corriente.

### Nivel 6 · Banco

Controladora real, **sin hélices**, batería o fuente.

- Los parámetros del proyecto están cargados (los mismos que en SITL).
- Cada acción recibe el `COMMAND_ACK` esperado. Armar hace girar los motores; despegar no hará nada útil, pero la orden debe aceptarse.
- Desenchufar el cable de la Raspberry: salta el failsafe de estación de tierra.
- Matar el servicio: lo mismo.
- La emisora, si se incluye ([V-02](revision-2026-11-15.md#v-02)), recupera el control sobre la app.

### Nivel 7 · Vuelo

Fuera del alcance de este documento hasta que haya hardware. Mínimo: lista de comprobación antes de cada vuelo, primer vuelo solo con emisora, después acciones de una en una, y los failsafes probados en vuelo a baja altura antes de alejarse. Revisar antes la normativa ([V-15](revision-2026-11-15.md#3-huecos-de-viabilidad)).

## Pruebas con un ESP32

Un ESP32 cuesta menos de 10 €, tiene WiFi y varios puertos serie a 3,3 V (el mismo voltaje que la Raspberry y que los puertos de telemetría de las controladoras). Sirve para cinco cosas distintas.

**Qué no hace:** no prueba el código del servicio de a bordo, porque lo sustituye. Prueba el protocolo, el enlace y el montaje. Y casi todo lo que hace por red también se puede hacer con un portátil; el ESP32 aporta radio real, una implementación independiente y que se puede llevar encima.

| Uso | El ESP32 hace de | Qué demuestra | Valor |
|---|---|---|---|
| U1 | Dron falso por WiFi | Que el protocolo se puede implementar leyendo solo el documento, y que aguanta una radio real | Alto |
| U2 | Controladora falsa por cable | Que la Raspberry lee y escribe MAVLink por su UART | Medio (el montaje 2 del nivel 5 es más fiel) |
| U3 | Banco del hombre muerto | Que al cortar la red, el movimiento cesa en ≤ 500 ms. Con un LED, se ve | Alto para la defensa |
| U4 | Sonda de latencia | Cuánto tarda de verdad una orden, medido con hardware | Alto para la memoria |
| U5 | Puente de telemetría | Un segundo enlace independiente con el dron real | Para la fase 3c |

### U1 · Dron falso por WiFi

El ESP32 se conecta a `/ws/drone/{identifier}` con la clave en la cabecera `Authorization`, responde a cada `command` con `ack` y manda telemetría inventada. Las librerías de WebSocket para ESP32 (la de Espressif y las de Arduino) admiten cabeceras propias, TLS y reconexión.

Qué se aprende:

- **Interoperabilidad.** Si un programa en C escrito solo con `acciones-y-protocolo.md` funciona contra el backend, el documento está completo. Cada duda que surja al escribirlo es un hueco del documento.
- **Radio real.** Alejarse con el ESP32 en la mano hasta perder el WiFi y volver: se ve la reconexión, cuánto tarda el backend en marcarlo desconectado ([V-04](revision-2026-11-15.md#v-04)) y qué muestra la app.
- **Reloj.** El ESP32 arranca sin hora, como una Raspberry Pi 4 sin red. Obliga a resolver el desfase con `welcome` y el problema de TLS sin fecha ([V-07](revision-2026-11-15.md#3-huecos-de-viabilidad)).
- **Varios drones.** Tres ESP32 son tres drones conectados a la vez por pocos euros.

### U2 · Controladora falsa por cable

El ESP32 manda `HEARTBEAT` y algo de telemetría MAVLink por un UART cableado al de la Raspberry (TX con RX cruzados, y masa común). La librería MAVLink en C es solo cabeceras y funciona en microcontroladores.

- Valida la configuración del puerto serie de la Raspberry y la velocidad.
- Permite fallos difíciles de provocar con una controladora de verdad: dejar de mandar heartbeats, mandar basura, responder tarde o no responder a un comando.
- Para comportamiento real de ArduPilot, usar SITL por cable (montaje 2 del nivel 5); el ESP32 es mejor para los fallos.

### U3 · Banco del hombre muerto

El dron falso de U1 enciende un LED mientras tiene alguna dirección activa. Se mantiene pulsada una flecha en la app y se corta el WiFi (apagar el punto de acceso, activar el modo avión): el LED debe apagarse en medio segundo como máximo.

Es la demostración más clara de ADR-003 que se puede hacer en una mesa, delante de un tribunal y sin dron.

### U4 · Sonda de latencia

- El ESP32 cambia un pin en el instante en que recibe un `move`. Grabando a cámara lenta el dedo sobre la pantalla y el LED, la diferencia de fotogramas es la latencia de punta a punta, incluida la pantalla táctil, que el software no puede medir.
- Sin cámara: el ESP32 responde a cada mensaje con su marca de tiempo, y la app calcula ida y vuelta.
- Repetir a varias distancias del punto de acceso y con el móvil en 4G da la tabla que pide RNF1.

### U5 · Puente de telemetría

Con el firmware DroneBridge, un ESP32 conectado a un puerto de telemetría de la controladora hace de radio MAVLink por WiFi (unos 150 m) o ESP-NOW (del orden de 1 km), y está documentado en la wiki de ArduPilot. Permite tener Mission Planner o QGroundControl en un portátil viendo el dron por un camino que no pasa por la Raspberry ni por el backend.

Si se usa, aplica [V-06](revision-2026-11-15.md#v-06): esa estación de tierra no debe alimentar el failsafe que vigila al servicio de a bordo.

### Material

- 1–3 placas ESP32 de desarrollo.
- Un adaptador USB-serie de **3,3 V** (para el montaje 2 del nivel 5).
- Cables de puente y un LED con su resistencia.

## Matriz de fallos

Cada fila es una prueba. "Esperado" sale de los documentos de diseño; si una prueba no coincide, o falla el código o hay que corregir el documento.

| Fallo | Cómo provocarlo | Esperado | Nivel |
|---|---|---|---|
| Se pierde el `active: false` al soltar | Descartarlo en el cliente de pruebas | El dron frena a los 500 ms | 1, 4 |
| La app se cierra con una flecha pulsada | Matar el cliente | El backend manda `stop`; si no, hombre muerto | 3, 4 |
| Ráfaga de `move` atrasados | Corte de red de 3 s con `netem` y restaurar | Se descartan por `sent_at`; el dron no se mueve | 4 |
| Orden que llega tarde | Retardo mayor que `expires_at` | `ack` con `expired`; no se ejecuta | 1, 4 |
| La misma orden dos veces | Reenviar el mismo `id` | Se ejecuta una vez | 1 |
| Cae el backend en vuelo | Matar uvicorn | Mantener posición a los 5 s, volver a los 30 s | 4 |
| Vuelve el backend antes de los 30 s | Arrancarlo otra vez | El dron reconecta, informa de su estado y sigue a las órdenes | 4 |
| El servicio de a bordo muere | `kill -9` | ArduPilot deja de recibir heartbeats; failsafe de estación de tierra | 2, 6 |
| El servicio de a bordo se cuelga | `kill -STOP` | Igual que el anterior ([V-06](revision-2026-11-15.md#v-06)) | 2 |
| Se suelta el cable serie | Desenchufar | Failsafe en ArduPilot; el servicio avisa al backend | 5, 6 |
| ArduPilot rechaza armar | Desactivar el GPS simulado | `rejected` con el motivo de ArduPilot en `detail` | 2 |
| ArduPilot no responde a un comando | Controladora falsa que calla | `rejected` a los 2 s | 1, 5 (U2) |
| Batería baja | `SIM_BATT_VOLTAGE` | Failsafe de batería; solo se aceptan `land`, `rtl`, `emergency_stop` | 2 |
| Salirse de la geovalla | `goto` fuera | Rechazado antes de enviarse; si se cruza volando, actúa ArduPilot | 2 |
| Pérdida de GPS en vuelo | Parámetro `SIM_GPS*` (el nombre cambia entre versiones) | Lo gestiona ArduPilot; el servicio rechaza órdenes de movimiento | 2 |
| Viento | `SIM_WIND_SPD` | `hold` y `goto` siguen cumpliendo su condición de fin | 2 |
| Reloj de la Raspberry desfasado | Cambiar la hora del sistema | Las caducidades siguen funcionando gracias a `welcome` | 4, 5 |
| Clave del dron regenerada en vuelo | Regenerarla desde la app | Se corta la conexión; el dron aplica la pérdida de backend | 3, 4 |
| Dos operadores a la vez | Dos clientes | Lo que se decida (hoy, sin definir) | 3 |
| Objetivo de `follow` deja de actualizarse | Parar `target_position` | Mantener posición a los 3 s | 1, 2 |
| Token de usuario revocado con el WebSocket abierto | Cerrar sesión en otro cliente | El servidor cierra el WebSocket | 3 |

## Medición de RNF1

| Qué | Cómo | Resultado |
|---|---|---|
| Orden discreta hasta `accepted` | Marcas de tiempo por `id` en app, backend y servicio ([V-13](revision-2026-11-15.md#3-huecos-de-viabilidad)) | Tiempo total y por tramo, en cada perfil de red |
| Control manual, de punta a punta | U4 con cámara lenta | Latencia real, con la pantalla táctil |
| Frecuencia de telemetría en la app | Contar mensajes por segundo | ≥ 2 por segundo en cada perfil |
| Parada por hombre muerto | U3, o SITL midiendo cuándo la velocidad llega a cero | ≤ 500 ms más el frenado |

Dar siempre la mediana y el percentil 95, no la media: en redes móviles lo que importa es la cola.

## Pruebas de la voz (cuando llegue)

Resumen; el detalle está en [futuro-voz-a-comandos.md](futuro-voz-a-comandos.md#cómo-se-evaluaría).

- Un conjunto fijo de frases en español con la orden esperada, incluidas frases que **no** deben producir ninguna orden.
- La métrica principal es la tasa de órdenes falsas, no la de aciertos.
- Las mismas frases con ruido de viento y de motores mezclado.
