// WebSocket: conexión persistente, el servidor empuja los datos
const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${wsProtocol}//${location.host}`);

let ledOn = false;
let currentDeviceId = null; 

function toggleLed() {
  if (!currentDeviceId) {
    alert("⏳ Esperando recibir el ID del ESP32. Intenta en unos segundos.");
    return;
  }

  ledOn = !ledOn;
  
  // Enviamos el comando y el ID del ESP32 al servidor
  const payload = {
    device_id: currentDeviceId,
    command: ledOn ? 'LED_ON' : 'LED_OFF'
  };

  const btn     = document.getElementById('btnLed');
  const status  = document.getElementById('ledStatus');

  ws.send(JSON.stringify(payload)); 

  btn.textContent     = ledOn ? '💡 Apagar LED' : '💡 Encender LED';
  btn.style.background = ledOn ? '#ff0' : '#0f0';
  status.textContent  = `Estado: ${ledOn ? 'ENCENDIDO 🟡' : 'APAGADO ⚫'}`;
}

ws.onopen = () => {
  document.getElementById('status').textContent = '🟢 Conectado via WebSocket';
};

ws.onclose = () => {
  document.getElementById('status').textContent = '🔴 Desconectado';
};

ws.onmessage = (event) => {
  try {
    const d = JSON.parse(event.data);

    if (d.device_id) currentDeviceId = d.device_id;

    document.getElementById('valor').textContent     = d.humidity   ?? '—';
    document.getElementById('mensaje').textContent   = d.mensaje ?? '—';
    document.getElementById('timestamp').textContent = new Date().toLocaleTimeString();

    // Agrega al log
    const log   = document.getElementById('log');
    const entry = document.createElement('div');
    entry.className   = 'log-entry';
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${event.data}`;
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
  } catch(e) {
    console.error('Error parseando mensaje:', e);
  }
};