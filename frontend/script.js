/* =========================================================
   SOILSENSE — SCRIPT.JS ÚNICO
   Maneja el catálogo, las copias de plantas, el jardín y el monitor.
   ========================================================= */

const SP_TOKEN_KEY = "sp_token";

// ── Redirige a login.html si no hay sesión iniciada ──────────────
(function protegerPagina() {
  const token = localStorage.getItem(SP_TOKEN_KEY);
  if (!token) {
    window.location.href = "login.html";
  }
})();

// ── Extrae un identificador de usuario del JWT (sin verificar,
//    solo para namespacear los datos en localStorage) ────────────
function obtenerIdentificadorDeUsuario() {
  const token = localStorage.getItem(SP_TOKEN_KEY);
  if (!token) return "anon";
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.user_id || payload.email || "anon";
  } catch (error) {
    console.warn("No se pudo leer el token:", error);
    return "anon";
  }
}

// ── Cierra sesión: borra el token y regresa al login ─────────────
function logout() {
  localStorage.removeItem(SP_TOKEN_KEY);
  window.location.href = "login.html";
}

const SOILSENSE_STORAGE_KEY = `soilsensePlants:${obtenerIdentificadorDeUsuario()}`;
const SOILSENSE_SENSOR_PREFIX = `soilsenseSensor:${obtenerIdentificadorDeUsuario()}:`;

let selectedGardenInstanceId = null;
let monitorTimerId = null;

document.addEventListener("DOMContentLoaded", () => {
  inicializarCarruselPrincipal();
  inicializarCarruselesCatalogo();
  inicializarSeleccionDePlantas();
  actualizarContadoresDelCatalogo();
  inicializarJardinVirtual();
  inicializarMonitorDePlanta();
});

/* =========================================================
   1. CARRUSEL PRINCIPAL 3D
   ========================================================= */
function inicializarCarruselPrincipal() {
  document.querySelectorAll(".carousel").forEach((carrusel) => {
    const tarjetas = Array.from(carrusel.children).filter((elemento) =>
      elemento.classList.contains("card-container")
    );

    if (tarjetas.length === 0) return;

    const botonAnterior = carrusel.querySelector(".carousel-nav.left");
    const botonSiguiente = carrusel.querySelector(".carousel-nav.right");
    const maxVisibility = Number.parseInt(carrusel.dataset.maxVisibility || "3", 10);
    const inicioSolicitado = Number.parseInt(carrusel.dataset.start || "0", 10);

    let tarjetaActiva = Number.isNaN(inicioSolicitado)
      ? 0
      : limitar(inicioSolicitado, 0, tarjetas.length - 1);

    function actualizarCarrusel() {
      tarjetas.forEach((tarjeta, indice) => {
        const diferencia = tarjetaActiva - indice;
        const distancia = Math.abs(diferencia);

        tarjeta.style.setProperty("--active", indice === tarjetaActiva ? "1" : "0");
        tarjeta.style.setProperty("--offset", diferencia / 3);
        tarjeta.style.setProperty("--direction", Math.sign(diferencia));
        tarjeta.style.setProperty("--abs-offset", distancia / 3);
        tarjeta.style.pointerEvents = indice === tarjetaActiva ? "auto" : "none";

        const opacidad = indice === tarjetaActiva
          ? 1
          : Math.max(0.08, 1 - distancia * 0.46);

        tarjeta.style.opacity = distancia >= maxVisibility ? "0" : String(opacidad);
        tarjeta.style.display = distancia > maxVisibility ? "none" : "block";

        const modelo = tarjeta.querySelector("model-viewer");
        if (modelo) {
          if (indice === tarjetaActiva) modelo.setAttribute("auto-rotate", "");
          else modelo.removeAttribute("auto-rotate");
        }
      });

      if (botonAnterior) botonAnterior.disabled = tarjetaActiva === 0;
      if (botonSiguiente) botonSiguiente.disabled = tarjetaActiva === tarjetas.length - 1;
    }

    botonAnterior?.addEventListener("click", () => {
      if (tarjetaActiva > 0) {
        tarjetaActiva -= 1;
        actualizarCarrusel();
      }
    });

    botonSiguiente?.addEventListener("click", () => {
      if (tarjetaActiva < tarjetas.length - 1) {
        tarjetaActiva += 1;
        actualizarCarrusel();
      }
    });

    carrusel.addEventListener("keydown", (evento) => {
      if (evento.key === "ArrowLeft" && tarjetaActiva > 0) {
        evento.preventDefault();
        tarjetaActiva -= 1;
        actualizarCarrusel();
      }
      if (evento.key === "ArrowRight" && tarjetaActiva < tarjetas.length - 1) {
        evento.preventDefault();
        tarjetaActiva += 1;
        actualizarCarrusel();
      }
    });

    actualizarCarrusel();
  });
}

