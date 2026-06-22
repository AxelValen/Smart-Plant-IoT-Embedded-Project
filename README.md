
# 🌱 Smart-Plant: IoT Automated Irrigation & Telemetry System

![Estado: En Desarrollo](https://img.shields.io/badge/Status-Work_in_Progress-yellow)
![Hardware: ESP32](https://img.shields.io/badge/Hardware-ESP32-blue)
![Backend: Node.js](https://img.shields.io/badge/Backend-Node.js-green)
![Protocol: MQTT](https://img.shields.io/badge/Protocol-MQTT-red)

## 📖 Descripción del Proyecto
Smart-Plant es un sistema embebido modular basado en IoT diseñado para optimizar el uso del agua y mejorar las condiciones de crecimiento de plantas mediante intervención autónoma. Utiliza un ESP32 para la lectura de variables ambientales (humedad capacitiva, temperatura, NPK), transmitiendo telemetría en tiempo real a través de protocolos ligeros (MQTT) hacia un servidor centralizado para su persistencia en MongoDB y visualización mediante un dasboard.

## 🗝️ Características Principales
- **Riego autónomo:** Implementación de un algoritmo de control en el servidor para el accionamiento automático de la bomba de agua basado en umbrales ideales por tipo de planta.
- **Telemetría en tiempo real:** Comunicación bidireccional continua entre el hardware y el servidor, reflejada en el Dashboard.
- **Modularidad:** Detección automática de nuevos módulos en la red con un sistema de emparejamiento manual desde la interfaz para asignar tipos de cultivo.
- **Persistencia de datos:** Registro histórico de eventos de actuación y mediciones de sensores para análisis de salud de la planta.

## 🏗️ Arquitectura del Sistema

<img width="659" height="488" alt="image" src="https://github.com/user-attachments/assets/f43a6bfe-6892-46d8-8960-6ae8c4200441" />

El proyecto está dividido en tres capas principales:

1. **Capa de recepción (Hardware):** Compuesta por un módulo central basado en el microcontrolador ESP32, el cual interactúa directamente con el entorno a través de los sensores de humedad de suelo capacitivos, temperatura y un sensor NPK RS485, además de actuar mediante una bomba de agua.
2. **Capa de red (Comunicaciones):** Utiliza WiFi para conectar al ESP32 a internet. La transferencia de datos de telemetría y recepción de comandos de riego se gestiona mediante el protocolo MQTT.
3. **Capa de aplicación (Backend/Frontend):** Un servidor desarrollado en Node.js procesa los mensajes MQTT, evalúa el estado de salud de las plantas, y almacena datos en MongoDB usando Mongoose. Un dashboard web interactivo provee control remoto y monitoreo en tiempo real.

## 🛠️ Hardware Usado
* **Microcontrolador:** ESP32 
* **Sensor NPK** 
* **Conversor RS485 - TTL:** Módulo MAX485
* **Bomba peristáltica:** Kamoer NKP-DC-S10B
* **Sensor de humedad/temperatura:** Adafruit STEMMA Capacitive Moisture Sensor
* **Módulo relay:** SRD-05VDC-SL-C

## 🛠️ Tecnologías Usadas
* **Firmware:** C++, PlatformIO.
* **Comunicaciones:** Protocolo MQTT (PubSubClient), WebSockets.
* **Backend:** Node.js, Express.js.
* **Base de Datos:** MongoDB (NoSQL) con Mongoose.
* **Frontend:** Dashboard interactivo (HTML, CSS, Vanilla JS).

## 🚀 Estado Actual 

- [x] **Fase 1:** Firmware base del ESP32 conexión WiFi y lectura de sensores.
- [x] **Fase 2:** Implementación del backend y servidor MQTT.
- [x] **Fase 3:** Diseño del modelo y conexión de base de datos (MongoDB).
- [x] **Fase 4:** Lógica de control autónomo de la bomba de agua basada en umbrales de humedad.
- [x] **Fase 5:** Integración con los sensores (Capacitivo, NPK) y la bomba de agua.
- [x] **Fase 6:** Desarrollo del Dashboard en tiempo real (Frontend) con WebSockets.
- [ ] **Fase 7:** Diseño de carcasa y PCB.
- [ ] **Fase 8:** Pruebas finales y despliegue del servidor.
---

## 📚 Guía de Configuración e Instalación

### Requisitos Previos
1. **Node.js** (v16 o superior) instalado en tu computadora.
2. **MongoDB** en ejecución (puede ser local o un clúster en la nube como MongoDB Atlas).
3. Un **Broker MQTT** (servicio gratuito como EMQX Cloud, o uno local como Mosquitto).
4. **Visual Studio Code** con la extensión **PlatformIO** instalada (para el firmware del ESP32).

### 1. Clonar el repositorio

```bash
git clone https://github.com/AxelValen/Smart-Plant-IoT-Embedded-Project.git
```

### 2. Configuración del entorno (Backend)
Las credenciales sensibles se manejan a través de variables de entorno. Crea un archivo .env en la raíz del proyecto con la siguiente estructura:

```bash
# URL de conexión a tu base de datos MongoDB
MONGODB_URI=mongodb+srv://<usuario>:<password>@cluster0.mongodb.net/smart_plant?retryWrites=true&w=majority

# Credenciales de tu Broker MQTT
MQTT_BROKER_URL=mqtts://<tu-broker-url>.emqxsl.com
MQTT_USERNAME=tu_usuario_mqtt
MQTT_PASSWORD=tu_password_mqtt

# Puerto para el servidor web (Opcional, por defecto 3000)
PORT=3000
```

### 3. Instalación de dependencias e inicialización de base de datos
Abre una terminal, navega a la carpeta del backend y prepara la base de datos:

```Bash
# cd backend  (o realiza el npm install en la raíz dependiendo de tu package.json)
npm install

# Inicializar la colección de tipos de plantas
# Este script carga las condiciones ideales (humedad, temperatura, NPK) en MongoDB.
# Solo se corre una vez.
node plants_init.js
```
Si la conexión es exitosa, verás en la consola mensajes confirmando la limpieza de la colección y la inserción de plantas.


### 4. Ejecución del Servidor Local
Para arrancar el backend y el dashboard:

```Bash
node server.js
```
Verás logs confirmando la conexión a MongoDB, al broker MQTT y el puerto activo (🌐 Servidor en http://localhost:3000).

### 5. Configuración del Firmware (ESP32)
1.	Abre la carpeta firmware/ en VSCode usando PlatformIO.
2.	Navega a firmware/src/ y crea el archivo secrets.h con las credenciales. 

```cpp
// firmware/src/secrets.h
#ifndef SECRETS_H
#define SECRETS_H

#define SECRET_WIFI_SSID "TU_RED_WIFI"
#define SECRET_WIFI_PASS "TU_CONTRASEÑA_WIFI"

// Detalles del Broker MQTT (Deben coincidir con el backend)
#define SECRET_MQTT_BROKER_URL "tu-broker.emqxsl.com"
#define SECRET_MQTT_PORT 8883 // Usualmente 8883 para TLS/SSL o 1883 sin cifrar
#define SECRET_MQTT_USER "tu_usuario_mqtt"
#define SECRET_MQTT_PASS "tu_password_mqtt"

#endif
```

3.	Conecta tu ESP32 por USB.
4.	En PlatformIO, haz clic en el botón de Build (✓) y luego en Upload (→).

### 6. Uso del Sistema
1.	Abre tu navegador web y ve a http://localhost:3000.
2.	Una vez que el ESP32 se conecte al WiFi y al MQTT, enviará un mensaje de registro.
3.	Lo verás aparecer en el Dashboard en la sección "📥 Módulos detectados".
4.	Selecciona el tipo de planta que vas a monitorear (ej. Tomate, Fresa) en el menú desplegable y haz clic en "Confirmar e ingresar al sistema".
5.	El dispositivo pasará a la red de monitoreo activa, y comenzará a recibir lecturas de humedad, salud, NPK y alertas en tiempo real.
