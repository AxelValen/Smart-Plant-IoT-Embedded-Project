const SP_TOKEN_KEY = 'sp_token';

let ws = null;
let gardenCache = [];
let deviceSnapshot = {};
let pendingDeviceId = null;
let pendingAssignmentShown = false;
let currentMonitorPlant = null;
let currentMonitorData = null;
let monitorRefreshTimer = null;
let monitorWindowKey = '24h';

// --- Gráfica histórica del monitor (Chart.js) ---
let sensorChartInstance = null;
let sensorChartMetrics = null; // claves de telemetry actualmente graficadas, ej. ['temperature']
let sensorChartButtonsBound = false;
let sensorChartRenderedMetrics = null;   // métricas con las que se construyó/actualizó el chart actual
let sensorChartRenderedWindowKey = null; // ventana (1h/24h/1w/1m) de los datos actualmente pintados

const SENSOR_CHART_META = {
  temperature: { label: 'Temperatura del suelo', unit: '°C', color: '#c0573a' },
  humidity: { label: 'Humedad / nivel de agua', unit: '%', color: '#4a90d9' },
  nitrogeno: { label: 'Nitrógeno (N)', unit: '%', color: '#4a7c59' },
  fosforo: { label: 'Fósforo (P)', unit: '%', color: '#c79a35' },
  potasio: { label: 'Potasio (K)', unit: '%', color: '#7a63ad' }
};

window.logout = logout;

document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem(SP_TOKEN_KEY);
  if (!token) {
    window.location.href = 'login.html';
    return;
  }

  const currentPage = window.location.pathname.split('/').pop() || 'home.html';
  document.querySelectorAll('.nav-links a').forEach(link => {
    // Obtenemos el atributo href real (ej: "home.html")
    const linkHref = link.getAttribute('href');
    
    // Si el href coincide con la página actual, le añadimos la clase 'activo'
    if (linkHref === currentPage) {
      link.classList.add('activo');
    } else {
      link.classList.remove('activo'); // Limpiamos por si acaso
    }
  });

  apiFetch('/api/auth/me')
    .then(data => {
      if (data && data.user && data.user.name) {
        // Busca el enlace que apunta a cuenta.html dentro de la navegación
        const cuentaLink = document.querySelector('.nav-links a[href="cuenta.html"]');
        if (cuentaLink) {
          // Extrae solo el primer nombre y le concatena el emoji
          cuentaLink.textContent = '👤 ' + data.user.name.split(' ')[0];
        }
      }
    })
    .catch(err => console.error('Error al cargar nombre para el menú:', err));

  cargarJardin();

  inicializarCarruselPrincipal();
  inicializarCarruselesCatalogo();
  inicializarSeleccionDePlantas();
  inicializarJardinVirtual();
  inicializarMonitorDePlanta();
  conectarWebSocket();

  if (document.querySelectorAll('[data-add-plant="true"][data-plant-id]').length > 0) {
    actualizarContadoresDelCatalogo();
  }
});

function logout() {
  localStorage.removeItem(SP_TOKEN_KEY);
  window.location.href = 'login.html';
}

function getToken() {
  return localStorage.getItem(SP_TOKEN_KEY) || '';
}

function apiFetch(url, options = {}) {
  const headers = Object.assign({}, options.headers || {}, {
    Authorization: `Bearer ${getToken()}`
  });

  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  return fetch(url, { ...options, headers }).then(async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Error en la petición');
    }
    return data;
  });
}

function conectarWebSocket() {
  try {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        manejarMensajeWebSocket(data);
      } catch (error) {
        console.error('Error leyendo mensaje WS:', error);
      }
    });

    ws.addEventListener('error', (error) => {
      console.error('Error WebSocket:', error);
    });
  } catch (error) {
    console.error('No se pudo inicializar WebSocket:', error);
  }
}

function enviarComandoWS(command, extra = {}) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.error('WebSocket no está conectado');
    return;
  }

  ws.send(JSON.stringify({
    command,
    token: getToken(),
    ...extra
  }));
}

function manejarMensajeWebSocket(data) {
  if (!data || typeof data !== 'object') return;

  if (data.type === 'device_update') {
    deviceSnapshot = data.devices || {};
    sincronizarJardinConDispositivos();
    renderizarJardinDesdeCache();
    actualizarContadoresDelCatalogo();
    manejarDispositivosPendientes();
    actualizarEstadoMonitorDesdeDispositivos();
    return;
  }

  if (data.type === 'sensor_data') {
    actualizarMonitorEnVivo(data);
    return;
  }

  if (data.type === 'watering_started') {
    marcarRiegoEnMonitor(data.device_id, true);
    // Refrescamos silenciosamente para que el evento en estado "En curso..." aparezca en la tabla
    if (currentMonitorPlant && currentMonitorPlant.device_id === data.device_id) {
      refrescarMonitorActivo(false);
    }
    return;
  }

  if (data.type === 'watering_stopped') {
    marcarRiegoEnMonitor(data.device_id, false);
    // Refrescamos silenciosamente para traer la duración final de riego
    if (currentMonitorPlant && currentMonitorPlant.device_id === data.device_id) {
      refrescarMonitorActivo(false);
    }
  }
}

