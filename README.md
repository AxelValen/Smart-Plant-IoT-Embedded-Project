# 🌱 Smart-Plant

**Sistema IoT de monitoreo ambiental y riego automático de plantas para entornos domésticos y de oficina.**

## 📖 Descripción del Proyecto
Smart-Plant es un sistema embebido modular basado en IoT diseñado para optimizar el uso del agua y mejorar las condiciones de crecimiento de plantas mediante intervención autónoma. Mide humedad y temperatura del suelo, así como niveles de nitrógeno, fósforo y potasio (NPK), en tiempo real a través de módulos ESP32, y evalúa la salud de cada planta contrastando esas lecturas contra una base de datos científicamente respaldada de 25 especies agrupadas en 5 categorías ecológicas. Todo se transmite vía MQTT sobre TLS a un dashboard web multinodo con autenticación de usuarios.

## 🗝️ Características Principales
- **Multinodo por diseño**: cada ESP32 se identifica por su dirección MAC, permitiendo que un único servidor gestione simultáneamente múltiples plantas sin interferencia entre sus datos.
- **Diagnóstico, no solo riego**: la decisión de regar depende únicamente de la humedad, pero el sistema también evalúa temperatura y NPK contra rangos científicos por especie para generar alertas preventivas de estado de salud.
- **Base de datos de umbrales validada científicamente**: 25 especies (follaje, florales, desérticas, vegetales, frutales) con rangos de temperatura, humedad relativa y NPK respaldados por literatura agronómica.
- **Comunicación extremo a extremo**: ESP32 → MQTT/TLS → EMQX Cloud → Node.js → WebSocket → dashboard.
- **Dashboard en tiempo real**: histórico de lecturas con Chart.js, jardín virtual con modelos 3D por especie y control manual de riego, todo vía WebSocket.
- **Autenticación JWT**: contraseñas con hash bcrypt, tokens para proteger cada endpoint y aislar los datos por usuario.
- **Circuito físico propio**: regulador LM338, conversión RS-485↔TTL (MAX485) para el sensor NPK, relé de estado sólido para aislar la etapa de potencia de la bomba peristáltica.

## 🏗️ Arquitectura del Sistema

<img width="945" height="435" alt="image" src="https://github.com/user-attachments/assets/52f3246b-00f5-4eb6-a519-ad09b6de22db" />

El proyecto está dividido en tres capas principales:

1. **Capa de recepción (Hardware):** Compuesta por un módulo central basado en el microcontrolador ESP32, el cual interactúa directamente con el entorno a través de los sensores de humedad de suelo capacitivos, temperatura y un sensor NPK RS485, además de actuar mediante una bomba de agua.
2. **Capa de red (Comunicaciones):** Utiliza WiFi para conectar al ESP32 a internet. La transferencia de datos de telemetría y recepción de comandos de riego se gestiona mediante el protocolo MQTT.
3. **Capa de aplicación (Backend/Frontend):** Un servidor desarrollado en Node.js procesa los mensajes MQTT, evalúa el estado de salud de las plantas, y almacena datos en MongoDB usando Mongoose. Un dashboard web interactivo provee control remoto y monitoreo en tiempo real.

## 🛠️ Tecnologías Utilizadas

| Capa | Tecnología |
|---|---|
| Microcontrolador | ESP32 |
| Sensor humedad/temp | Adafruit STEMMA Soil Sensor (I2C capacitivo) |
| Sensor NPK | Sensor RS-485/Modbus RTU + módulo MAX485 |
| Actuador | Relé SRD-05VDC-SL-C + bomba peristáltica Kamoer NKP-DC-S10B |
| Firmware | C++ (ArduinoJson, PubSubClient, Adafruit seesaw) |
| Comunicación | MQTT sobre TLS/SSL (EMQX Cloud) |
| Backend | Node.js, mqtt.js, Mongoose, bcryptjs, jsonwebtoken |
| Comunicación Dasboard | WebSocket |
| Base de datos | MongoDB, Mongoose|
| Frontend | HTML, CSS, JavaScript |

