const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${wsProtocol}//${location.host}`);

// Estructuras en memoria del cliente para tipologías y control local
let opcionesPlantas = []; 
let estadosLedsLocales = new Map(); // Guarda el estado de la bomba/LED por device_id

ws.onopen = () => {
  document.getElementById('status').textContent = '🟢 Conectado';
};

ws.onclose = () => {
  document.getElementById('status').textContent = '🔴 Desconectado del servidor';
};

ws.onmessage = (event) => {
  try {
    const d = JSON.parse(event.data);

    // 1. Carga inicial de tipos de plantas provistas por la base de datos (vía Backend)
    if (d.type === 'init_data') {
      opcionesPlantas = d.plants;
      return;
    }

    // 2. Actualización estructural de la topología de la red (Altas y cambios de estado)
    if (d.type === 'device_update') {
      renderizarListasDispositivos(d.devices);
      return;
    }

    // 3. Recepción de flujos continuos de telemetría (Actualización granular del DOM)
    if (d.type === 'sensor_data') {
      actualizarTelemetriaNodo(d);
    }

    // 4. Sincronización asíncrona de eventos de riego (Manuales o Automáticos)
    if (d.type === 'watering_started' || d.type === 'watering_stopped') {
      actualizarEstadoRiegoUI(d.device_id, d.type === 'watering_started');
    }

  } catch(e) {
    console.error('Error procesando mensaje WebSocket entrante:', e);
  }
};

/**
 * Redibuja los contenedores de tarjetas dividiendo los dispositivos en función de su estado
 */
function renderizarListasDispositivos(devices) {
  const contenedorPendientes = document.getElementById('nodos-pendientes');
  const contenedorActivos = document.getElementById('nodos-activos');
  
  // Limpieza previa de contenedores
  contenedorPendientes.innerHTML = '';
  contenedorActivos.innerHTML = '';

  let totalPendientes = 0;
  let totalActivos = 0;

  Object.keys(devices).forEach(id => {
    const dev = devices[id];

    if (dev.status === 'pending') {
      totalPendientes++;
      contenedorPendientes.appendChild(crearTarjetaPendiente(id));
    } else {
      totalActivos++;
      contenedorActivos.appendChild(crearTarjetaActiva(id, dev));
    }
  });

  if (totalPendientes === 0) {
    contenedorPendientes.innerHTML = '<div class="label">No hay módulos nuevos esperando configuración en la red.</div>';
  }
  if (totalActivos === 0) {
    contenedorActivos.innerHTML = '<div class="label">No hay dispositivos activos configurados en este entorno.</div>';
  }
}

/**
 * Construye la interfaz para un nodo descubierto que requiere aprovisionamiento
 */
function crearTarjetaPendiente(deviceId) {
  const card = document.createElement('div');
  card.className = 'card pending';
  
  let opcionesHtml = opcionesPlantas.map(p => 
    `<option value="${p.name}">${p.display_name}</option>`
  ).join('');

  card.innerHTML = `
    <h3>⚠️ Nuevo dispositivo detectado</h3>
    <p class="label">ID:</p>
    <div style="font-weight:bold; margin-bottom:1rem;">${deviceId}</div>
    
    <label class="label" for="select-${deviceId}">Asignar planta:</label>
    <select id="select-${deviceId}">
      ${opcionesHtml}
    </select>
    
    <button class="btn btn-provision" onclick="autorizarDispositivo('${deviceId}')">
      ✅ Confirmar e ingresar al sistema
    </button>
  `;
  return card;
}

/**
 * Genera el módulo de monitoreo e interacción en tiempo real para un nodo autorizado
 */
