#include <Arduino.h>
#include "hardware.h"
#include "network.h"

unsigned long lastPublish = 0;
const unsigned long INTERVALO_LECTURA = 2000; // Leer y publicar cada 2 segundos
int humedadActual = 0;
int tempC = 0;

void setup() {
  Serial.begin(115200);
  Serial.println("=== Sistema Smart-Plant Iniciando ===");

  setupHardware();
  setupNetwork();
}

void loop() {
  // Mantener la capa de red funcionando
  loopNetwork(); 

  // Ejecutar lecturas de hardware cada X tiempo usando millis()
  if (millis() - lastPublish >= INTERVALO_LECTURA) {
    lastPublish = millis();
    
    // Leer humedad y temperatura
    processHumidity_Temp(humedadActual, tempC);
    
    // Leer NPK
    byte n, p, k;
    readNPKValues(n, p, k);
    
    // Enviar datos al broker MQTT
    publishSensorData(humedadActual, tempC, n, p, k);
  }
}