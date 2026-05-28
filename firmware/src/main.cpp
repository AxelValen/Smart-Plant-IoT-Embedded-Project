#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include "soc/rtc_cntl_reg.h"
#include "soc/soc.h"

#define LED_BUILTIN 2
#define WIFI_SSID     **WIFI_SSID**
#define WIFI_PASSWORD **WIFI_PASSWORD**
#define MQTT_BROKER   **MQTT_BROKER_URL**
#define MQTT_PORT     **MQTT_PORT**
#define MQTT_USERNAME **MQTT_USERNAME**
#define MQTT_PASSWORD **MQTT_PASSWORD**  

#define PLANT_TYPE    "tomate"
String deviceID;
String topicData;
String topicControl;
String topicRegister = "device/register";

WiFiClientSecure wifiClient;
PubSubClient mqtt(wifiClient);

bool wifiConnected = false;
int  contador      = 0;
unsigned long lastPublish = 0;

void connectMQTT() {
  while (!mqtt.connected()) {
    Serial.print("Conectando al broker MQTT...");
    // client ID único para este dispositivo
    if (mqtt.connect((deviceID+"-"+PLANT_TYPE).c_str(), MQTT_USERNAME, MQTT_PASSWORD)) {
      Serial.println(" ✅ conectado!");

      mqtt.subscribe(topicControl.c_str());
      mqtt.subscribe("control/led/global");

      // Publica un mensaje de registro con los atributos del dispositivo
      String reg = "{\"device_id\":\"" + deviceID +
               "\",\"plant_type\":\"" + String(PLANT_TYPE) +
               "\",\"status\":\"online\"}";

      mqtt.publish(topicRegister.c_str(), reg.c_str());
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
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);
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
  mqtt.setServer(MQTT_BROKER, MQTT_PORT);
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
    int data = random(10,40);
    
    // Arma el payload JSON manualmente
    String payload = "{\"valor\":" + String(data) +
                     ",\"mensaje\":\"Hola desde ESP32\"}";

    mqtt.publish(topicData.c_str(), payload.c_str());
    Serial.print("📤 Publicado en '");
    Serial.print(topicData.c_str());
    Serial.print("': ");
    Serial.println(payload);

    contador++;
  }
}