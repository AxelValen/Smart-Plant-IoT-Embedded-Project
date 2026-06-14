const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${wsProtocol}//${location.host}`);

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

    // Carga inicial de tipos de plantas provistas por la base de datos (vía Backend)
    if (d.type === 'init_data') {
      opcionesPlantas = d.plants;
      return;
    }

    // Actualización de la topología de la red 
    if (d.type === 'device_update') {
      renderizarListasDispositivos(d.devices);
      return;
    }

    // Recepción de flujos continuos de telemetría
    if (d.type === 'sensor_data') {
      actualizarTelemetriaNodo(d);
    }

    // Sincronización asíncrona de eventos de riego (manuales o automáticos)
    if (d.type === 'watering_started' || d.type === 'watering_stopped') {
      actualizarEstadoRiegoUI(d.device_id, d.type === 'watering_started', d.reason);
    }

  } catch(e) {
    console.error('Error procesando mensaje WebSocket entrante:', e);
  }
};

/*
Redibuja los contenedores de tarjetas dividiendo los dispositivos en función de su estado
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

/*
Construye la interfaz de un nodo detectado para registro
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

/*
Genera el módulo de monitoreo e interacción en tiempo real para un nodo autorizado
*/
function crearTarjetaActiva(deviceId, devInfo) {
  const card = document.createElement('div');
  card.className = 'card';
  card.id = `card-${deviceId}`;

  if (!estadosLedsLocales.has(deviceId)) {
    estadosLedsLocales.set(deviceId, { regando: false, reason: null });
  }
  
  const estadoRiego = estadosLedsLocales.get(deviceId);
  const cultivoLegible = devInfo.plant_type.toUpperCase();
  
  // Lógica visual para estado offline
  const isOffline = devInfo.status === 'offline';
  const opacityStyle = isOffline ? 'opacity: 0.5; filter: grayscale(100%);' : '';
  const offlineBadge = isOffline ? '<div style="background:#ff5555; color:#fff; text-align:center; padding:0.3rem; margin-bottom:1rem; font-weight:bold; border-radius:4px;">⚠️ MÓDULO OFFLINE</div>' : '';

  const autoActivo = estadoRiego.regando && estadoRiego.reason === 'automatic';

  // Extrae datos cacheados en el backend al recargar la página
  const lastH = devInfo.lastReading && devInfo.lastReading.humidity !== undefined ? `${devInfo.lastReading.humidity}%` : '—';
  const lastSalud = devInfo.health ? devInfo.health.status.toUpperCase() : 'Evaluando...';
  const lastIssues = devInfo.health && devInfo.health.issues.length > 0 ? devInfo.health.issues.join(', ') : 'Ninguna';
  
  const colorSalud = devInfo.health?.status === 'saludable' ? '#0f0' : (devInfo.health?.status === 'en_riesgo' ? '#ff5555' : '#fff');
  const colorIssues = devInfo.health && devInfo.health.issues.length > 0 ? '#ff5555' : '#0f0';

  card.innerHTML = `
    ${offlineBadge}
    <div style="${opacityStyle}">
      <h3>Módulo: ${deviceId} [${cultivoLegible}]</h3>
      
      <p class="label">Humedad de suelo</p>
      <div class="value" id="valor-${deviceId}">${lastH}</div>
      
      <p class="label">Estado de salud</p>
      <div id="salud-${deviceId}" style="font-weight:bold; color:${colorSalud};">${lastSalud}</div>
      
      <p class="label" style="margin-top:1rem;">Alertas críticas:</p>
      <div id="issues-${deviceId}" style="font-size:0.8rem; color:${colorIssues}; min-height:1rem;">${lastIssues}</div>

      <div style="margin-top:1rem; border-top:1px solid #222; padding-top:1rem;">
        <p class="label">Accionamiento Remoto</p>
        
        <button id="btnLed-${deviceId}" class="btn btn-action" onclick="alternarActuadorNodo('${deviceId}')" 
                style="display: ${autoActivo ? 'none' : 'block'}; background: ${estadoRiego.regando ? '#ff0' : '#0f0'}">
          ${estadoRiego.regando ? '💧 Activar regado' : '💧 Desactivar regado'}
        </button>
        
        <div id="ledStatus-${deviceId}" class="label" style="margin-top:0.4rem; text-align:center;">
          ${autoActivo ? '<span style="color:#0ff; font-weight:bold;">🔄 Riego automático activo</span>' : `Estado: ${estadoRiego.regando ? 'ENCENDIDO 🟡' : 'APAGADO ⚫'}`}
        </div>
      </div>
      
      <div class="label" style="margin-top:1rem; font-size:0.7rem; text-align:right;" id="time-${deviceId}">
        Sincronizado: ${devInfo.lastReading ? new Date(devInfo.last_seen || Date.now()).toLocaleTimeString() : '—'}
      </div>
    </div>
  `;
  return card;
}