function inicializarCarruselPrincipal() {
  document.querySelectorAll('.carousel').forEach((carrusel) => {
    const tarjetas = Array.from(carrusel.children).filter((elemento) => elemento.classList.contains('card-container'));
    if (tarjetas.length === 0) return;

    const botonAnterior = carrusel.querySelector('.carousel-nav.left');
    const botonSiguiente = carrusel.querySelector('.carousel-nav.right');
    const maxVisibility = Number.parseInt(carrusel.dataset.maxVisibility || '3', 10);
    const inicioSolicitado = Number.parseInt(carrusel.dataset.start || '0', 10);
    let tarjetaActiva = Number.isNaN(inicioSolicitado) ? 0 : limitar(inicioSolicitado, 0, tarjetas.length - 1);

    function actualizarCarrusel() {
      tarjetas.forEach((tarjeta, indice) => {
        const diferencia = tarjetaActiva - indice;
        const distancia = Math.abs(diferencia);
        tarjeta.style.setProperty('--active', indice === tarjetaActiva ? '1' : '0');
        tarjeta.style.setProperty('--offset', diferencia / 3);
        tarjeta.style.setProperty('--direction', Math.sign(diferencia));
        tarjeta.style.setProperty('--abs-offset', distancia / 3);
        tarjeta.style.pointerEvents = indice === tarjetaActiva ? 'auto' : 'none';

        const opacidad = indice === tarjetaActiva ? 1 : Math.max(0.08, 1 - distancia * 0.46);
        tarjeta.style.opacity = distancia >= maxVisibility ? '0' : String(opacidad);
        tarjeta.style.display = distancia > maxVisibility ? 'none' : 'block';

        const modelo = tarjeta.querySelector('model-viewer');
        if (modelo) {
          if (indice === tarjetaActiva) modelo.setAttribute('auto-rotate', '');
          else modelo.removeAttribute('auto-rotate');
        }
      });

      if (botonAnterior) botonAnterior.disabled = tarjetaActiva === 0;
      if (botonSiguiente) botonSiguiente.disabled = tarjetaActiva === tarjetas.length - 1;
    }

    botonAnterior?.addEventListener('click', () => {
      if (tarjetaActiva > 0) {
        tarjetaActiva -= 1;
        actualizarCarrusel();
      }
    });

    botonSiguiente?.addEventListener('click', () => {
      if (tarjetaActiva < tarjetas.length - 1) {
        tarjetaActiva += 1;
        actualizarCarrusel();
      }
    });

    carrusel.addEventListener('keydown', (evento) => {
      if (evento.key === 'ArrowLeft' && tarjetaActiva > 0) {
        evento.preventDefault();
        tarjetaActiva -= 1;
        actualizarCarrusel();
      }
      if (evento.key === 'ArrowRight' && tarjetaActiva < tarjetas.length - 1) {
        evento.preventDefault();
        tarjetaActiva += 1;
        actualizarCarrusel();
      }
    });

    actualizarCarrusel();
  });
}

function inicializarCarruselesCatalogo() {
  document.querySelectorAll('.catalog-carousel').forEach((carrusel) => {
    const tarjetas = Array.from(carrusel.querySelectorAll('.catalog-item'));
    if (tarjetas.length === 0) return;

    const botonAnterior = carrusel.querySelector('.catalog-arrow.left');
    const botonSiguiente = carrusel.querySelector('.catalog-arrow.right');
    const inicioSolicitado = Number.parseInt(carrusel.dataset.start || '0', 10);
    let activa = Number.isNaN(inicioSolicitado) ? 0 : normalizarIndice(inicioSolicitado, tarjetas.length);

    function actualizar() {
      tarjetas.forEach((tarjeta, indice) => {
        const nivel = obtenerNivelCircular(indice, activa, tarjetas.length);
        const visible = Math.abs(nivel) <= 2;

        tarjeta.dataset.level = visible ? String(nivel) : 'hidden';
        tarjeta.setAttribute('aria-hidden', visible ? 'false' : 'true');
        tarjeta.tabIndex = nivel === 0 ? 0 : -1;

        const modelo = tarjeta.querySelector('model-viewer');
        if (modelo) {
          if (nivel === 0) modelo.setAttribute('auto-rotate', '');
          else modelo.removeAttribute('auto-rotate');
        }
      });
    }

    function mover(direccion) {
      activa = normalizarIndice(activa + direccion, tarjetas.length);
      actualizar();
    }

    botonAnterior?.addEventListener('click', () => mover(-1));
    botonSiguiente?.addEventListener('click', () => mover(1));

    carrusel.addEventListener('keydown', (evento) => {
      if (evento.key === 'ArrowLeft') {
        evento.preventDefault();
        mover(-1);
      }
      if (evento.key === 'ArrowRight') {
        evento.preventDefault();
        mover(1);
      }
    });

    actualizar();
  });
}

function obtenerNivelCircular(indice, activo, total) {
  let diferencia = indice - activo;
  if (diferencia > total / 2) diferencia -= total;
  if (diferencia < -total / 2) diferencia += total;
  return diferencia;
}

function normalizarIndice(indice, total) {
  return ((indice % total) + total) % total;
}

function inicializarSeleccionDePlantas() {
  document.querySelectorAll('[data-add-plant="true"][data-plant-id]').forEach((tarjeta) => {
    tarjeta.addEventListener('click', () => añadirNuevaInstancia(tarjeta));
    tarjeta.addEventListener('keydown', (evento) => {
      if (evento.key === 'Enter' || evento.key === ' ') {
        evento.preventDefault();
        añadirNuevaInstancia(tarjeta);
      }
    });
  });
}

async function añadirNuevaInstancia(tarjeta) {
  const plantTypeName = tarjeta.dataset.plantName?.trim();
  const plantTypeKey = tarjeta.dataset.plantId?.trim();
  const plantTypeLabel = tarjeta.dataset.plantType?.trim() || '';
  const modelSrc = tarjeta.dataset.model?.trim();

  if (!plantTypeName || !plantTypeKey) {
    console.error('La tarjeta no tiene data-plant-name o data-plant-id.');
    mostrarToast('No se pudo añadir esta planta.');
    return;
  }

  try {
    await apiFetch('/api/garden', {
      method: 'POST',
      body: JSON.stringify({
        plant_type_name: plantTypeName,
        plant_type_key: plantTypeKey,
        plant_type: plantTypeLabel,
        model_src: modelSrc
      })
    });

    await cargarJardin();
    mostrarToast(`${plantTypeName} añadida al jardín.`);
  } catch (error) {
    console.error('Error al añadir planta:', error);
    mostrarToast('No se pudo añadir esta planta.');
  }
}

function actualizarContadoresDelCatalogo() {
  const conteos = contarPorEspecie(gardenCache);
  document.querySelectorAll('[data-add-plant="true"][data-plant-id]').forEach((tarjeta) => {
    const cantidad = conteos.get(normalizarClave(tarjeta.dataset.plantName || tarjeta.dataset.plantId)) || 0;
    actualizarTarjetaDeCatalogo(tarjeta, cantidad);
  });
}

function actualizarTarjetaDeCatalogo(tarjeta, cantidad) {
  const estado = tarjeta.querySelector('.plant-status');
  tarjeta.classList.toggle('has-copies', cantidad > 0);
  if (estado) {
    estado.textContent = cantidad > 0 ? `En jardín ×${cantidad} · añadir otra` : 'Click para añadir';
  }
}

