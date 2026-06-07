# 🌱 Smart-Plant: IoT Automated Irrigation & Telemetry System

![Estado: En Desarrollo](https://img.shields.io/badge/Status-Work_in_Progress-yellow)
![Hardware: ESP32](https://img.shields.io/badge/Hardware-ESP32-blue)
![Backend: Node.js](https://img.shields.io/badge/Backend-Node.js-green)
![Protocol: MQTT](https://img.shields.io/badge/Protocol-MQTT-red)

## 📖 Descripción del Proyecto
Smart-Plant es un sistema embebido modular basado en IoT diseñado para optimizar el uso del agua y mejorar las condiciones de crecimiento de plantas mediante intervención autónoma. Utiliza un ESP32 para la lectura de variables ambientales, transmitiendo telemetría en tiempo real a través de protocolos ligeros (MQTT) hacia un servidor centralizado para su persistencia y visualización.

## ✨ Características Principales
- **Riego autónomo:** Implementación de un algoritmo de control para el accionamiento automático de la bomba de agua basado en umbrales de humedad
- **Telemetría:** Comunicación bidireccional continua y de baja latencia entre el hardware y el servidor para visualización y monitoreo.
- **Modularidad:** Configurado para permitir el emparejamiento y la getión de múltiples nodos de monitoreo en la misma red.
- **Persistencia de Datos:** Registro histórico de eventos de actuación (riego) y mediciones de sensores para visualización y análisis histórico.

## 🏗️ Arquitectura del Sistema

<img width="659" height="488" alt="image" src="https://github.com/user-attachments/assets/f43a6bfe-6892-46d8-8960-6ae8c4200441" />

El proyecto está dividido en tres capas principales:

1. **Capa de recepción (Hardware):** Compuesta por un módulo central basado en el microcontrolador ESP32, el cual interactúa directamente con el entorno a través de los sensores del suelo y actúa mediante una bomba de agua.
2. **Capa de red (Comunicaciones):** Utiliza el protocolo WiFi para conectar al ESP32 a internet. La transferencia de datos de telemetría y recepción de comandos de riego se gestiona mediante el protocolo MQTT.
3. **Capa de aplicación y datos (Backend/Frontend):** Un servidor desarrollado en NodeJS organiza la lógica de intercambio, procesando los mensajes MQTT a través del broker EMQX, y almacenando los registros históricos y eventos de riego en una base de datos no relacional MongoDB. Finalmente, un dashboard web permite al usuario visualizar el estado y enviar comandos.

## 🛠️ Tecnologías Usadas
* **Firmware:** C++, PlatformIO, Microcontrolador ESP32.
* **Comunicaciones:** Protocolo ligero MQTT.
* **Backend:** Node.js, Express.js.
* **Base de Datos:** MongoDB (NoSQL) con modelado estructurado mediante Mongoose.
* **Frontend:** Dashboard de monitoreo interactivo (HTML, CSS, JavaScript).

## 🚀 Estado Actual 
El sistema se encuentra en desarrollo activo.

- [x] **Fase 1:** Firmware base del ESP32 conexión WiFi y lectura de sensores.
- [x] **Fase 2:** Implementación del backend y servidor MQTT.
- [x] **Fase 3:** Diseño del modelo y conexión de base de datos (MongoDB).
- [x] **Fase 4:** Lógica de control autónomo de la bomba de agua basada en umbrales de humedad.
- [ ] **Fase 5:** Integración con los sensores y la bomba de agua.
- [ ] **Fase 6:** Desarrollo del Dashboard en tiempo real (Frontend).
- [ ] **Fase 7:** Pruebas y despliegue del servidor.

## 🛠️ Requisitos e Instalación

### Backend
1. Clonar el repositorio.
2. Ir al directorio `backend/`.
3. Instalar dependencias `npm install`.
4. Configurar variables de entorno (MongoDB URI, MQTT Port) en un archivo `.env`.
5. Ejecutar el servidor: `node server.js`

### Firmware (ESP32)
1. Abrir la carpeta `firmware/` utilizando VSCode con la extensión PlatformIO.
2. Configurar las credenciales de red y del broker MQTT en `src/main.cpp`.
3. Compilar y subir al dispositivo.

## 📁 Estructura del Repositorio
```text
├── backend/            # Servidor Node.js, modelos Mongoose y lógica MQTT
├── firmware/           # Código fuente C++ para ESP32 (PlatformIO)
├── public/             # Archivos estáticos del cliente web
├── docs/               # Diagramas arquitectónicos y manuales
└── README.md
