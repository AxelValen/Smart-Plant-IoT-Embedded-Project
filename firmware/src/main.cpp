#include "secrets.h"
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

const char* WIFI_SSID = SECRET_WIFI_SSID;
const char* WIFI_PASSWORD = SECRET_WIFI_PASS;
const char* MQTT_BROKER_URL = SECRET_MQTT_BROKER_URL;
const int MQTT_PORT = SECRET_MQTT_PORT;
const char* MQTT_USERNAME = SECRET_MQTT_USER;
const char* MQTT_PASSWORD = SECRET_MQTT_PASS;

#define PIN_HUMIDITY      34    // pin del sensor de humedad
#define PIN_TEMPERATURE   35    // pin del sensor de temperatura
#define PIN_N        32    // pin lectura de Nitrógeno
#define PIN_P         26    // pin lectura de Fósforo
#define PIN_K         27    // pin lectura de Potasio
#define LED_BUILTIN 2

String deviceID;
String topicData;
String topicControl;
String topicRegister = "device/register";

WiFiClientSecure wifiClient;
PubSubClient mqtt(wifiClient);

bool wifiConnected = false;
unsigned long lastPublish = 0;

void connectMQTT() {
  while (!mqtt.connected()) {
    Serial.print("Conectando al broker MQTT...");
    // client ID único para este dispositivo
    if (mqtt.connect(deviceID.c_str(), MQTT_USERNAME, MQTT_PASSWORD)) {
      Serial.println(" ✅ conectado!");

      mqtt.subscribe(topicControl.c_str());
      mqtt.subscribe("control/led/global");

      // Publica un mensaje de registro con los atributos del dispositivo
      String reg = "{\"device_id\":\"" + deviceID + "\",\"status\":\"pending\"}";
      mqtt.publish(topicRegister.c_str(), reg.c_str(), true);
    } else {
      Serial.print(" ❌ falló, rc=");
      Serial.print(mqtt.state());
      Serial.println(" reintentando en 2s");
      delay(2000);
    }
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String message;
  for (int i = 0; i < length; i++) message += (char)payload[i];

  Serial.print("📩 Comando recibido [");
  Serial.print(topic);
  Serial.print("]: ");
  Serial.println(message);

  if (String(topic) == topicControl.c_str() || String(topic) == "control/led/global") {
    if (message == "LED_ON") {
      digitalWrite(LED_BUILTIN, HIGH);
      Serial.println("💡 LED encendido");
    } else if (message == "LED_OFF") {
      digitalWrite(LED_BUILTIN, LOW);
      Serial.println("💡 LED apagado");
    }
  }
}

void setup() {
  Serial.begin(921600);
  pinMode(LED_BUILTIN, OUTPUT);
  
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Conectando a WiFi");
  
  // Esperamos a que conecte ANTES de pedir la MAC
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n✅ WiFi conectado!");
  
  // Ahora el WiFi está encendido y la MAC es válida
  deviceID = WiFi.macAddress();
  topicData    = "sensor/data/" + deviceID;
  topicControl = "control/led/" + deviceID;
  
  wifiClient.setInsecure();
  mqtt.setServer(MQTT_BROKER_URL, MQTT_PORT);
  mqtt.setCallback(mqttCallback);
  Serial.println("Iniciando MQTT...");
}

void loop() {
  // Manejo WiFi
  if (WiFi.status() != WL_CONNECTED) {
    wifiConnected = false;
    delay(1000);
    return;
  } else {
    wifiConnected = false;
  }

  // Manejo MQTT
  if (!mqtt.connected()) connectMQTT();
  mqtt.loop(); // mantiene la conexión viva

  // Publica cada 2 segundos
  if (millis() - lastPublish >= 2000) {
    lastPublish = millis();

    int humidity = random(50,90);
    int temp = random(50,90);
    int N = random(50,90);
    int P = random(50,90);
    int K = random(50,90);
    
    // Construye el payload JSON con ArduinoJson
    JsonDocument doc;
    doc["humidity"] = humidity;
    doc["temperature"] = temp;
    doc["nitrogeno"] = N;
    doc["fosforo"] = P;
    doc["potasio"] = K;

    char payload[256];
    serializeJson(doc, payload);

    mqtt.publish(topicData.c_str(), payload);
    Serial.print("📤 Publicado en '");
    Serial.print(topicData.c_str());
    Serial.print("': ");
    Serial.println(payload);
  }
}