function contarPorEspecie(plantas) {
  const conteos = new Map();
  plantas.forEach((planta) => {
    const clave = normalizarClave(planta.plant_type_id?.display_name || planta.plant_type_id?.name || '');
    conteos.set(clave, (conteos.get(clave) || 0) + 1);
  });
  return conteos;
}

function normalizarClave(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-');
}

function sincronizarJardinConDispositivos() {
  gardenCache = gardenCache.map((planta) => {
    const matchedDevice = Object.values(deviceSnapshot).find((device) => device.garden_plant_id === planta._id);
    if (matchedDevice) {
      return { ...planta, device_id: matchedDevice.device_id };
    }

    if (planta.device_id && deviceSnapshot[planta.device_id]) {
      return { ...planta, device_id: planta.device_id };
    }

    return planta;
  });
}

function inicializarJardinVirtual() {
  const grid = document.getElementById('gardenGrid');
  if (!grid) return;

  const dialogo = document.getElementById('plantActionsDialog');
  const eliminar = document.getElementById('deletePlantAction');
  const desasignar = document.getElementById('unassignPlantAction');

  desasignar?.addEventListener('click', () => {
    if (!currentMonitorPlant || !currentMonitorPlant.device_id) return;

    const deviceId = currentMonitorPlant.device_id;
    const plantId = currentMonitorPlant._id;

    enviarComandoWS('UNASSIGN_PLANT', {
      device_id: deviceId,
      garden_plant_id: plantId
    });

    // Refrescar el jardín localmente en breve para cargar el ID archivado
    setTimeout(cargarJardin, 500);

    if (dialogo?.open) dialogo.close();
    mostrarToast('Módulo desasignado. La planta conserva su historial.');
  });

  eliminar?.addEventListener('click', async () => {
    if (!currentMonitorPlant) return;
    try {
      const idEliminar = currentMonitorPlant._id;
      gardenCache = gardenCache.filter(p => p._id !== idEliminar);

      await apiFetch(`/api/garden/${idEliminar}`, { method: 'DELETE' });
      currentMonitorPlant = null;
      await cargarJardin();
      if (dialogo?.open) dialogo.close();
      mostrarToast('Planta eliminada.');
    } catch (error) {
      console.error('Error al eliminar planta:', error);
      mostrarToast('No se pudo eliminar la planta.');
      cargarJardin();
    }
  });

  dialogo?.addEventListener('close', () => {
    currentMonitorPlant = null;
  });
}

async function cargarJardin() {
  try {
    const response = await apiFetch('/api/garden');
    gardenCache = response.garden || [];
    sincronizarJardinConDispositivos();
    renderizarJardinDesdeCache();
    actualizarContadoresDelCatalogo();
    manejarDispositivosPendientes();
    detectarPlantaEnMonitorDesdeCache();
  } catch (error) {
    console.error('Error al cargar jardín:', error);
    gardenCache = [];
    renderizarJardinDesdeCache();
  }
}

function renderizarJardinDesdeCache() {
  const grid = document.getElementById('gardenGrid');
  const empty = document.getElementById('gardenEmpty');
  const count = document.getElementById('gardenCount');
  if (!grid) return;

  grid.replaceChildren();
  if (empty) empty.hidden = gardenCache.length > 0;
  if (count) count.textContent = `${gardenCache.length} ${gardenCache.length === 1 ? 'planta' : 'plantas'}`;

  gardenCache.forEach((planta) => {
    const tarjeta = document.createElement('article');
    tarjeta.className = 'garden-plant-card';
    tarjeta.tabIndex = 0;
    tarjeta.dataset.instanceId = planta._id;
    tarjeta.setAttribute('role', 'button');

    const modelo = document.createElement('model-viewer');
    modelo.src = planta.model_src || '';
    modelo.alt = `Modelo 3D de ${obtenerNombreDePlanta(planta)}`;
    modelo.setAttribute('auto-rotate', '');
    modelo.setAttribute('auto-rotate-delay', '0');
    modelo.setAttribute('rotation-per-second', '18deg');
    modelo.setAttribute('shadow-intensity', '1');
    modelo.setAttribute('interaction-prompt', 'none');

    const info = document.createElement('div');
    info.className = 'garden-plant-info';

    const tipo = document.createElement('span');
    tipo.className = 'garden-plant-type';
    tipo.textContent = planta.plant_type_id?.display_name || planta.plant_type_id?.name || 'Planta';

    const nombre = document.createElement('strong');
    nombre.textContent = obtenerNombreDePlanta(planta);

    // Identificar si el dispositivo es un historial archivado para el texto de la tarjeta
    const isArchived = planta.device_id && planta.device_id.startsWith('archived_');
    const hint = document.createElement('span');
    hint.className = 'garden-plant-hint';
    
    // NUEVA LÓGICA: Separamos los 3 casos posibles
    if (planta.device_id && !isArchived) {
      hint.textContent = `Asignada a ${planta.device_id}`;
    } else if (isArchived) {
      hint.textContent = 'Historial archivado';
    } else {
      hint.textContent = 'Sin dispositivo asignado';
    }

    info.append(tipo, nombre, hint);
    tarjeta.append(modelo, info);

    const activar = () => abrirDialogoDePlanta(planta);
    tarjeta.addEventListener('click', activar);
    tarjeta.addEventListener('keydown', (evento) => {
      if (evento.key === 'Enter' || evento.key === ' ') {
        evento.preventDefault();
        activar();
      }
    });

    grid.appendChild(tarjeta);
  });
}

function obtenerNombreDePlanta(planta) {
  return planta?.plant_type_id?.display_name || planta?.plant_type_id?.name || 'Planta';
}

function abrirDialogoDePlanta(planta) {
  const dialogo = document.getElementById('plantActionsDialog');
  const nombre = document.getElementById('actionPlantName');
  const tipo = document.getElementById('actionPlantType');
  const monitor = document.getElementById('viewMonitorAction');
  const desasignar = document.getElementById('unassignPlantAction');

  currentMonitorPlant = planta;
  if (nombre) nombre.textContent = obtenerNombreDePlanta(planta);
  if (tipo) tipo.textContent = planta.plant_type_id?.display_name || planta.plant_type_id?.name || '';
  if (monitor) monitor.href = `monitor.html?plant=${encodeURIComponent(planta._id)}&window=24h`;
  
  if (desasignar) {
    desasignar.style.display = (planta.device_id && !planta.device_id.startsWith('archived_')) ? 'block' : 'none';
  }
  
  if (dialogo?.showModal) dialogo.showModal();
}