/* =========================================================
   2. CARRUSELES INFERIORES DEL CATÁLOGO
   ========================================================= */
function inicializarCarruselesCatalogo() {
  document.querySelectorAll(".catalog-carousel").forEach((carrusel) => {
    const tarjetas = Array.from(carrusel.querySelectorAll(".catalog-item"));
    if (tarjetas.length === 0) return;

    const botonAnterior = carrusel.querySelector(".catalog-arrow.left");
    const botonSiguiente = carrusel.querySelector(".catalog-arrow.right");
    const inicioSolicitado = Number.parseInt(carrusel.dataset.start || "0", 10);
    let activa = Number.isNaN(inicioSolicitado)
      ? 0
      : normalizarIndice(inicioSolicitado, tarjetas.length);

    function actualizar() {
      tarjetas.forEach((tarjeta, indice) => {
        const nivel = obtenerNivelCircular(indice, activa, tarjetas.length);
        const visible = Math.abs(nivel) <= 2;

        tarjeta.dataset.level = visible ? String(nivel) : "hidden";
        tarjeta.setAttribute("aria-hidden", visible ? "false" : "true");
        tarjeta.tabIndex = nivel === 0 ? 0 : -1;

        const modelo = tarjeta.querySelector("model-viewer");
        if (modelo) {
          if (nivel === 0) modelo.setAttribute("auto-rotate", "");
          else modelo.removeAttribute("auto-rotate");
        }
      });
    }

    function mover(direccion) {
      activa = normalizarIndice(activa + direccion, tarjetas.length);
      actualizar();
    }

    botonAnterior?.addEventListener("click", () => mover(-1));
    botonSiguiente?.addEventListener("click", () => mover(1));

    carrusel.addEventListener("keydown", (evento) => {
      if (evento.key === "ArrowLeft") {
        evento.preventDefault();
        mover(-1);
      }
      if (evento.key === "ArrowRight") {
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

/* =========================================================
   3. CATÁLOGO: CADA CLIC CREA UNA INSTANCIA NUEVA
   ========================================================= */
function inicializarSeleccionDePlantas() {
  document
    .querySelectorAll('[data-add-plant="true"][data-plant-id]')
    .forEach((tarjeta) => {
      tarjeta.addEventListener("click", () => añadirNuevaInstancia(tarjeta));
      tarjeta.addEventListener("keydown", (evento) => {
        if (evento.key === "Enter" || evento.key === " ") {
          evento.preventDefault();
          añadirNuevaInstancia(tarjeta);
        }
      });
    });
}

function añadirNuevaInstancia(tarjeta) {
  const plantId = tarjeta.dataset.plantId?.trim();
  const name = tarjeta.dataset.plantName?.trim();
  const model = tarjeta.dataset.model?.trim();

  if (!plantId || !name || !model) {
    console.error("La tarjeta necesita data-plant-id, data-plant-name y data-model.");
    mostrarToast("No se pudo añadir esta planta.");
    return;
  }

  const plantas = obtenerPlantasGuardadas();
  const nuevaPlanta = {
    instanceId: crearInstanceId(plantId),
    plantId,
    id: plantId,
    name,
    type: tarjeta.dataset.plantType?.trim() || "Planta",
    model,
    credit: tarjeta.dataset.credit?.trim() || "",
    createdAt: new Date().toISOString()
  };

  plantas.push(nuevaPlanta);
  guardarPlantas(plantas);

  const cantidad = plantas.filter((planta) => planta.plantId === plantId).length;
  actualizarEstadoDeEspecie(plantId, cantidad);
  mostrarToast(`${name} añadida. Ahora tienes ${cantidad} ${cantidad === 1 ? "copia" : "copias"}.`);
}

function actualizarContadoresDelCatalogo() {
  const conteos = contarPorEspecie(obtenerPlantasGuardadas());
  document
    .querySelectorAll('[data-add-plant="true"][data-plant-id]')
    .forEach((tarjeta) => {
      const cantidad = conteos.get(tarjeta.dataset.plantId) || 0;
      actualizarTarjetaDeCatalogo(tarjeta, cantidad);
    });
}

function actualizarEstadoDeEspecie(plantId, cantidad) {
  document
    .querySelectorAll('[data-add-plant="true"][data-plant-id]')
    .forEach((tarjeta) => {
      if (tarjeta.dataset.plantId === plantId) actualizarTarjetaDeCatalogo(tarjeta, cantidad);
    });
}

function actualizarTarjetaDeCatalogo(tarjeta, cantidad) {
  const estado = tarjeta.querySelector(".plant-status");
  tarjeta.classList.toggle("has-copies", cantidad > 0);
  if (estado) estado.textContent = cantidad > 0 ? `En jardín ×${cantidad} · añadir otra` : "Click para añadir";
}

function contarPorEspecie(plantas) {
  const conteos = new Map();
  plantas.forEach((planta) => {
    conteos.set(planta.plantId, (conteos.get(planta.plantId) || 0) + 1);
  });
  return conteos;
}

/* =========================================================
   4. VIRTUAL GARDEN: GRID DE MODELOS 3D
   ========================================================= */
function inicializarJardinVirtual() {
  const grid = document.getElementById("gardenGrid");
  if (!grid) return;

  renderizarJardinVirtual();

  const dialogo = document.getElementById("plantActionsDialog");
  const eliminar = document.getElementById("deletePlantAction");

  eliminar?.addEventListener("click", () => {
    if (!selectedGardenInstanceId) return;
    eliminarInstancia(selectedGardenInstanceId);
    if (dialogo?.open) dialogo.close();
  });

  dialogo?.addEventListener("close", () => {
    limpiarSeleccionDelJardin();
  });

  document.addEventListener("click", (evento) => {
    if (!evento.target.closest(".garden-plant-card") && !evento.target.closest(".plant-actions-dialog")) {
      limpiarSeleccionDelJardin();
    }
  });
}

function renderizarJardinVirtual() {
  const grid = document.getElementById("gardenGrid");
  const empty = document.getElementById("gardenEmpty");
  const count = document.getElementById("gardenCount");
  if (!grid) return;

  const plantas = obtenerPlantasGuardadas();
  const totales = contarPorEspecie(plantas);
  const vistos = new Map();

  grid.replaceChildren();
  if (empty) empty.hidden = plantas.length > 0;
  if (count) count.textContent = `${plantas.length} ${plantas.length === 1 ? "planta" : "plantas"}`;

  plantas.forEach((planta) => {
    const numero = (vistos.get(planta.plantId) || 0) + 1;
    vistos.set(planta.plantId, numero);
    const nombreVisible = totales.get(planta.plantId) > 1 ? `${planta.name} ${numero}` : planta.name;

    const tarjeta = document.createElement("article");
    tarjeta.className = "garden-plant-card";
    tarjeta.tabIndex = 0;
    tarjeta.dataset.instanceId = planta.instanceId;
    tarjeta.setAttribute("role", "button");
    tarjeta.setAttribute("aria-label", `${nombreVisible}. Haz clic para ver opciones.`);

    const modelo = document.createElement("model-viewer");
    modelo.src = planta.model;
    modelo.alt = `Modelo 3D de ${nombreVisible}`;
    modelo.setAttribute("auto-rotate", "");
    modelo.setAttribute("auto-rotate-delay", "0");
    modelo.setAttribute("rotation-per-second", "18deg");
    modelo.setAttribute("shadow-intensity", "1");
    modelo.setAttribute("interaction-prompt", "none");

    const info = document.createElement("div");
    info.className = "garden-plant-info";

    const tipo = document.createElement("span");
    tipo.className = "garden-plant-type";
    tipo.textContent = planta.type;

    const nombre = document.createElement("strong");
    nombre.textContent = nombreVisible;

    const hint = document.createElement("span");
    hint.className = "garden-plant-hint";
    hint.textContent = "Haz clic para seleccionar";

    info.append(tipo, nombre, hint);
    tarjeta.append(modelo, info);

    const activar = () => manejarClickDePlanta(tarjeta, planta, nombreVisible);
    tarjeta.addEventListener("click", activar);
    tarjeta.addEventListener("keydown", (evento) => {
      if (evento.key === "Enter" || evento.key === " ") {
        evento.preventDefault();
        activar();
      }
    });

    grid.appendChild(tarjeta);
  });
}

function manejarClickDePlanta(tarjeta, planta, nombreVisible) {
  limpiarSeleccionDelJardin();

  selectedGardenInstanceId = planta.instanceId;
  tarjeta.classList.add("is-selected");

  abrirDialogoDePlanta(planta, nombreVisible);
}

function abrirDialogoDePlanta(planta, nombreVisible) {
  const dialogo = document.getElementById("plantActionsDialog");
  const nombre = document.getElementById("actionPlantName");
  const tipo = document.getElementById("actionPlantType");
  const monitor = document.getElementById("viewMonitorAction");

  if (nombre) nombre.textContent = nombreVisible;
  if (tipo) tipo.textContent = planta.type;
  if (monitor) monitor.href = `monitor.html?plant=${encodeURIComponent(planta.instanceId)}`;

  if (dialogo?.showModal) dialogo.showModal();
}

function limpiarSeleccionDelJardin() {
  selectedGardenInstanceId = null;
  document.querySelectorAll(".garden-plant-card.is-selected").forEach((tarjeta) => {
    tarjeta.classList.remove("is-selected");
    const hint = tarjeta.querySelector(".garden-plant-hint");
    if (hint) hint.textContent = "Haz clic para seleccionar";
  });
}

function eliminarInstancia(instanceId) {
  const plantas = obtenerPlantasGuardadas();
  const eliminada = plantas.find((planta) => planta.instanceId === instanceId);
  const actualizadas = plantas.filter((planta) => planta.instanceId !== instanceId);

  guardarPlantas(actualizadas);
  localStorage.removeItem(`${SOILSENSE_SENSOR_PREFIX}${instanceId}`);
  selectedGardenInstanceId = null;
  renderizarJardinVirtual();
  actualizarContadoresDelCatalogo();
  mostrarToast(eliminada ? `${eliminada.name} fue eliminada.` : "Planta eliminada.");
}

/* =========================================================
   5. MONITOR INDEPENDIENTE PARA CADA INSTANCIA
   monitor.html?plant=INSTANCE_ID
   ========================================================= */
function inicializarMonitorDePlanta() {
  const monitorPage = document.getElementById("monitorPage");
  if (!monitorPage) return;

  const instanceId = new URLSearchParams(window.location.search).get("plant");
  const plantas = obtenerPlantasGuardadas();
  const planta = plantas.find((item) => item.instanceId === instanceId);

  if (!planta) {
    document.getElementById("monitorPlantOverview")?.setAttribute("hidden", "");
    document.getElementById("monitorContent")?.setAttribute("hidden", "");
    const noEncontrada = document.getElementById("monitorNotFound");
    if (noEncontrada) noEncontrada.hidden = false;
    document.getElementById("monitorHeaderSubtitle").textContent = "El enlace no corresponde a una planta activa.";
    return;
  }

  const nombreVisible = obtenerNombreVisibleDeInstancia(planta, plantas);
  document.title = `${nombreVisible} — Monitor SoilSense`;
  document.getElementById("monitorHeaderTitle").textContent = nombreVisible;
  document.getElementById("monitorHeaderSubtitle").textContent = `Datos exclusivos del módulo asignado a ${nombreVisible}.`;
  document.getElementById("monitorPlantName").textContent = nombreVisible;
  document.getElementById("monitorPlantType").textContent = planta.type;
  document.getElementById("monitorPlantInstance").textContent = `ID: ${abreviarInstanceId(planta.instanceId)}`;

  const modelo = document.getElementById("monitorPlantModel");
  if (modelo) {
    modelo.src = planta.model;
    modelo.alt = `Modelo 3D de ${nombreVisible}`;
  }

  const state = obtenerEstadoDeSensores(planta.instanceId);
  renderizarTodosLosSensores(state);
  inicializarTooltipDeSensores(state, planta.instanceId);

  monitorTimerId = window.setInterval(() => {
    actualizarLecturas(state);
    guardarEstadoDeSensores(planta.instanceId, state);
    renderizarTodosLosSensores(state);
    actualizarTooltipAbierto(state);
  }, 4000);
}

function obtenerNombreVisibleDeInstancia(planta, plantas) {
  const iguales = plantas.filter((item) => item.plantId === planta.plantId);
  if (iguales.length <= 1) return planta.name;
  const indice = iguales.findIndex((item) => item.instanceId === planta.instanceId);
  return `${planta.name} ${indice + 1}`;
}

function obtenerEstadoDeSensores(instanceId) {
  const key = `${SOILSENSE_SENSOR_PREFIX}${instanceId}`;
  try {
    const guardado = JSON.parse(localStorage.getItem(key));
    if (guardado?.metrics) return guardado;
  } catch (error) {
    console.warn("No se pudo recuperar el estado del sensor:", error);
  }

  const seed = hashTexto(instanceId);
  const estado = {
    metrics: {
      temp: crearMetrica(20 + (seed % 9), 8, 42, 3, "°C", "Temperatura", "#c0573a", seed + 1),
      humedad: crearMetrica(48 + (seed % 28), 25, 88, 6, "%", "Humedad / Nivel de agua", "#4a90d9", seed + 2),
      nitrogeno: crearMetrica(35 + (seed % 31), 15, 85, 7, "%", "Nitrógeno (N)", "#4a7c59", seed + 3),
      fosforo: crearMetrica(25 + (seed % 30), 10, 75, 7, "%", "Fósforo (P)", "#c79a35", seed + 4),
      potasio: crearMetrica(40 + (seed % 31), 20, 88, 7, "%", "Potasio (K)", "#7a63ad", seed + 5)
    },
    updatedAt: new Date().toISOString()
  };

  guardarEstadoDeSensores(instanceId, estado);
  return estado;
}

function crearMetrica(value, realMin, realMax, spread, unit, label, color, seed) {
  return {
    value,
    realMin,
    realMax,
    spread,
    unit,
    label,
    color,
    history: crearHistorial(value, spread, realMin, realMax, seed)
  };
}

function crearHistorial(value, spread, min, max, seed) {
  const history = [value];
  let actual = value;
  let numero = seed >>> 0;

  for (let i = 0; i < 11; i += 1) {
    numero = (numero * 1664525 + 1013904223) >>> 0;
    const aleatorio = numero / 4294967296;
    actual = limitar(actual + (aleatorio - 0.5) * spread * 1.4, min, max);
    history.unshift(actual);
  }
  return history;
}

function actualizarLecturas(state) {
  Object.values(state.metrics).forEach((metrica) => {
    metrica.value = limitar(
      metrica.value + (Math.random() - 0.5) * metrica.spread,
      metrica.realMin,
      metrica.realMax
    );
    metrica.history.push(metrica.value);
    if (metrica.history.length > 12) metrica.history.shift();
  });
  state.updatedAt = new Date().toISOString();
}

function guardarEstadoDeSensores(instanceId, state) {
  try {
    localStorage.setItem(`${SOILSENSE_SENSOR_PREFIX}${instanceId}`, JSON.stringify(state));
  } catch (error) {
    console.warn("No se pudo guardar el estado del sensor:", error);
  }
}

function renderizarTodosLosSensores(state) {
  Object.keys(state.metrics).forEach((key) => renderizarSensor(key, state.metrics[key]));
}

function renderizarSensor(key, metrica) {
  const porcentaje = limitar(metrica.value, 0, 100);

  if (key === "temp") {
    const fill = document.getElementById("thermoFill");
    const value = document.getElementById("tempValue");
    if (fill) fill.style.height = `${porcentaje}%`;
    if (value) value.textContent = `${Math.round(metrica.value)}°C`;
    return;
  }

  if (key === "humedad") {
    const fill = document.getElementById("tankFill");
    const value = document.getElementById("humValue");
    if (fill) fill.style.height = `${porcentaje}%`;
    if (value) value.textContent = `${Math.round(metrica.value)}%`;
    return;
  }

  const ids = {
    nitrogeno: ["nFill", "nValue"],
    fosforo: ["pFill", "pValue"],
    potasio: ["kFill", "kValue"]
  };
  const [fillId, valueId] = ids[key] || [];
  const fill = document.getElementById(fillId);
  const value = document.getElementById(valueId);
  if (fill) fill.style.height = `${porcentaje}%`;
  if (value) value.textContent = `${Math.round(metrica.value)}%`;
}

let tooltipMetricKey = null;
let tooltipState = null;

function inicializarTooltipDeSensores(state) {
  tooltipState = state;
  const tooltip = document.getElementById("histTooltip");
  if (!tooltip) return;

  document.querySelectorAll("[data-metric]").forEach((elemento) => {
    const key = elemento.dataset.metric;
    elemento.addEventListener("mouseenter", () => abrirTooltip(key, elemento, state));
    elemento.addEventListener("mouseleave", cerrarTooltip);
    elemento.addEventListener("click", (evento) => {
      evento.stopPropagation();
      if (tooltipMetricKey === key) cerrarTooltip();
      else abrirTooltip(key, elemento, state);
    });
  });

  document.addEventListener("click", (evento) => {
    if (!evento.target.closest("[data-metric]") && !evento.target.closest(".hist-tooltip")) cerrarTooltip();
  });
}

function abrirTooltip(key, elemento, state) {
  const metrica = state.metrics[key];
  const tooltip = document.getElementById("histTooltip");
  if (!metrica || !tooltip) return;

  tooltipMetricKey = key;
  document.getElementById("histTitle").textContent = `Histórico · ${metrica.label}`;
  document.getElementById("histNow").textContent = `${Math.round(metrica.value)}${metrica.unit}`;
  document.getElementById("histSvg").innerHTML = construirSparkline(metrica.history, metrica.color);

  const rect = elemento.getBoundingClientRect();
  const width = tooltip.offsetWidth || 260;
  const height = tooltip.offsetHeight || 150;
  let left = rect.left + rect.width / 2 - width / 2;
  left = limitar(left, 10, window.innerWidth - width - 10);
  let top = rect.top - height - 14;
  if (top < 10) top = rect.bottom + 14;

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  tooltip.classList.add("visible");
}

function actualizarTooltipAbierto(state) {
  if (!tooltipMetricKey) return;
  const elemento = document.querySelector(`[data-metric="${tooltipMetricKey}"]`);
  if (elemento) abrirTooltip(tooltipMetricKey, elemento, state);
}

function cerrarTooltip() {
  tooltipMetricKey = null;
  document.getElementById("histTooltip")?.classList.remove("visible");
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

  const line = puntos.map((punto) => punto.join(",")).join(" ");
  const area = `${pad},${height - pad} ${line} ${width - pad},${height - pad}`;
  const ultimo = puntos[puntos.length - 1];

  return `
    <polygon points="${area}" fill="${color}" opacity="0.15"></polygon>
    <polyline points="${line}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></polyline>
    <circle cx="${ultimo[0]}" cy="${ultimo[1]}" r="4" fill="${color}" stroke="#ffffff" stroke-width="1.5"></circle>
  `;
}

/* =========================================================
   6. ALMACENAMIENTO Y UTILIDADES
   ========================================================= */
function obtenerPlantasGuardadas() {
  let plantas = [];
  try {
    const datos = JSON.parse(localStorage.getItem(SOILSENSE_STORAGE_KEY));
    plantas = Array.isArray(datos) ? datos : [];
  } catch (error) {
    console.warn("No se pudieron leer las plantas guardadas:", error);
  }

  let huboMigracion = false;
  plantas = plantas.map((planta, indice) => {
    const plantId = String(planta.plantId || planta.id || slug(planta.name || "planta"));
    if (planta.instanceId) {
      return { ...planta, plantId, id: plantId };
    }

    huboMigracion = true;
    return {
      ...planta,
      plantId,
      id: plantId,
      instanceId: `${slug(plantId)}--legacy-${indice + 1}-${hashTexto(JSON.stringify(planta))}`,
      createdAt: planta.createdAt || new Date(0).toISOString()
    };
  });

  if (huboMigracion) guardarPlantas(plantas);
  return plantas;
}

function guardarPlantas(plantas) {
  try {
    localStorage.setItem(SOILSENSE_STORAGE_KEY, JSON.stringify(plantas));
  } catch (error) {
    console.error("No se pudieron guardar las plantas:", error);
  }
}

function crearInstanceId(plantId) {
  const random = Math.random().toString(36).slice(2, 8);
  return `${slug(plantId)}--${Date.now().toString(36)}-${random}`;
}

function slug(texto) {
  return String(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "planta";
}

function hashTexto(texto) {
  let hash = 2166136261;
  for (let i = 0; i < texto.length; i += 1) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function abreviarInstanceId(instanceId) {
  if (!instanceId) return "SIN-ID";
  return instanceId.length > 22 ? `${instanceId.slice(0, 10)}…${instanceId.slice(-8)}` : instanceId;
}

function limitar(valor, minimo, maximo) {
  return Math.max(minimo, Math.min(maximo, valor));
}

function mostrarToast(mensaje) {
  let toast = document.querySelector(".soilsense-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "soilsense-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
  }

  toast.textContent = mensaje;
  toast.classList.add("visible");
  window.clearTimeout(mostrarToast.temporizador);
  mostrarToast.temporizador = window.setTimeout(() => toast.classList.remove("visible"), 2400);
}