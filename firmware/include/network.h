#pragma once
#include <Arduino.h>

void setupNetwork();
void loopNetwork();
void publishSensorData(int humedad, int temp, byte n, byte p, byte k);