function detectarPlantaEnMonitorDesdeCache() {
  const monitorPage = document.getElementById('monitorPage');
  if (!monitorPage) return;

  const instanceId = new URLSearchParams(window.location.search).get('plant');
  if (!instanceId) {
    mostrarMonitorNoEncontrado('El enlace no corresponde a una planta activa.');
    return;
  }

  const planta = gardenCache.find((item) => item._id === instanceId);
  if (!planta) {
    mostrarMonitorNoEncontrado('La planta pudo haber sido eliminada o el enlace es inválido.');
    return;
  }

  currentMonitorPlant = planta;
  cargarMonitorDesdeAPI(planta, new URLSearchParams(window.location.search).get('window') || '1h');
}

async function inicializarMonitorDePlanta() {
  const monitorPage = document.getElementById('monitorPage');
  if (!monitorPage) return;

  const instanceId = new URLSearchParams(window.location.search).get('plant');
  if (!instanceId) return;

  const boton = document.getElementById('wateringButton');
  boton?.addEventListener('click', manejarClickRiego);

  const selector = document.getElementById('monitorWindowSelect');
  const queryWindow = new URLSearchParams(window.location.search).get('window');
  if (selector) {
    monitorWindowKey = queryWindow || selector.value || '24h';
    selector.value = monitorWindowKey;
    selector.addEventListener('change', async (event) => {
      monitorWindowKey = event.target.value;
      await refrescarMonitorActivo(true);
    });
  } else if (queryWindow) {
    monitorWindowKey = queryWindow;
  }

  await cargarMonitorDesdeAPIPlaceholder(instanceId);
  iniciarRefrescoDelMonitor();
}

async function cargarMonitorDesdeAPIPlaceholder(instanceId) {
  const planta = gardenCache.find((item) => item._id === instanceId);
  if (planta) {
    await cargarMonitorDesdeAPI(planta, monitorWindowKey);
    return;
  }

  try {
    const response = await apiFetch(`/api/monitor/${encodeURIComponent(instanceId)}?window=${encodeURIComponent(monitorWindowKey)}`);
    currentMonitorData = response;
    currentMonitorPlant = response.garden_plant || null;
    renderizarMonitor(response);
  } catch (error) {
    console.error('Error al cargar monitor:', error);
    mostrarMonitorNoEncontrado('La planta pudo haber sido eliminada o el enlace no es válido.');
  }
}

async function cargarMonitorDesdeAPI(planta, windowKey) {
  try {
    const response = await apiFetch(`/api/monitor/${encodeURIComponent(planta._id)}?window=${encodeURIComponent(windowKey)}`);
    currentMonitorData = response;
    currentMonitorPlant = response.garden_plant || planta;
    monitorWindowKey = windowKey || monitorWindowKey;
    renderizarMonitor(response);
  } catch (error) {
    console.error('Error al cargar monitor:', error);
    mostrarMonitorNoEncontrado('La planta pudo haber sido eliminada o el enlace no es válido.');
  }
}

function renderizarMonitor(data) {
  const monitorPage = document.getElementById('monitorPage');
  if (!monitorPage) return;

  const gardenPlant = data.garden_plant || currentMonitorPlant;
  const plantType = gardenPlant?.plant_type_id || {};
  const telemetry = data.telemetry || crearTelemetriaVacia();
  const health = data.health || { status: 'desconocido', issues: [], needsWatering: false };
  const deviceId = gardenPlant?.device_id || null;
  const deviceStatus = data.device_status || (deviceId ? (deviceSnapshot[deviceId]?.status || 'offline') : 'unassigned');
  const isWatering = data.isWatering ?? currentMonitorData?.isWatering ?? false;

  // Filtrar visualmente si el ID es un archivo histórico
  const isArchived = deviceId && deviceId.startsWith('archived_');
  const displayDeviceId = isArchived ? null : deviceId;

  document.getElementById('monitorPlantOverview')?.removeAttribute('hidden');
  document.getElementById('monitorContent')?.removeAttribute('hidden');
  document.getElementById('monitorNotFound')?.setAttribute('hidden', '');
  document.getElementById('monitorHeaderTitle').textContent = obtenerNombreDePlanta(gardenPlant);
  document.getElementById('monitorHeaderSubtitle').textContent = displayDeviceId
    ? `Datos exclusivos del módulo asignado a ${obtenerNombreDePlanta(gardenPlant)}.`
    : 'La planta todavía no tiene un dispositivo asignado.';
  document.getElementById('monitorPlantName').textContent = obtenerNombreDePlanta(gardenPlant);
  document.getElementById('monitorPlantType').textContent = plantType.display_name || plantType.name || 'Tipo de planta';
  document.getElementById('monitorPlantInstance').textContent = displayDeviceId || 'sin asignar';

  const moduleStatus = document.getElementById('monitorModuleStatus');
  if (moduleStatus) {
    moduleStatus.textContent = displayDeviceId ? 'Módulo asignado' : 'Sin módulo asignado';
  }

  // Mostrar la última fecha de actualización sin importar si está asignado o es historial archivado
  const lastUpdateElem = document.getElementById('monitorLastUpdate');
  if (lastUpdateElem) {
    // NUEVO: Utiliza el timestamp de telemetry.latest si existe
    const realLastTimestamp = telemetry.latest?.timestamp || 
      (telemetry.timestamps && telemetry.timestamps.length > 0 ? telemetry.timestamps[telemetry.timestamps.length - 1] : null);

    if (realLastTimestamp) {
      const lastTime = new Date(realLastTimestamp);
      const timeStr = lastTime.toLocaleString('es-ES', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
      });
      lastUpdateElem.textContent = `Última actualización: ${timeStr}`;
      lastUpdateElem.style.display = 'block';
    } else {
      lastUpdateElem.style.display = 'none';
    }
  }

  const modelo = document.getElementById('monitorPlantModel');
  if (modelo) {
    modelo.src = gardenPlant?.model_src || '';
    modelo.alt = `Modelo 3D de ${obtenerNombreDePlanta(gardenPlant)}`;
  }

  const state = convertirTelemetriaAEstado(telemetry, plantType.ideal);
  state.isWatering = isWatering;
  currentMonitorData = {
    ...data,
    telemetry,
    state,
    health,
    isWatering
  };

  renderizarTodosLosSensores(state);
  inicializarBotonesDeGrafica();
  actualizarGraficaAbierta();

  renderizarRecomendaciones(plantType.ideal, health);
  actualizarBotonRiego(state, plantType.ideal, displayDeviceId, deviceStatus);
  renderizarTablaRiego(data.watering_events);
  actualizarEstadoConexionMonitor(deviceStatus, displayDeviceId);

  if (gardenPlant?.device_id) {
    currentMonitorPlant.device_id = gardenPlant.device_id;
  }
}

