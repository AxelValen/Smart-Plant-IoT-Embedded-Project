const SP_TOKEN_KEY = 'sp_token';

let ws = null;
let gardenCache = [];
let deviceSnapshot = {};
let pendingDeviceId = null;
let pendingAssignmentShown = false;
let currentMonitorPlant = null;
let currentMonitorData = null;
let tooltipMetricKey = null;
let tooltipListenersBound = false;

window.logout = logout;

document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem(SP_TOKEN_KEY);
  if (!token) {
    window.location.href = 'login.html';
    return;
  }

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
    renderizarJardinDesdeCache();
    actualizarContadoresDelCatalogo();
    manejarDispositivosPendientes();
    actualizarEstadoMonitorDesdeDispositivos();

    const pendientes = Object.values(deviceSnapshot).filter((device) => device.status === 'pending');
    if (pendientes.length > 0) {
      mostrarToast(`Módulo detectado: ${pendientes[0].device_id}. Asigna una planta.`);
    }

    return;
  }

  if (data.type === 'sensor_data') {
    actualizarMonitorEnVivo(data);
    return;
  }

  if (data.type === 'watering_started') {
    marcarRiegoEnMonitor(data.device_id, true);
    return;
  }

  if (data.type === 'watering_stopped') {
    marcarRiegoEnMonitor(data.device_id, false);
    return;
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

        const opacidad = indice === tarjetaActiva
          ? 1
          : Math.max(0.08, 1 - distancia * 0.46);

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
    let activa = Number.isNaN(inicioSolicitado)
      ? 0
      : normalizarIndice(inicioSolicitado, tarjetas.length);

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
        plant_type: tarjeta.dataset.plantType?.trim() || '',
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

function inicializarJardinVirtual() {
  const grid = document.getElementById('gardenGrid');
  if (!grid) return;

  const dialogo = document.getElementById('plantActionsDialog');
  const eliminar = document.getElementById('deletePlantAction');

  eliminar?.addEventListener('click', async () => {
    if (!currentMonitorPlant) return;
    try {
      await apiFetch(`/api/garden/${currentMonitorPlant._id}`, { method: 'DELETE' });
      currentMonitorPlant = null;
      await cargarJardin();
      renderizarJardinDesdeCache();
      if (dialogo?.open) dialogo.close();
      mostrarToast('Planta eliminada.');
    } catch (error) {
      console.error('Error al eliminar planta:', error);
      mostrarToast('No se pudo eliminar la planta.');
    }
  });

  dialogo?.addEventListener('close', () => {
    currentMonitorPlant = null;
  });

  cargarJardin();
}

async function cargarJardin() {
  try {
    const response = await apiFetch('/api/garden');
    gardenCache = response.garden || [];
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

    const estado = document.createElement('span');
    estado.className = 'garden-plant-hint';
    estado.textContent = planta.device_id ? `Asignada a ${planta.device_id}` : 'Sin dispositivo asignado';

    info.append(tipo, nombre, estado);
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

  currentMonitorPlant = planta;
  if (nombre) nombre.textContent = obtenerNombreDePlanta(planta);
  if (tipo) tipo.textContent = planta.plant_type_id?.display_name || planta.plant_type_id?.name || '';
  if (monitor) monitor.href = `monitor.html?plant=${encodeURIComponent(planta._id)}&window=24h`;
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

  await cargarMonitorDesdeAPIPlaceholder(instanceId);
}

async function cargarMonitorDesdeAPIPlaceholder(instanceId) {
  const planta = gardenCache.find((item) => item._id === instanceId);
  if (planta) {
    await cargarMonitorDesdeAPI(planta, new URLSearchParams(window.location.search).get('window') || '1h');
    return;
  }

  try {
    const response = await apiFetch(`/api/monitor/${encodeURIComponent(instanceId)}?window=${encodeURIComponent(new URLSearchParams(window.location.search).get('window') || '1h')}`);
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
  const telemetry = data.telemetry || crearTelemetriaVacia(12);

  document.getElementById('monitorPlantOverview')?.removeAttribute('hidden');
  document.getElementById('monitorContent')?.removeAttribute('hidden');
  document.getElementById('monitorNotFound')?.setAttribute('hidden', '');
  document.getElementById('monitorHeaderTitle').textContent = obtenerNombreDePlanta(gardenPlant);
  document.getElementById('monitorHeaderSubtitle').textContent = gardenPlant?.device_id
    ? `Datos exclusivos del módulo asignado a ${obtenerNombreDePlanta(gardenPlant)}.`
    : 'La planta todavía no tiene un dispositivo asignado.';
  document.getElementById('monitorPlantName').textContent = obtenerNombreDePlanta(gardenPlant);
  document.getElementById('monitorPlantType').textContent = plantType.display_name || plantType.name || 'Tipo de planta';
  document.getElementById('monitorPlantInstance').textContent = `ID: ${abreviarInstanceId(gardenPlant?._id)}`;

  const modelo = document.getElementById('monitorPlantModel');
  if (modelo) {
    modelo.src = gardenPlant?.model_src || '';
    modelo.alt = `Modelo 3D de ${obtenerNombreDePlanta(gardenPlant)}`;
  }

  const state = convertirTelemetriaAEstado(telemetry, plantType.ideal);
  currentMonitorData = {
    ...data,
    telemetry,
    state
  };

  renderizarTodosLosSensores(state);
  inicializarTooltipDeSensores(state);
  renderizarRecomendaciones(plantType.ideal);
  actualizarBotonRiego(state, plantType.ideal, gardenPlant?.device_id);

  if (gardenPlant?.device_id) {
    currentMonitorPlant.device_id = gardenPlant.device_id;
  }
}

function crearTelemetriaVacia(sampleCount = 12) {
  return {
    humidity: Array(sampleCount).fill(0),
    temperature: Array(sampleCount).fill(0),
    nitrogeno: Array(sampleCount).fill(0),
    fosforo: Array(sampleCount).fill(0),
    potasio: Array(sampleCount).fill(0)
  };
}

function convertirTelemetriaAEstado(telemetry, ideal) {
  const humedad = ultimoValor(telemetry.humidity);
  const temperature = ultimoValor(telemetry.temperature);
  const nitrogeno = ultimoValor(telemetry.nitrogeno);
  const fosforo = ultimoValor(telemetry.fosforo);
  const potasio = ultimoValor(telemetry.potasio);

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

function inicializarTooltipDeSensores(state) {
  const tooltip = document.getElementById('histTooltip');
  if (!tooltip) return;

  if (tooltipListenersBound) return;
  tooltipListenersBound = true;

  document.querySelectorAll('[data-metric]').forEach((elemento) => {
    const key = elemento.dataset.metric;
    elemento.addEventListener('mouseenter', () => abrirTooltip(key, elemento, state));
    elemento.addEventListener('mouseleave', cerrarTooltip);
    elemento.addEventListener('click', (evento) => {
      evento.stopPropagation();
      if (tooltipMetricKey === key) cerrarTooltip();
      else abrirTooltip(key, elemento, state);
    });
  });

  document.addEventListener('click', (evento) => {
    if (!evento.target.closest('[data-metric]') && !evento.target.closest('.hist-tooltip')) cerrarTooltip();
  });
}

function abrirTooltip(key, elemento, state) {
  const metrica = state.metrics[key];
  const tooltip = document.getElementById('histTooltip');
  if (!metrica || !tooltip) return;

  tooltipMetricKey = key;
  document.getElementById('histTitle').textContent = `Histórico · ${metrica.label}`;
  document.getElementById('histNow').textContent = `${Math.round(metrica.value)}${metrica.unit}`;
  document.getElementById('histSvg').innerHTML = construirSparkline(metrica.history, metrica.color);

  const rect = elemento.getBoundingClientRect();
  const width = tooltip.offsetWidth || 260;
  const height = tooltip.offsetHeight || 150;
  let left = rect.left + rect.width / 2 - width / 2;
  left = limitar(left, 10, window.innerWidth - width - 10);
  let top = rect.top - height - 14;
  if (top < 10) top = rect.bottom + 14;

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  tooltip.classList.add('visible');
}

function actualizarTooltipAbierto(state) {
  if (!tooltipMetricKey) return;
  const elemento = document.querySelector(`[data-metric="${tooltipMetricKey}"]`);
  if (elemento) abrirTooltip(tooltipMetricKey, elemento, state);
}

function cerrarTooltip() {
  tooltipMetricKey = null;
  document.getElementById('histTooltip')?.classList.remove('visible');
}

function construirSparkline(history, color) {
  const width = 260;
  const height = 90;
  const pad = 10;
  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = max - min || 1;
  const step = (width - pad * 2) / (history.length - 1);

  const puntos = history.map((valor, indice) => {
    const x = pad + indice * step;
    const y = pad + (1 - (valor - min) / range) * (height - pad * 2);
    return [x, y];
  });

  const line = puntos.map((punto) => punto.join(',')).join(' ');
  const area = `${pad},${height - pad} ${line} ${width - pad},${height - pad}`;
  const ultimo = puntos[puntos.length - 1];

  return `
    <polygon points="${area}" fill="${color}" opacity="0.15"></polygon>
    <polyline points="${line}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></polyline>
    <circle cx="${ultimo[0]}" cy="${ultimo[1]}" r="4" fill="${color}" stroke="#ffffff" stroke-width="1.5"></circle>
  `;
}

function renderizarRecomendaciones(ideal) {
  const contenedor = document.getElementById('recommendationsSpace');
  if (!contenedor) return;

  if (!ideal) {
    contenedor.textContent = 'No hay umbrales disponibles para esta planta.';
    return;
  }

  contenedor.innerHTML = `
    <p>Humedad óptima: ${ideal.humidity.min}% - ${ideal.humidity.max}%</p>
    <p>Temperatura óptima: ${ideal.temperature.min}°C - ${ideal.temperature.max}°C</p>
    <p>Nitrógeno: ${ideal.nitrogeno.min} - ${ideal.nitrogeno.max}</p>
    <p>Fósforo: ${ideal.fosforo.min} - ${ideal.fosforo.max}</p>
    <p>Potasio: ${ideal.potasio.min} - ${ideal.potasio.max}</p>
  `;
}

function actualizarBotonRiego(state, ideal, deviceId) {
  const boton = document.getElementById('wateringButton');
  if (!boton) return;

  const humedadMinima = ideal?.humidity?.min ?? 0;
  const puedeActivar = Boolean(deviceId) && !state.isWatering && state.latestHumidity < humedadMinima;

  boton.disabled = !state.isWatering && !puedeActivar;
  boton.textContent = state.isWatering ? '💧 Detener riego' : '💧 Activar riego';
  boton.dataset.deviceId = deviceId || '';
  boton.dataset.humidityMin = String(humedadMinima);
}

function manejarClickRiego() {
  const boton = document.getElementById('wateringButton');
  if (!boton || !currentMonitorData) return;

  const deviceId = boton.dataset.deviceId;
  const ideal = currentMonitorData.garden_plant?.plant_type_id?.ideal || null;
  const state = currentMonitorData.state || {};

  if (!deviceId) {
    console.error('La planta no tiene dispositivo asignado');
    return;
  }

  if (state.isWatering) {
    enviarComandoWS('LED_OFF', { device_id: deviceId });
    state.isWatering = false;
    actualizarBotonRiego(state, ideal, deviceId);
    return;
  }

  const humedadMinima = ideal?.humidity?.min ?? 0;
  if (state.latestHumidity >= humedadMinima) {
    console.error('La humedad actual todavía no está por debajo del umbral óptimo');
    return;
  }

  enviarComandoWS('LED_ON', { device_id: deviceId });
  state.isWatering = true;
  actualizarBotonRiego(state, ideal, deviceId);
}

function actualizarMonitorEnVivo(data) {
  if (!currentMonitorPlant || data.device_id !== currentMonitorPlant.device_id) return;

  const telemetry = currentMonitorData?.telemetry || crearTelemetriaVacia(12);
  telemetry.humidity = pushHistory(telemetry.humidity, data.humidity);
  telemetry.temperature = pushHistory(telemetry.temperature, data.temperature);
  telemetry.nitrogeno = pushHistory(telemetry.nitrogeno, data.nitrogeno);
  telemetry.fosforo = pushHistory(telemetry.fosforo, data.fosforo);
  telemetry.potasio = pushHistory(telemetry.potasio, data.potasio);

  currentMonitorData.telemetry = telemetry;
  currentMonitorData.state = convertirTelemetriaAEstado(telemetry, currentMonitorData.garden_plant?.plant_type_id?.ideal || null);
  currentMonitorData.state.isWatering = currentMonitorData.state.isWatering || false;

  renderizarMonitor(currentMonitorData);
}

function marcarRiegoEnMonitor(deviceId, activo) {
  if (!currentMonitorPlant || currentMonitorPlant.device_id !== deviceId) return;

  if (currentMonitorData?.state) {
    currentMonitorData.state.isWatering = activo;
    actualizarBotonRiego(currentMonitorData.state, currentMonitorData.garden_plant?.plant_type_id?.ideal || null, deviceId);
  }
}

function actualizarEstadoMonitorDesdeDispositivos() {
  if (!currentMonitorPlant) return;

  const device = deviceSnapshot[currentMonitorPlant.device_id];
  if (!device) return;

  if (currentMonitorData?.state) {
    currentMonitorData.state.isWatering = Boolean(device.status === 'online' && device.lastReading && device.lastReading.humidity < (currentMonitorData.garden_plant?.plant_type_id?.ideal?.humidity?.min || 0));
  }
}

function manejarDispositivosPendientes() {
  const pendientes = Object.values(deviceSnapshot).filter((device) => device.status === 'pending');
  if (pendientes.length === 0) {
    pendingDeviceId = null;
    pendingAssignmentShown = false;
    cerrarDialogoAsignacion();
    return;
  }

  if (pendingAssignmentShown && pendingDeviceId && pendientes.some((device) => device.device_id === pendingDeviceId)) {
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
  const lista = dialogo.querySelector('[data-role="assign-list"]');
  if (titulo) titulo.textContent = `Asignar planta a ${deviceId}`;
  if (lista) {
    lista.replaceChildren();

    if (gardenCache.length === 0) {
      const empty = document.createElement('p');
      empty.textContent = 'No tienes plantas en el jardín para asignar.';
      lista.appendChild(empty);
    } else {
      gardenCache.forEach((planta) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'dialog-action dialog-action-primary';
        button.textContent = obtenerNombreDePlanta(planta);
        button.addEventListener('click', () => asignarPlantaADevice(deviceId, planta._id));
        lista.appendChild(button);
      });
    }
  }

  if (dialogo.showModal && !dialogo.open) dialogo.showModal();
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

    cerrarDialogoAsignacion();
    pendingAssignmentShown = false;
    pendingDeviceId = null;
    await cargarJardin();
  } catch (error) {
    console.error('Error al asignar planta:', error);
  }
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
  next.push(Number.isFinite(value) ? value : 0);
  while (next.length > 12) next.shift();
  return next;
}

function abreviarInstanceId(instanceId) {
  if (!instanceId) return 'SIN-ID';
  return instanceId.length > 22 ? `${instanceId.slice(0, 10)}…${instanceId.slice(-8)}` : instanceId;
}

function limitar(valor, minimo, maximo) {
  return Math.max(minimo, Math.min(maximo, valor));
}

function normalizarTexto(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
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
