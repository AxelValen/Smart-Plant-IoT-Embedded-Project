#pragma once
#include <Arduino.h>

// Inicialización de pines y protocolos
void setupHardware();

// Lee la humedad y temperatura
void processHumidity_Temp(int &humedad, int &temp);

// Pasa las variables por referencia para actualizar los 3 valores de NPK
void readNPKValues(uint16_t &n, uint16_t &p, uint16_t &k);