/*
Envía el comando de aprovisionamiento con el tipo de planta configurado por el usuario
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

/*
Actualiza las lecturas de una tarjeta activa sin alterar el resto del DOM
*/
function actualizarTelemetriaNodo(data) {
  // Declaración de los selectores del DOM
  const elValor  = document.getElementById(`valor-${data.device_id}`);
  const elTime   = document.getElementById(`time-${data.device_id}`);
  const elSalud  = document.getElementById(`salud-${data.device_id}`);
  const elIssues = document.getElementById(`issues-${data.device_id}`);

  // Actualizamos la humedad y el timestamp
  if (elValor) elValor.textContent = data.humidity !== undefined ? `${data.humidity}%` : '—';
  if (elTime)  elTime.textContent  = `Sincronizado: ${new Date().toLocaleTimeString()}`;
  
  // Procesamos el estado de salud devuelto por el algoritmo del backend
  if (data.health) {
    if (elSalud) {
      elSalud.textContent = data.health.status.toUpperCase();
      elSalud.style.color = data.health.status === 'saludable' ? '#0f0' : '#ff5555';
    }
    if (elIssues) {
      if (data.health.issues.length > 0) {
        elIssues.textContent = data.health.issues.join(', ');
        elIssues.style.color = '#ff5555';
      } else {
        elIssues.textContent = 'Ninguna';
        elIssues.style.color = '#0f0';
      }
    }
  }
}

/*
Modifica las propiedades visuales del botón de control de un dispositivo específico
*/
function actualizarEstadoRiegoUI(deviceId, estaRegando, reason) {
  estadosLedsLocales.set(deviceId, { regando: estaRegando, reason: reason });
  
  const btn = document.getElementById(`btnLed-${deviceId}`);
  const status = document.getElementById(`ledStatus-${deviceId}`);
  
  if (btn && status) {
    if (estaRegando && reason === 'automatic') {
       // Oculta el botón manual y muestra la etiqueta de riego automático
       btn.style.display = 'none';
       status.innerHTML = `<span style="color:#0ff; font-weight:bold;">🔄 Riego automático activo</span>`;
    } else {
       // Restaura el botón manual
       btn.style.display = 'block';
       btn.textContent = estaRegando ? '💧 Activar regado' : '💧 Desactivar regado';
       btn.style.background = estaRegando ? '#ff0' : '#0f0';
       status.innerHTML = `Estado: ${estaRegando ? 'ENCENDIDO 🟡' : 'APAGADO ⚫'}`;
    }
  }
}

/*
Dispara la petición de accionamiento manual para un módulo específico
*/
function alternarActuadorNodo(deviceId) {
  const estadoActual = estadosLedsLocales.get(deviceId) || { regando: false };
  const proximoEstado = !estadoActual.regando;

  ws.send(JSON.stringify({
    device_id: deviceId,
    command: proximoEstado ? 'LED_ON' : 'LED_OFF'
  }));
}