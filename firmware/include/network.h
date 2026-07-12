#pragma once
#include <Arduino.h>

void setupNetwork();
void loopNetwork();
void publishSensorData(int humedad, int temp, uint16_t &n, uint16_t &p, uint16_t &k);