function crearTelemetriaVacia() {
  return {
    timestamps: [],
    humidity: [],
    temperature: [],
    nitrogeno: [],
    fosforo: [],
    potasio: []
  };
}

function convertirTelemetriaAEstado(telemetry, ideal) {
  // NUEVO: Se busca primero el valor absoluto en 'latest', y si no hay, hace fallback a los arreglos
  const humedad = telemetry.latest?.humidity ?? ultimoValor(telemetry.humidity);
  const temperature = telemetry.latest?.temperature ?? ultimoValor(telemetry.temperature);
  const nitrogeno = telemetry.latest?.nitrogeno ?? ultimoValor(telemetry.nitrogeno);
  const fosforo = telemetry.latest?.fosforo ?? ultimoValor(telemetry.fosforo);
  const potasio = telemetry.latest?.potasio ?? ultimoValor(telemetry.potasio);

  return {
    metrics: {
      temp: crearMetrica(temperature, '°C', 'Temperatura del suelo', '#c0573a', telemetry.temperature || []),
      humedad: crearMetrica(humedad, '%', 'Humedad / nivel de agua', '#4a90d9', telemetry.humidity || []),
      nitrogeno: crearMetrica(nitrogeno, '%', 'Nitrógeno (N)', '#4a7c59', telemetry.nitrogeno || []),
      fosforo: crearMetrica(fosforo, '%', 'Fósforo (P)', '#c79a35', telemetry.fosforo || []),
      potasio: crearMetrica(potasio, '%', 'Potasio (K)', '#7a63ad', telemetry.potasio || [])
    },
    ideal: ideal || null,
    latestHumidity: humedad,
    isWatering: false
  };
}

function crearMetrica(value, unit, label, color, history) {
  return {
    value: Number.isFinite(value) ? value : 0,
    unit,
    label,
    color,
    history: Array.isArray(history) && history.length > 0 ? history : [0]
  };
}

function ultimoValor(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const value = values[values.length - 1];
  return Number.isFinite(value) ? value : 0;
}

function renderizarTodosLosSensores(state) {
  Object.keys(state.metrics).forEach((key) => renderizarSensor(key, state.metrics[key]));
}

function renderizarSensor(key, metrica) {
  const porcentaje = limitar(metrica.value, 0, 100);

  if (key === 'temp') {
    const fill = document.getElementById('thermoFill');
    const value = document.getElementById('tempValue');
    if (fill) fill.style.height = `${porcentaje}%`;
    if (value) value.textContent = `${Math.round(metrica.value)}°C`;
    return;
  }

  if (key === 'humedad') {
    const fill = document.getElementById('tankFill');
    const value = document.getElementById('humValue');
    if (fill) fill.style.height = `${porcentaje}%`;
    if (value) value.textContent = `${Math.round(metrica.value)}%`;
    return;
  }

  const ids = {
    nitrogeno: ['nFill', 'nValue'],
    fosforo: ['pFill', 'pValue'],
    potasio: ['kFill', 'kValue']
  };

  const [fillId, valueId] = ids[key] || [];
  const fill = document.getElementById(fillId);
  const value = document.getElementById(valueId);
  if (fill) fill.style.height = `${porcentaje}%`;
  if (value) value.textContent = `${Math.round(metrica.value)}%`;
}

function inicializarBotonesDeGrafica() {
  if (sensorChartButtonsBound) return;
  sensorChartButtonsBound = true;

  document.querySelectorAll('.btn-chart').forEach((boton) => {
    boton.addEventListener('click', (evento) => {
      evento.stopPropagation();
      const metrics = (boton.dataset.chartMetrics || '').split(',').map((m) => m.trim()).filter(Boolean);
      if (metrics.length === 0) return;
      abrirGraficaDeSensor(metrics, boton.dataset.chartLabel || 'Histórico');
    });
  });

  const dialogo = document.getElementById('chartModal');
  document.getElementById('chartModalClose')?.addEventListener('click', () => dialogo?.close());
  dialogo?.addEventListener('close', () => {
    sensorChartMetrics = null;
    sensorChartRenderedMetrics = null;
    sensorChartRenderedWindowKey = null;
    if (sensorChartInstance) {
      sensorChartInstance.destroy();
      sensorChartInstance = null;
    }
  });
}

function abrirGraficaDeSensor(metrics, titulo) {
  const dialogo = document.getElementById('chartModal');
  if (!dialogo) return;

  sensorChartMetrics = metrics;
  document.getElementById('chartModalTitle').textContent = titulo;

  if (dialogo.showModal && !dialogo.open) dialogo.showModal();
  renderizarGraficaDeSensor();
}

function actualizarGraficaAbierta() {
  const dialogo = document.getElementById('chartModal');
  if (dialogo?.open && sensorChartMetrics) renderizarGraficaDeSensor();
}

function construirDatasetsDeGrafica(telemetry, timestamps) {
  return sensorChartMetrics.map((key) => {
    const meta = SENSOR_CHART_META[key] || { label: key, unit: '', color: '#4a7c59' };
    const valores = Array.isArray(telemetry[key]) ? telemetry[key] : [];
    const total = Math.min(timestamps.length, valores.length);
    const data = [];
    for (let i = 0; i < total; i += 1) {
      data.push({ x: timestamps[i], y: valores[i] });
    }
    return {
      label: meta.unit ? `${meta.label} (${meta.unit})` : meta.label,
      data,
      borderColor: meta.color,
      backgroundColor: `${meta.color}33`,
      fill: sensorChartMetrics.length === 1,
      tension: 0.3,
      pointRadius: 2,
      spanGaps: true
    };
  });
}

