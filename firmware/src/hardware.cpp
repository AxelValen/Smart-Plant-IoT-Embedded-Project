#include "hardware.h"
#include "Adafruit_seesaw.h"

// --- Variables y Constantes de Hardware ---
Adafruit_seesaw ss;
const float SUELO_SECO   = 330.0;
const float SUELO_HUMEDO = 650.0;
const float ALPHA        = -0.0046;
const float T_REF        = 25.0;

const int PIN_BOMBA      = 19; // cambiar a 19 cuando se tenga el rele conectado
const int HUMEDAD_INICIO = 30;
const int HUMEDAD_STOP   = 100;

#define RE 18
#define DE 5
HardwareSerial mod(2); // UART2: RX=16, TX=17 

const byte nitro[] = {0x01, 0x03, 0x00, 0x1e, 0x00, 0x01, 0xe4, 0x0c};
const byte phos[]  = {0x01, 0x03, 0x00, 0x1f, 0x00, 0x01, 0xb5, 0xcc};
const byte pota[]  = {0x01, 0x03, 0x00, 0x20, 0x00, 0x01, 0x85, 0xc0};

float leerCapacitanciaPromedio() {
  float suma = 0;
  for (int i = 0; i < 10; i++) {
    suma += ss.touchRead(0);
    delay(10);
  }
  return suma / 10.0;
}

float corregirPorTemperatura(float capRaw, float tempC) {
  float factor = 1.0 + ALPHA * (tempC - T_REF);
  if (factor <= 0.0) factor = 0.01;
  return capRaw / factor;
}

int calcularHumedad(float capCorregida) {
  float humedad = (capCorregida - SUELO_SECO) / (SUELO_HUMEDO - SUELO_SECO) * 100.0;
  if (humedad < 0.0)   humedad = 0.0;
  if (humedad > 100.0) humedad = 100.0;
  return (int)humedad;
}

uint16_t leerNPK(const byte* comando, size_t len) {
  // Limpiar buffer de lecturas residuales
  while (mod.available()) {
    mod.read();
  }

  // Activar transmisión
  digitalWrite(DE, HIGH);
  digitalWrite(RE, HIGH);
  delayMicroseconds(200);

  mod.write(comando, len);
  mod.flush();
  
  delayMicroseconds(1000);

  // Cambiar a recepción
  digitalWrite(DE, LOW);
  digitalWrite(RE, LOW);
  
  byte response[7];
  byte index = 0;
  unsigned long startTime = millis();

  // Esperar respuesta (timeout de 500ms)
  while ((millis() - startTime) < 500 && index < 7) {
    if (mod.available()) {
      byte incomingByte = mod.read();
      
      // Filtro de sincronización: ignorar el byte fantasma (0x00)
      if (index == 0 && incomingByte != 0x01) {
        continue; 
      }
      
      response[index] = incomingByte;
      index++;
    }
  }
  
  // Validar que llegaron los 7 bytes y la cabecera es correcta
  if (index == 7 && response[0] == 0x01 && response[1] == 0x03 && response[2] == 0x02) {
    // Combinar byte alto y bajo
    uint16_t dato = (response[3] << 8) | response[4];
    return dato; // Retornar el uint16_t intacto
  }
  
  // Retornar 0 si hubo error o timeout
  return 0;
}

void setupHardware() {
  pinMode(PIN_BOMBA, OUTPUT);
  digitalWrite(PIN_BOMBA, LOW);

  pinMode(RE, OUTPUT);
  pinMode(DE, OUTPUT);
  // Iniciar en modo recepción por defecto
  digitalWrite(RE, LOW);
  digitalWrite(DE, LOW);
  
  mod.begin(9600, SERIAL_8N1, 16, 17);

  if (!ss.begin(0x36)) {
    Serial.println("ERROR: Sensor de humedad no encontrado");
  } else {
    Serial.print("Sensor humedad iniciado. Version: ");
    Serial.println(ss.getVersion(), HEX);
  }
}

void processHumidity_Temp(int &humedadOut, int &tempOut) {
  float tempC = ss.getTemp();
  float capRaw = leerCapacitanciaPromedio();
  float capCorregida = corregirPorTemperatura(capRaw, tempC);
  int humidity = calcularHumedad(capCorregida);
  
  Serial.println("==================================");
  Serial.print("Temperatura:       "); Serial.print(tempC); Serial.println(" °C");
  Serial.print("Capacitancia raw:  "); Serial.println(capRaw);
  Serial.print("Capacitancia corr: "); Serial.println(capCorregida);
  Serial.print("Humedad del suelo: "); Serial.print(humidity); Serial.println(" %");
  
  humedadOut = humidity; 
  tempOut = (int)tempC;
}

void readNPKValues(uint16_t &n, uint16_t &p, uint16_t &k) {
  n = leerNPK(nitro, sizeof(nitro));
  delay(300); 
  p = leerNPK(phos, sizeof(phos));
  delay(300);
  k = leerNPK(pota, sizeof(pota));
  
  Serial.println("-----------------------------");
  Serial.print("Nitrogeno:  "); Serial.print(n); Serial.println(" mg/kg");
  Serial.print("Fosforo:    "); Serial.print(p); Serial.println(" mg/kg");
  Serial.print("Potasio:    "); Serial.print(k); Serial.println(" mg/kg");
}