#include <Arduino.h>
#include "hardware.h"
#include "network.h"

// Tiempos (en milisegundos)
unsigned long lastSampleTime = 0;
unsigned long lastPublishTime = 0;

// Intervalos de muestreo y publicación
const unsigned long INTERVALO_MUESTREO = 5000;    
const unsigned long INTERVALO_PUBLICACION = 30000; 

// Acumuladores para el filtro
long sumHumedad = 0;
long sumTemp = 0;
unsigned long sumN = 0;
unsigned long sumP = 0;
unsigned long sumK = 0;
int numSamples = 0;

void setup() {
  Serial.begin(115200);
  Serial.println("=== Sistema Smart-Plant Iniciando ===");

  setupHardware();
  setupNetwork();
}

void loop() {
  // Mantener la capa de red funcionando
  loopNetwork(); 

  // 1. Fase de Muestreo (Se ejecuta cada 30 segundos)
  if (millis() - lastSampleTime >= INTERVALO_MUESTREO) {
    lastSampleTime = millis();
    
    int h, t;
    uint16_t n, p, k;
    
    // Leer los sensores
    processHumidity_Temp(h, t);
    readNPKValues(n, p, k);
    
    // Acumular los valores
    sumHumedad += h;
    sumTemp += t;
    sumN += n;
    sumP += p;
    sumK += k;
    
    numSamples++;
    
    Serial.print("Muestra tomada. Cantidad actual: ");
    Serial.println(numSamples);
  }

  // 2. Fase de Publicación (Se ejecuta cada 15 minutos)
  if (millis() - lastPublishTime >= INTERVALO_PUBLICACION) {
    lastPublishTime = millis();
    
    if (numSamples > 0) {
      // Calcular los promedios
      int avgHumedad = sumHumedad / numSamples;
      int avgTemp = sumTemp / numSamples;
      uint16_t avgN = sumN / numSamples;
      uint16_t avgP = sumP / numSamples;
      uint16_t avgK = sumK / numSamples;
      
      Serial.println("--- Enviando Promedios a MQTT ---");
      // Enviar datos al broker MQTT
      publishSensorData(avgHumedad, avgTemp, avgN, avgP, avgK);
      
      // Reiniciar acumuladores y contador para el siguiente ciclo
      sumHumedad = 0;
      sumTemp = 0;
      sumN = 0;
      sumP = 0;
      sumK = 0;
      numSamples = 0;
    }
  }
}