function renderizarGraficaDeSensor() {
  const canvas = document.getElementById('sensorChart');
  if (!canvas || !sensorChartMetrics || typeof Chart === 'undefined') return;

  const telemetry = currentMonitorData?.telemetry || {};
  const timestamps = Array.isArray(telemetry.timestamps) ? telemetry.timestamps : [];

  // Usamos la ventana con la que REALMENTE llegó este telemetry
  // (currentMonitorData.window, que solo cambia cuando el fetch de esa
  // ventana ya se resolvió) en vez de la variable global monitorWindowKey
  // (que se actualiza de inmediato al tocar el selector, antes de que
  // lleguen los datos). Así evitamos comparar contra un estado "adelantado".
  const windowActual = currentMonitorData?.window || monitorWindowKey;

  const mismaGrafica = Boolean(sensorChartInstance)
    && arraysIguales(sensorChartMetrics, sensorChartRenderedMetrics)
    && sensorChartRenderedWindowKey === windowActual;

  const datasets = construirDatasetsDeGrafica(telemetry, timestamps);

  if (mismaGrafica) {
    // Misma ventana y mismas métricas: refrescamos los datos del chart
    // existente SIN animación ('none'). No importa si el origen es una
    // lectura en vivo (1 punto nuevo) o el refresco de 10s (histórico
    // completo de nuevo): al no animar, no hay "parpadeo" ni reinicio
    // visible en ningún caso, y el eje de tiempo se recalcula igual.
    sensorChartInstance.data.datasets = datasets;
    sensorChartInstance.update('none');
    sensorChartRenderedWindowKey = windowActual;
    return;
  }

  // Cambió la ventana o las métricas (o es la primera vez que se abre):
  // reconstruimos el chart desde cero para que el eje de tiempo arranque
  // limpio, con una animación de entrada normal.
  if (sensorChartInstance) {
    sensorChartInstance.destroy();
    sensorChartInstance = null;
  }

  sensorChartInstance = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          type: 'time',
          time: { tooltipFormat: 'dd/MM/yyyy HH:mm' },
          ticks: { maxRotation: 0, autoSkip: true }
        },
        y: { beginAtZero: false }
      },
      plugins: {
        legend: { display: sensorChartMetrics.length > 1 }
      }
    }
  });

  sensorChartRenderedMetrics = sensorChartMetrics.slice();
  sensorChartRenderedWindowKey = windowActual;
}

function arraysIguales(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((valor, indice) => valor === b[indice]);
}

function renderizarRecomendaciones(ideal, health) {
  const contenedor = document.getElementById('recommendationsSpace');
  if (!contenedor) return;

  if (!ideal) {
    contenedor.textContent = 'No hay umbrales disponibles para esta planta.';
    return;
  }

  const issues = Array.isArray(health?.issues) ? health.issues : [];
  const saludOk = health?.status === 'saludable' && issues.length === 0;
  const saludClass = saludOk ? 'status-card status-card-ok' : 'status-card status-card-bad';
  const alertasClass = issues.length === 0 ? 'status-card status-card-ok' : 'status-card status-card-bad';

  contenedor.innerHTML = `
    <div class="recommendations-grid">
      <div class="${saludClass}">
        <span class="status-card-label">Estado de salud</span>
        <strong>${health?.status || 'desconocido'}</strong>
        <p>${saludOk ? 'La planta está estable.' : 'La planta necesita atención.'}</p>
      </div>
      <div class="${alertasClass}">
        <span class="status-card-label">Alertas</span>
        ${issues.length > 0
          ? `<ul class="recommendations-issues">${issues.map((issue) => `<li>${issue}</li>`).join('')}</ul>`
          : '<p>Sin alertas activas.</p>'}
      </div>
      <div class="status-card status-card-ideal">
        <span class="status-card-label">Condiciones ideales</span>
        <p>Humedad: ${ideal.humidity.min}% - ${ideal.humidity.max}%</p>
        <p>Temperatura: ${ideal.temperature.min}°C - ${ideal.temperature.max}°C</p>
        <p>Nitrógeno: ${ideal.nitrogeno.min} - ${ideal.nitrogeno.max}</p>
        <p>Fósforo: ${ideal.fosforo.min} - ${ideal.fosforo.max}</p>
        <p>Potasio: ${ideal.potasio.min} - ${ideal.potasio.max}</p>
      </div>
    </div>
  `;
}

function actualizarBotonRiego(state, ideal, deviceId, deviceStatus) {
  const boton = document.getElementById('wateringButton');
  if (!boton) return;

  const puedeActivar = Boolean(deviceId) && deviceStatus === 'online' && !state.isWatering;

  boton.disabled = !state.isWatering && !puedeActivar;
  boton.textContent = state.isWatering ? '💧 Detener riego' : '💧 Activar riego';
  boton.dataset.deviceId = deviceId || '';
  boton.dataset.deviceStatus = deviceStatus || 'unassigned';
}

function manejarClickRiego() {
  const boton = document.getElementById('wateringButton');
  if (!boton || !currentMonitorData) return;

  const deviceId = boton.dataset.deviceId || currentMonitorPlant?.device_id || '';
  const ideal = currentMonitorData.garden_plant?.plant_type_id?.ideal || null;
  const state = currentMonitorData.state || {};
  const deviceStatus = boton.dataset.deviceStatus || currentMonitorData.device_status || 'unassigned';
  const isWatering = Boolean(currentMonitorData.isWatering);

  if (!deviceId) {
    mostrarToast('No hay un módulo asignado para regar.');
    return;
  }

  if (deviceStatus !== 'online' && !state.isWatering) {
    mostrarToast('El módulo debe estar en línea para iniciar el riego manual.');
    return;
  }

  if (isWatering) {
    enviarComandoWS('LED_OFF', { device_id: deviceId });
    state.isWatering = false;
    currentMonitorData.isWatering = false;
    actualizarBotonRiego(state, ideal, deviceId, deviceStatus);
    return;
  }

  enviarComandoWS('LED_ON', { device_id: deviceId });
  state.isWatering = true;
  currentMonitorData.isWatering = true;
  actualizarBotonRiego(state, ideal, deviceId, deviceStatus);
}