## Estructura del Proyecto

```
smart-plant/
├── backend/
│   ├── middleware/auth.js       # Verificación de JWT
│   ├── models/                  # Esquemas Mongoose
│   │   ├── User.js
│   │   ├── Device.js
│   │   ├── PlantType.js         # Catálogo de plantas con umbrales
│   │   ├── GardenPlant.js       # Instancias de plantas por usuario
│   │   ├── SensorReading.js     # Histórico de telemetría
│   │   └── WateringEvent.js     # Registro de eventos de riego
│   ├── plants_init.js           # Script para poblar PlantType
│   ├── server.js                # Express + MQTT client + WebSocket
├── firmware/
│   ├── include/
│   │   ├── hardware.h
│   │   └──  network.h
│   ├── src/
│   │   ├── main.cpp
│   │   ├── hardware.cpp         # Lectura de sensores
│   │   ├── network.cpp          # WiFi, MQTT, empaquetado JSON
│   │   └── secrets.h.example    # Plantilla de credenciales WiFi/MQTT (copiar → secrets.h)
│   └── platformio.ini
├── frontend/
│   ├── login.html / auth.js     # Autenticación
│   ├── home.html                # Landing page
│   ├── addplant.html            # Catálogo de especies
│   ├── virtualgarden.html       # Jardín virtual del usuario
│   ├── monitor.html             # Datos de monitoreo y gráficas históricas por planta
│   ├── cuenta.html              # Perfil y resumen de salud
│   └── models/                  # Modelos 3D (.glb) por especie
├── package.json                 # Scripts raíz
└── .env.example                 # Plantilla de variables de entorno (copiar → .env)
```

---

## 🔐 Credenciales y variables de entorno

Este proyecto usa dos archivos de plantilla para que cualquiera pueda clonar el repositorio sin exponer credenciales reales. Ninguno de los dos archivos "reales" (`secrets.h` y `.env`) se versiona; ambos están excluidos en `.gitignore`.

| Plantilla | Ubicación | Copiar como | Usado por |
|---|---|---|---|
| `secrets.h.example` | `firmware/src/` | `firmware/src/secrets.h` | El firmware del ESP32 (`network.cpp`), para las credenciales de WiFi y del broker MQTT. |
| `.env.example` | raíz del repositorio | `.env` | El servidor Node.js (`server.js`), para MongoDB, JWT y el broker MQTT. |

Para empezar, solo copia cada plantilla y reemplaza los valores de ejemplo por tus propias credenciales.

---

## 📚 Guía de Configuración e Instalación

### Requisitos

- Node.js ≥ 18
- Cuenta de MongoDB Atlas (o instancia local de MongoDB)
- Broker MQTT accesible por TLS (por ejemplo, un clúster gratuito de EMQX Cloud)
- PlatformIO para compilar el firmware
- Hardware: ESP32, sensor STEMMA I2C, sensor NPK RS-485 + MAX485, relé, bomba peristáltica de 12V

### 1. Backend

```bash
cd backend
npm install
```

Copia la plantilla de variables de entorno y complétala con tus propias credenciales.