function crearTarjetaActiva(deviceId, devInfo) {
  const card = document.createElement('div');
  card.className = 'card';
  card.id = `card-${deviceId}`;

  // Inicializar estado interno del actuador si no existe
  if (!estadosLedsLocales.has(deviceId)) {
    estadosLedsLocales.set(deviceId, false);
  }
  
  const ledActivo = estadosLedsLocales.get(deviceId);
  const cultivoLegible = devInfo.plant_type.toUpperCase();

  card.innerHTML = `
    <h3>Módulo: ${deviceId} [${cultivoLegible}]</h3>
    
    <p class="label">Humedad de suelo</p>
    <div class="value" id="valor-${deviceId}">—</div>
    
    <p class="label">Estado de salud</p>
    <div id="salud-${deviceId}" style="font-weight:bold; color:#fff;">Evaluando...</div>
    
    <p class="label" style="margin-top:1rem;">Alertas críticas:</p>
    <div id="issues-${deviceId}" style="font-size:0.8rem; color:#ff5555; min-height:1rem;">Ninguna</div>

    <div style="margin-top:1rem; border-top:1px solid #222; padding-top:1rem;">
      <p class="label">Accionamiento remoto</p>
      <button id="btnLed-${deviceId}" class="btn btn-action" onclick="alternarActuadorNodo('${deviceId}')">
        💡 Encender LED
      </button>
      <div id="ledStatus-${deviceId}" class="label" style="margin-top:0.4rem; text-align:center;">
        Estado: APAGADO ⚫
      </div>
    </div>
    
    <div class="label" style="margin-top:1rem; font-size:0.7rem; text-align:right;" id="time-${deviceId}">
      Sincronizado: —
    </div>
  `;
  return card;
}

/**
 * Envía el comando de aprovisionamiento con el tipo de planta configurado por el usuario
 */
function autorizarDispositivo(deviceId) {
  const selectElement = document.getElementById(`select-${deviceId}`);
  if (!selectElement) return;
  
  const plantaSeleccionada = selectElement.value;

  ws.send(JSON.stringify({
    device_id: deviceId,
    command: 'ASSIGN_PLANT',
    plant_type: plantaSeleccionada
  }));
}

/**
 * Actualiza puntualmente las lecturas de una tarjeta activa sin alterar el resto del DOM
 */
function actualizarTelemetriaNodo(data) {
  const elValor = document.getElementById(`valor-${data.device_id}`);
  const elTime = document.getElementById(`time-${data.device_id}`);
  const elSalud = document.getElementById(`salud-${data.device_id}`);
  const elIssues = document.getElementById(`issues-${data.device_id}`);

  if (elValor) elValor.textContent = data.humidity !== undefined ? `${data.humidity}%` : '—';
  if (elTime) elTime.textContent = `Sincronizado: ${new Date().toLocaleTimeString()}`;
  
  // Procesar estado de salud devuelto por el algoritmo del backend
  if (data.health) {
    if (elSalud) {
      elSalud.textContent = data.health.status.toUpperCase();
      elSalud.style.color = data.health.status === 'saludable' ? '#0f0' : '#ff5555';
    }
    if (elIssues) {
      elIssues.textContent = data.health.issues.length > 0 ? data.health.issues.join(', ') : 'Ninguna';
    }
  }
}

/**
 * Modifica las propiedades visuales del botón de control de un dispositivo específico
 */
function actualizarEstadoRiegoUI(deviceId, estaRegando) {
  estadosLedsLocales.set(deviceId, estaRegando);
  
  const btn = document.getElementById(`btnLed-${deviceId}`);
  const status = document.getElementById(`ledStatus-${deviceId}`);
  
  if (btn && status) {
    btn.textContent = estaRegando ? '💡 Apagar LED' : '💡 Encender LED';
    btn.style.background = estaRegando ? '#ff0' : '#0f0';
    status.textContent = `Estado: ${estaRegando ? 'ENCENDIDO 🟡' : 'APAGADO ⚫'}`;
  }
}

/**
 * Dispara la petición de conmutación manual para un módulo específico
 */
function alternarActuadorNodo(deviceId) {
  const estadoActual = estadosLedsLocales.get(deviceId) || false;
  const proximoEstado = !estadoActual;

  ws.send(JSON.stringify({
    device_id: deviceId,
    command: proximoEstado ? 'LED_ON' : 'LED_OFF'
  }));
}