function actualizarMonitorEnVivo(data) {
  if (!currentMonitorPlant || data.device_id !== currentMonitorPlant.device_id) return;

  const telemetry = currentMonitorData?.telemetry || crearTelemetriaVacia();

  // Sin límite de puntos: el próximo refresco (cada 10s) trae de nuevo la
  // resolución completa desde el backend y reemplaza este telemetry local.
  telemetry.timestamps = pushHistory(telemetry.timestamps, data.timestamp || new Date().toISOString());
  telemetry.humidity = pushHistory(telemetry.humidity, data.humidity);
  telemetry.temperature = pushHistory(telemetry.temperature, data.temperature);
  telemetry.nitrogeno = pushHistory(telemetry.nitrogeno, data.nitrogeno);
  telemetry.fosforo = pushHistory(telemetry.fosforo, data.fosforo);
  telemetry.potasio = pushHistory(telemetry.potasio, data.potasio);

  currentMonitorData.telemetry = telemetry;
  currentMonitorData.device_status = deviceSnapshot[data.device_id]?.status || currentMonitorData.device_status || 'online';
  currentMonitorData.health = currentMonitorData.health || { status: 'desconocido', issues: [], needsWatering: false };
  currentMonitorData.state = convertirTelemetriaAEstado(telemetry, currentMonitorData.garden_plant?.plant_type_id?.ideal || null);
  currentMonitorData.state.isWatering = Boolean(currentMonitorData.isWatering);

  renderizarMonitor(currentMonitorData);
}

function marcarRiegoEnMonitor(deviceId, activo) {
  if (!currentMonitorPlant || currentMonitorPlant.device_id !== deviceId) return;

  if (currentMonitorData?.state) {
    currentMonitorData.state.isWatering = activo;
    currentMonitorData.isWatering = activo;
    actualizarBotonRiego(
      currentMonitorData.state,
      currentMonitorData.garden_plant?.plant_type_id?.ideal || null,
      deviceId,
      deviceSnapshot[deviceId]?.status || currentMonitorData.device_status || 'offline'
    );
  }
}

function actualizarEstadoMonitorDesdeDispositivos() {
  if (!currentMonitorPlant) return;

  const device = deviceSnapshot[currentMonitorPlant.device_id];
  if (!device) {
    actualizarEstadoConexionMonitor(
      currentMonitorData?.device_status || (currentMonitorPlant?.device_id ? 'offline' : 'unassigned'),
      currentMonitorPlant?.device_id || null
    );
    return;
  }

  if (currentMonitorData?.state) {
    currentMonitorData.state.isWatering = Boolean(currentMonitorData.isWatering);
  }

  currentMonitorData.device_status = device.status;
  actualizarEstadoConexionMonitor(device.status, currentMonitorPlant.device_id);

  // Se actualiza el botón de riego inmediatamente tras recuperar la conexión
  actualizarBotonRiego(
    currentMonitorData.state,
    currentMonitorData.garden_plant?.plant_type_id?.ideal || null,
    currentMonitorPlant.device_id,
    device.status
  );
}

function manejarDispositivosPendientes() {
  // Ignorar explícitamente cualquier ID que empiece por 'archived_'
  const pendientes = Object.values(deviceSnapshot)
    .filter((device) => device.status === 'pending' && !device.device_id.startsWith('archived_') && !sessionStorage.getItem(`ignored_device_${device.device_id}`))
    .sort((a, b) => (a.last_seen || 0) - (b.last_seen || 0));

  if (pendientes.length === 0) {
    pendingDeviceId = null;
    pendingAssignmentShown = false;
    cerrarDialogoAsignacion();
    return;
  }

  if (pendingAssignmentShown && pendingDeviceId && pendientes.some((device) => device.device_id === pendingDeviceId)) {
    renderizarListaDeAsignacion(pendingDeviceId);
    return;
  }

  pendingDeviceId = pendientes[0].device_id;
  pendingAssignmentShown = true;
  abrirDialogoAsignacion(pendingDeviceId);
}

function abrirDialogoAsignacion(deviceId) {
  let dialogo = document.getElementById('assignPlantDialog');
  if (!dialogo) {
    dialogo = crearDialogoAsignacion();
  }

  const titulo = dialogo.querySelector('[data-role="assign-title"]');
  if (titulo) titulo.textContent = `Asignar planta a ${deviceId}`;
  renderizarListaDeAsignacion(deviceId);
  if (dialogo.showModal && !dialogo.open) dialogo.showModal();
}

function renderizarListaDeAsignacion(deviceId) {
  const dialogo = document.getElementById('assignPlantDialog');
  if (!dialogo) return;
  
  const lista = dialogo.querySelector('[data-role="assign-list"]');
  if (!lista) return;
  
  lista.replaceChildren();

  // NUEVO: Mostrar plantas sin módulo O plantas con historial archivado
  const plantasDisponibles = gardenCache.filter(planta => !planta.device_id || planta.device_id.startsWith('archived_'));

  if (plantasDisponibles.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'Agrega plantas a tu jardín para asignarlas al módulo.';
    lista.appendChild(empty);
    
    const abrirCatalogo = document.createElement('a');
    abrirCatalogo.className = 'dialog-action dialog-action-primary';
    abrirCatalogo.href = 'addplant.html';
    abrirCatalogo.textContent = 'Agregar plantas';
    lista.appendChild(abrirCatalogo);
  } else {
    plantasDisponibles.forEach((planta) => {
      const isArchived = planta.device_id && planta.device_id.startsWith('archived_');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'dialog-action dialog-action-primary';
      
      // Añadir un indicador visual en el botón si la planta tiene historial rescatable
      button.textContent = isArchived 
        ? `${obtenerNombreDePlanta(planta)} (Retomar historial)` 
        : obtenerNombreDePlanta(planta);
        
      button.addEventListener('click', () => asignarPlantaADevice(deviceId, planta._id));
      lista.appendChild(button);
    });
  }
}

