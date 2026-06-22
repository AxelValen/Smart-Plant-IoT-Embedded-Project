#include "network.h"
#include "secrets.h"
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

const int PIN_BOMBA = 2; // cambiar a 19 cuando se tenga el rele conectado

String deviceID;
String topicData;
String topicControl;
String topicRegister = "device/register";

WiFiClientSecure wifiClient;
PubSubClient mqtt(wifiClient);

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String message;
  for (int i = 0; i < length; i++) message += (char)payload[i];
  Serial.print("📩 Comando recibido ["); Serial.print(topic); Serial.print("]: "); Serial.println(message);
  
  if (String(topic) == topicControl.c_str() || String(topic) == "control/led/global") {
    if (message == "LED_ON") {
      digitalWrite(PIN_BOMBA, HIGH);
      Serial.println("🚿 Bomba encendida");
    } else if (message == "LED_OFF") {
      digitalWrite(PIN_BOMBA, LOW);
      Serial.println("✅ Bomba apagada");
    }
  }
}

void connectMQTT() {
  while (!mqtt.connected()) {
    Serial.print("Conectando al broker MQTT...");
    if (mqtt.connect(deviceID.c_str(), MQTT_USERNAME, MQTT_PASSWORD)) {
      Serial.println(" ✅ conectado!");
      mqtt.subscribe(topicControl.c_str());
      
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

void setupNetwork() {
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Conectando a WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n✅ WiFi conectado!");
  
  deviceID = WiFi.macAddress();
  topicData    = "sensor/data/" + deviceID;
  topicControl = "control/led/" + deviceID;
  
  wifiClient.setInsecure();
  mqtt.setServer(MQTT_BROKER_URL, MQTT_PORT);
  mqtt.setCallback(mqttCallback);
}

void loopNetwork() {
  if (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    return;
  }
  if (!mqtt.connected()) connectMQTT();
  mqtt.loop(); 
}

void publishSensorData(int humidity, int temp, byte n, byte p, byte k) {
  // Construcción del JSON con los datos de hardware
  JsonDocument doc;
  doc["humidity"] = humidity;
  doc["temperature"] = temp;
  doc["nitrogeno"] = n;
  doc["fosforo"] = p;
  doc["potasio"] = k;

  char payload[256];
  serializeJson(doc, payload);

  Serial.println("-----------------------------");
  mqtt.publish(topicData.c_str(), payload);
  Serial.print("📤 Publicado en '");
  Serial.print(topicData.c_str());
  Serial.print("': ");
  Serial.println(payload);
  Serial.println("============================");
}