#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include "soc/rtc_cntl_reg.h"
#include "soc/soc.h"

#define LED_BUILTIN 2
#define WIFI_SSID     "Main Valen's Phone"
#define WIFI_PASSWORD **WIFI_PASSWORD**
#define MQTT_BROKER   "172.20.10.3"   // IP local
#define MQTT_PORT     1883
#define MQTT_TOPIC    "sensor/data"

WiFiClient   wifiClient;
PubSubClient mqtt(wifiClient);

bool wifiConnected = false;
int  contador      = 0;
unsigned long lastPublish = 0;

void connectMQTT() {
  while (!mqtt.connected()) {
    Serial.print("Conectando al broker MQTT...");
    // client ID único para este dispositivo
    if (mqtt.connect("ESP32Client")) {
      Serial.println(" ✅ conectado!");
    } else {
      Serial.print(" ❌ falló, rc=");
      Serial.print(mqtt.state());
      Serial.println(" reintentando en 2s");
      delay(2000);
    }
  }
}

void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);
  Serial.begin(921600);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  mqtt.setServer(MQTT_BROKER, MQTT_PORT);
  Serial.println("Iniciando...");
}

void loop() {
  // Manejo WiFi
  if (WiFi.status() == WL_CONNECTED && !wifiConnected) {
    Serial.println("✅ WiFi conectado!");
    Serial.println(WiFi.localIP());
    wifiConnected = true;
  }
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(".");
    digitalWrite(LED_BUILTIN, !digitalRead(LED_BUILTIN));
    wifiConnected = false;
    delay(1000);
    return;
  }

  // Manejo MQTT
  if (!mqtt.connected()) connectMQTT();
  mqtt.loop(); // mantiene la conexión viva

  // Publica cada 2 segundos
  if (millis() - lastPublish >= 2000) {
    lastPublish = millis();

    // Arma el payload JSON manualmente
    String payload = "{\"valor\":" + String(contador) +
                     ",\"mensaje\":\"Hola desde ESP32\"}";

    mqtt.publish(MQTT_TOPIC, payload.c_str());
    Serial.print("📤 Publicado en '");
    Serial.print(MQTT_TOPIC);
    Serial.print("': ");
    Serial.println(payload);

    contador++;
  }
}