function crearDialogoAsignacion() {
  const dialogo = document.createElement('dialog');
  dialogo.id = 'assignPlantDialog';
  dialogo.className = 'plant-actions-dialog';

  const panel = document.createElement('div');
  panel.className = 'plant-actions-panel';

  const cerrar = document.createElement('button');
  cerrar.className = 'dialog-close';
  cerrar.type = 'button';
  cerrar.textContent = '×';
  cerrar.addEventListener('click', () => cerrarDialogoAsignacion());

  const eyebrow = document.createElement('p');
  eyebrow.className = 'section-eyebrow';
  eyebrow.textContent = 'Módulo pendiente';

  const titulo = document.createElement('h2');
  titulo.setAttribute('data-role', 'assign-title');

  const lista = document.createElement('div');
  lista.setAttribute('data-role', 'assign-list');
  lista.className = 'plant-actions-buttons';

  panel.append(cerrar, eyebrow, titulo, lista);
  dialogo.appendChild(panel);
  dialogo.addEventListener('close', () => {
    pendingAssignmentShown = false;
  });
  document.body.appendChild(dialogo);
  return dialogo;
}

function cerrarDialogoAsignacion() {
  const dialogo = document.getElementById('assignPlantDialog');
  if (dialogo?.open) dialogo.close();
}

async function asignarPlantaADevice(deviceId, gardenPlantId) {
  try {
    enviarComandoWS('ASSIGN_PLANT', {
      device_id: deviceId,
      garden_plant_id: gardenPlantId
    });

    gardenCache = gardenCache.map((planta) => (
      planta._id === gardenPlantId
        ? { ...planta, device_id: deviceId }
        : planta
    ));
    sincronizarJardinConDispositivos();
    renderizarJardinDesdeCache();
    actualizarContadoresDelCatalogo();

    cerrarDialogoAsignacion();
    pendingAssignmentShown = false;
    pendingDeviceId = null;

    if (currentMonitorPlant && currentMonitorPlant._id === gardenPlantId) {
      currentMonitorPlant = { ...currentMonitorPlant, device_id: deviceId };
    }
  } catch (error) {
    console.error('Error al asignar planta:', error);
  }
}

function actualizarEstadoConexionMonitor(status, deviceId) {
  const livePill = document.querySelector('.live-pill');
  if (!livePill) return;

  livePill.dataset.status = status || 'unassigned';
  livePill.innerHTML = `<span class="live-pill-dot"></span>${obtenerEtiquetaEstado(status, deviceId)}`;

  const sensorDots = document.querySelectorAll('.sensor-live-dot');
  sensorDots.forEach(dot => {
    dot.dataset.status = status || 'unassigned';
  });
}

function obtenerEtiquetaEstado(status, deviceId) {
  if (!deviceId) return 'Sin módulo';
  if (status === 'offline') return 'Offline';
  if (status === 'pending') return 'Pendiente';
  return 'En vivo';
}

function mostrarMonitorNoEncontrado(mensaje) {
  document.getElementById('monitorPlantOverview')?.setAttribute('hidden', '');
  document.getElementById('monitorContent')?.setAttribute('hidden', '');
  const noEncontrada = document.getElementById('monitorNotFound');
  if (noEncontrada) noEncontrada.hidden = false;
  const subtitle = document.getElementById('monitorHeaderSubtitle');
  if (subtitle) subtitle.textContent = mensaje;
}

function pushHistory(history, value) {
  const next = Array.isArray(history) ? history.slice() : [];
  next.push(typeof value === 'string' ? value : (Number.isFinite(value) ? value : 0));
  return next;
}

function limitar(valor, minimo, maximo) {
  return Math.max(minimo, Math.min(maximo, valor));
}

function mostrarToast(mensaje) {
  let toast = document.querySelector('.soilsense-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'soilsense-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }

  toast.textContent = mensaje;
  toast.classList.add('visible');
  window.clearTimeout(mostrarToast.temporizador);
  mostrarToast.temporizador = window.setTimeout(() => toast.classList.remove('visible'), 2400);
}

function iniciarRefrescoDelMonitor() {
  if (monitorRefreshTimer) return;

  monitorRefreshTimer = window.setInterval(() => {
    refrescarMonitorActivo(false).catch((error) => {
      console.error('Error al refrescar monitor:', error);
    });
  }, 10000);
}

async function refrescarMonitorActivo(forceToast) {
  const instanceId = currentMonitorPlant?._id || new URLSearchParams(window.location.search).get('plant');
  if (!instanceId) return;

  try {
    const response = await apiFetch(`/api/monitor/${encodeURIComponent(instanceId)}?window=${encodeURIComponent(monitorWindowKey)}`);
    const isWatering = currentMonitorData?.isWatering ?? false;
    currentMonitorData = {
      ...response,
      isWatering
    };
    currentMonitorPlant = response.garden_plant || currentMonitorPlant;
    renderizarMonitor(currentMonitorData);
  } catch (error) {
    if (forceToast) {
      mostrarToast('No se pudo actualizar la ventana de tiempo.');
    }
  }
}

function renderizarTablaRiego(events) {
  const tbody = document.getElementById('wateringHistoryBody');
  if (!tbody) return;

  // Si no hay eventos, ahora significa que NUNCA se ha regado la planta, porque el backend
  // siempre manda el último evento histórico disponible.
  if (!Array.isArray(events) || events.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="watering-empty">Aún no hay registros de riego.</td></tr>';
    return;
  }

  tbody.innerHTML = events.map(event => {
    const date = new Date(event.timestamp);
    const dateStr = date.toLocaleString('es-ES', { 
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
    });
    
    const isManual = event.triggered_by === 'manual';
    const typeClass = isManual ? 'watering-type-manual' : 'watering-type-auto';
    const typeText = isManual ? 'Manual' : 'Automático';
    
    // Si todavía no hay duración porque no ha terminado, mostramos "En curso..."
    const durationText = event.duration_sec ? `${event.duration_sec}s` : 'En curso...';
    
    // NUEVO: Indicador visual si el evento es traído de fuera de la ventana de tiempo seleccionada
    const outOfWindowNote = event.is_out_of_window 
      ? '<br><span style="font-size: 0.75em; color: var(--muted);">(Último registro histórico)</span>' 
      : '';

    return `
      <tr>
        <td>${dateStr}${outOfWindowNote}</td>
        <td class="${typeClass}">${typeText}</td>
        <td>${durationText}</td>
      </tr>
    `;
  }).join('');
}