`.env.example` ya define todas las variables que el servidor necesita (`MONGODB_URI`, `JWT_SECRET`, `MQTT_BROKER_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `PORT`). 

Siembra el catálogo de especies (una sola vez):

```bash
node plants_init.js
```

Levanta el servidor:

```bash
npm start
```

El servidor expone la API REST, sirve el frontend y abre el servidor WebSocket sobre el mismo puerto HTTP.

### 2. Firmware (ESP32)

1. Abre la carpeta `firmware/` en PlatformIO.
2. Copia la plantilla de credenciales dentro de `firmware/src/`.

   Edita `secrets.h` con tu SSID/contraseña de WiFi y los datos de tu broker MQTT (`SECRET_MQTT_BROKER_URL`, `SECRET_MQTT_PORT`, `SECRET_MQTT_USER`, `SECRET_MQTT_PASS` — deben coincidir con los del `.env` del backend).
3. Conecta el sensor STEMMA por I2C (SDA → GPIO21, SCL → GPIO22) y el sensor NPK vía MAX485 (RE → GPIO18, DE → GPIO5, RO → GPIO16, DI → GPIO17), siguiendo el esquemático de la memoria técnica.
4. Compila y sube el firmware al ESP32 desde PlatformIO.
5. Al conectarse, el dispositivo publica automáticamente su registro en `device/register` usando su dirección MAC como `deviceID`.

### 3. Frontend

El frontend es servido directamente por el backend. Simplemente accede a `http://localhost:3000` (o el `PORT` configurado) tras levantar el servidor, crea una cuenta, añade una planta del catálogo y vincúlala al `deviceID` que aparece al conectar tu ESP32.

---

## 🔌 API REST

| Método | Ruta | Descripción | Auth |
|---|---|---|---|
| POST | `/api/auth/register` | Registro de usuario | No |
| POST | `/api/auth/login` | Inicio de sesión, devuelve JWT | No |
| GET | `/api/auth/me` | Datos del usuario autenticado | JWT |
| GET | `/api/garden` | Lista las plantas del jardín del usuario | JWT |
| POST | `/api/garden` | Añade una instancia de planta desde el catálogo | JWT |
| DELETE | `/api/garden/:gardenPlantId` | Elimina una planta del jardín | JWT |
| GET | `/api/monitor/:instance_id` | Histórico de lecturas y eventos de riego de una planta | JWT |

---

## 🗄 Modelos de base de datos

| Modelo | Descripción |
|---|---|
| `User` | Cuentas registradas (usuario, correo, hash de contraseña) |
| `PlantType` | Catálogo de 25 especies con rangos ideales de temperatura/Humedad/NPK |
| `GardenPlant` | Instancia de una planta en el jardín de un usuario, opcionalmente vinculada a un `device_id` |
| `Device` | Módulos ESP32 emparejados (MAC y estado de conexión) |
| `SensorReading` | Histórico de telemetría con estado de salud calculado y alertas |
| `WateringEvent` | Registro de activaciones de la bomba (manual o automático) y duración |

---

## 🔧 Hardware

- **Microcontrolador**: ESP32 (Wi-Fi + Bluetooth integrados, múltiples GPIO/I2C/UART).
- **Sensor de humedad/temperatura**: Adafruit STEMMA Soil Sensor, capacitivo, sin electrodos expuestos, interfaz I2C.
- **Sensor NPK**: sensor multiparámetro RS-485/Modbus RTU de grado invernadero, acoplado vía módulo MAX485 con divisor de voltaje para proteger los GPIO de 3.3V.
- **Actuación**: relé de estado sólido SRD-05VDC-SL-C que aísla la etapa de control (5V) de la etapa de potencia de la bomba peristáltica Kamoer NKP-DC-S10B (12V, 5W).
- **Alimentación**: regulador de voltaje LM338 (12V → 5V) para el ESP32, relé y módulo RS-485.

<img width="782" height="701" alt="image" src="https://github.com/user-attachments/assets/b9594b47-3f05-4db3-9f20-0a5eabbe6790" />

El circuito completo, su esquemático y la tabla de conexiones GPIO están documentados en la Memoria Técnica del proyecto.

---

## ⚠️ Limitaciones y trabajo futuro

- El sensor NPK no ha sido validado contra un análisis de laboratorio independiente.
- La calibración del sensor de humedad (método de dos puntos) es específica al sustrato usado y no se ha probado en otros tipos de suelo.
- El riego automático depende de conectividad WiFi/MQTT; no existe modo de operación local/offline.
- No hay batería de respaldo: el sistema requiere alimentación externa continua.
- Las credenciales de WiFi están hardcodeadas en el firmware, lo que requiere recompilar para cambiar de red.

---

## 📄 Documentación académica

El desarrollo completo del proyecto —marco teórico, justificación científica de los umbrales por especie, arquitectura detallada, y resultados— está documentado en la **Memoria Técnica**.
