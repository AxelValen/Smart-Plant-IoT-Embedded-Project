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

const int PIN_BOMBA = 19;
const int PIN_LED_INDICATOR = 2; 

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
  
  if (String(topic) == topicControl.c_str()) {
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
  static unsigned long lastMQTTAttempt = 0;
  static unsigned long mqttDisconnectTime = 0;

  // Iniciar el watchdog de desconexión en el primer fallo
  if (mqttDisconnectTime == 0) {
    mqttDisconnectTime = millis();
  }

  // Si pasan 30 segundos sin poder conectar, forzar un reinicio para limpiar la RAM
  if (millis() - mqttDisconnectTime > 30000) {
    ESP.restart();
  }

  // Intentar conectar solo una vez cada 5 segundos
  if (lastMQTTAttempt != 0 && millis() - lastMQTTAttempt < 5000) return;

  String topicStatus = "device/status/" + deviceID;
  Serial.print("Conectando al broker MQTT...");

  if (mqtt.connect(deviceID.c_str(), MQTT_USERNAME, MQTT_PASSWORD, topicStatus.c_str(), 0, true, "offline")) {
    Serial.println(" ✅ conectado!");
    
    mqttDisconnectTime = 0; // cancelamos el watchdog
    
    mqtt.subscribe(topicControl.c_str());
    mqtt.publish(topicStatus.c_str(), "online", true);

    String reg = "{\"device_id\":\"" + deviceID + "\",\"status\":\"pending\"}";
    mqtt.publish(topicRegister.c_str(), reg.c_str(), false);
  } else {
    Serial.print(" ❌ falló, rc=");
    Serial.println(mqtt.state());
    
    // Forzar el cierre del socket TLS 
    wifiClient.stop();
  }

  lastMQTTAttempt = millis();
}

void setupNetwork() {
  WiFi.mode(WIFI_STA); // Forzar el modo estación 
  WiFi.disconnect(true); // Desconectar y borrar cualquier configuración previa en caché
  delay(500); // Darle un momento al radio WiFi para estabilizarse antes de iniciar

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Conectando a WiFi");
  
  unsigned long startAttemptTime = millis();
  
  // Esperar no solo a estar conectado, sino a tener una IP enrutada
  while ((WiFi.status() != WL_CONNECTED || WiFi.localIP().toString() == "0.0.0.0") && millis() - startAttemptTime < 15000) {
    delay(500);
    Serial.print(".");
  }
  
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\n⚠️ Timeout WiFi. Reiniciando dispositivo...");
    ESP.restart();
  }
  
  Serial.println("\n✅ WiFi conectado!");
  Serial.print("IP Asignada: ");
  Serial.println(WiFi.localIP());
  
  // Darle 1 segundo a la pila de red para asentar rutas antes de iniciar TLS
  delay(1000);

  digitalWrite(PIN_LED_INDICATOR, HIGH);
  
  deviceID = WiFi.macAddress();
  topicData    = "sensor/data/" + deviceID;
  topicControl = "control/led/" + deviceID;
  
  wifiClient.setInsecure();
  mqtt.setBufferSize(512);
  mqtt.setServer(MQTT_BROKER_URL, MQTT_PORT);
  mqtt.setCallback(mqttCallback);

  mqtt.setKeepAlive(10);
}

void loopNetwork() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("⚠️ WiFi desconectado. Intentando reconectar...");
    digitalWrite(PIN_LED_INDICATOR, LOW);
    
    delay(1000); 
    ESP.restart();
  }
  if (!mqtt.connected()) connectMQTT();
  mqtt.loop(); 
}

void publishSensorData(int humidity, int temp, uint16_t &n, uint16_t &p, uint16_t &k) {
  // Construcción del JSON con los datos de hardware
  JsonDocument doc;
  doc["humidity"] = humidity;
  doc["temperature"] = temp;
  doc["nitrogeno"] = n;
  doc["fosforo"] = p;
  doc["potasio"] = k;

  char payload[256];
  serializeJson(doc, payload);

  Serial.println("--------------------------------");
  mqtt.publish(topicData.c_str(), payload);
  Serial.print("📤 Publicado en '");
  Serial.print(topicData.c_str());
  Serial.print("': ");
  Serial.println(payload);
}