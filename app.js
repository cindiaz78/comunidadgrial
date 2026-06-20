import { membersData, activitiesData } from './data.js';

// Función para formatear el tipo de miembro a clase CSS
function slugify(text) {
  return text.toLowerCase()
             .normalize("NFD")
             .replace(/[\u0300-\u036f]/g, "")
             .replace(/[^a-z0-9]/g, "-")
             .replace(/-+/g, "-")
             .trim()
             .replace(/^-+|-+$/g, "");
}

// Variables globales de estado
let map;
let markersGroup;
const markersMap = new Map(); // Para asociar ID de miembro con su marcador Leaflet
let activePopup = null;

// Estado temporal para el formulario de alta (Darse de Alta)
let signupProfessions = [];
let signupTherapies = [];
let signupElements = [];
let signupDones = [];
let signupClaris = [];
let currentSignupStep = 1;

// Inicialización al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  populateFilterOptions();
  renderMembers();
  initCalendar();
  initModals();
  
  // Renderizar iconos de Lucide cargados inicialmente
  lucide.createIcons();
});

// 1. Inicialización del Mapa Leaflet
function initMap() {
  // Crear el mapa centrado inicialmente en una posición media (Suramérica y conexión a España)
  map = L.map('map', {
    zoomControl: false, // Desactivamos por defecto para colocar controles personalizados
    minZoom: 2,
    maxZoom: 18
  }).setView([-15, -45], 3);

  // Cargar capa de mapa CartoDB Positron (estilo gris claro ultra limpio y estético)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(map);

  // Agregar grupo para los marcadores
  markersGroup = L.featureGroup().addTo(map);

  // Configurar botones de control de mapa personalizados (esquina inferior derecha)
  setupMapControls();

  // Escuchar cuando se abre un popup para renderizar los iconos de Lucide dinámicos
  map.on('popupopen', (e) => {
    lucide.createIcons();
    
    // Asignar evento al botón "Ver más detalle" dentro del popup
    const popupNode = e.popup.getElement();
    const detailBtn = popupNode.querySelector('.card-btn-detail');
    if (detailBtn) {
      detailBtn.addEventListener('click', () => {
        const id = parseInt(detailBtn.getAttribute('data-id'));
        openDetailModal(id);
      });
    }

    // Asignar evento al botón cerrar del popup
    const closeBtn = popupNode.querySelector('.card-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        map.closePopup();
      });
    }
  });
}

// Controles personalizados del mapa (zoom, re-centrado)
function setupMapControls() {
  const mapContainer = document.querySelector('.map-view');
  
  const controlsDiv = document.createElement('div');
  controlsDiv.className = 'custom-map-controls-right';
  
  controlsDiv.innerHTML = `
    <div class="map-zoom-controls">
      <button class="map-control-btn" id="map-zoom-in" title="Acercar"><i data-lucide="plus"></i></button>
      <button class="map-control-btn" id="map-zoom-out" title="Alejar"><i data-lucide="minus"></i></button>
    </div>
    <button class="map-control-btn" id="map-recenter" title="Ajustar Vista"><i data-lucide="globe"></i></button>
  `;
  
  mapContainer.appendChild(controlsDiv);

  // Asignar funcionalidad
  document.getElementById('map-zoom-in').addEventListener('click', () => map.zoomIn());
  document.getElementById('map-zoom-out').addEventListener('click', () => map.zoomOut());
  document.getElementById('map-recenter').addEventListener('click', fitMapBounds);
}

// Ajustar los límites del mapa para mostrar todos los marcadores activos
function fitMapBounds() {
  if (markersGroup.getLayers().length > 0) {
    map.fitBounds(markersGroup.getBounds(), { padding: [50, 50], maxZoom: 10 });
  }
}

// 2. Poblar opciones de los filtros desplegables dinámicamente
function populateFilterOptions() {
  const types = new Set();
  const professions = new Set();
  const therapies = new Set();

  membersData.forEach(member => {
    if (member.type) types.add(member.type);
    if (member.profession) professions.add(member.profession);
    if (member.terapias) member.terapias.forEach(t => therapies.add(t));
  });

  // Ordenar y añadir al select correspondiente
  setupSelectOptions('filter-type', Array.from(types).sort());
  setupSelectOptions('filter-profession', Array.from(professions).sort());
  setupSelectOptions('filter-therapy', Array.from(therapies).sort());

  // Agregar escuchadores de eventos para los filtros
  document.getElementById('search-input').addEventListener('input', filterMembers);
  document.getElementById('filter-type').addEventListener('change', filterMembers);
  document.getElementById('filter-profession').addEventListener('change', filterMembers);
  document.getElementById('filter-therapy').addEventListener('change', filterMembers);
  
  // Agregar listener para resetear filtros (cesto de basura)
  document.getElementById('btn-reset-filters').addEventListener('click', resetFilters);
}

function resetFilters() {
  document.getElementById('search-input').value = '';
  document.getElementById('filter-type').value = '';
  document.getElementById('filter-profession').value = '';
  document.getElementById('filter-therapy').value = '';
  filterMembers();
}

function setupSelectOptions(elementId, items) {
  const select = document.getElementById(elementId);
  items.forEach(item => {
    if (item !== "Ninguno") {
      const option = document.createElement('option');
      option.value = item;
      option.textContent = item;
      select.appendChild(option);
    }
  });
}

// 3. Renderizar todos los miembros como marcadores personalizados
function renderMembers() {
  membersData.forEach(member => {
    // Generar HTML personalizado para el marcador
    const slugType = slugify(member.type);
    const markerHtml = `
      <div class="custom-marker marker-${slugType}" data-id="${member.id}">
        <div class="marker-inner">
          <div class="marker-star"></div>
        </div>
      </div>
    `;

    const customIcon = L.divIcon({
      html: markerHtml,
      className: 'custom-div-icon',
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });

    const marker = L.marker([member.location.lat, member.location.lng], { icon: customIcon });

    // Armar HTML de la tarjeta popup exactamente como en la imagen
    const popupHtml = `
      <div class="member-card-popup">
        <button class="card-close-btn" title="Cerrar">
          <i data-lucide="x"></i>
        </button>
        <div class="card-profile-section">
          <img src="${member.photo}" alt="${member.name}" class="card-avatar">
          <div class="card-info">
            <h4 class="card-name">${member.name}</h4>
            <div class="card-location">
              <i data-lucide="map-pin"></i>
              <span>${member.location.city}, ${member.location.country}</span>
            </div>
            <div class="card-profession">
              <span class="card-profession-icon-bg"><i data-lucide="briefcase"></i></span>
              <span>${member.profession}</span>
            </div>
          </div>
        </div>
        <div class="card-divider"></div>
        <div class="card-therapies-title">
          <i data-lucide="sparkles"></i>
          <span>Terapias</span>
        </div>
        <div class="card-tags-container">
          ${member.terapias.map(t => `<span class="card-tag">${t}</span>`).join('')}
        </div>
        <div class="card-actions">
          <button class="card-btn-detail" data-id="${member.id}">
            <i data-lucide="user"></i> Ver más detalle
          </button>
          ${member.instagram ? `
          <a href="https://instagram.com/${member.instagram}" target="_blank" class="card-btn-instagram" title="Instagram">
            <i data-lucide="instagram"></i>
          </a>
          ` : ''}
          <a href="https://wa.me/${member.phone}?text=Hola%20${encodeURIComponent(member.name)},%20te%20contacto%20desde%20el%20Portal%20Comunidad%20del%20Grial." target="_blank" class="card-btn-whatsapp" title="WhatsApp">
            <i data-lucide="message-circle"></i>
          </a>
        </div>
      </div>
    `;

    marker.bindPopup(popupHtml, {
      closeButton: false,
      offset: L.point(0, -10),
      className: 'custom-leaflet-popup'
    });

    // Soporte para Hover / Mouseover en desktop
    marker.on('mouseover', function (e) {
      this.openPopup();
    });

    markersGroup.addLayer(marker);
    markersMap.set(member.id, marker);
  });

  // Intentar centrar en la ubicación del usuario por defecto
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        map.setView([latitude, longitude], 7);
      },
      (error) => {
        console.warn("Geolocalización rechazada/error. Ajustando a los marcadores.");
        fitMapBounds();
      },
      { timeout: 5000 }
    );
  } else {
    fitMapBounds();
  }
  updateCounters(membersData.length);
}

// 4. Lógica de Filtrado de Miembros en Tiempo Real
function filterMembers() {
  const searchQuery = document.getElementById('search-input').value.toLowerCase().trim();
  const selectedType = document.getElementById('filter-type').value;
  const selectedProfession = document.getElementById('filter-profession').value;
  const selectedTherapy = document.getElementById('filter-therapy').value;

  let activeCount = 0;

  membersData.forEach(member => {
    const marker = markersMap.get(member.id);
    
    // Condición de búsqueda textual (nombre, ciudad, país, profesión, terapias o tags)
    const matchesSearch = searchQuery === "" || 
      member.name.toLowerCase().includes(searchQuery) ||
      member.location.city.toLowerCase().includes(searchQuery) ||
      member.location.country.toLowerCase().includes(searchQuery) ||
      member.profession.toLowerCase().includes(searchQuery) ||
      member.terapias.some(t => t.toLowerCase().includes(searchQuery)) ||
      (member.aparatologia && member.aparatologia.some(a => a.toLowerCase().includes(searchQuery))) ||
      (member.elementos && member.elementos.some(e => e.toLowerCase().includes(searchQuery)));

    // Condiciones de los selects
    const matchesType = selectedType === "" || member.type === selectedType;
    const matchesProfession = selectedProfession === "" || member.profession === selectedProfession;
    const matchesTherapy = selectedTherapy === "" || member.terapias.includes(selectedTherapy);

    if (matchesSearch && matchesType && matchesProfession && matchesTherapy) {
      // Mostrar en el mapa
      if (!markersGroup.hasLayer(marker)) {
        markersGroup.addLayer(marker);
      }
      activeCount++;
    } else {
      // Ocultar del mapa
      if (markersGroup.hasLayer(marker)) {
        markersGroup.removeLayer(marker);
      }
    }
  });

  updateCounters(activeCount);
}

function updateCounters(activeCount) {
  // Actualizar contador en la barra de filtros
  document.getElementById('filtered-count').textContent = activeCount;
  document.getElementById('total-count-label').textContent = membersData.length;
  
  // Actualizar stats del header
  document.getElementById('total-members-count').textContent = membersData.length;
  
  // Contar países únicos de los miembros actuales
  const countries = new Set(membersData.map(m => m.location.country));
  document.getElementById('total-countries-count').textContent = countries.size;
}

// 5. Inicialización del Calendario y Tabla de Actividades
function initCalendar() {
  // Cargar países únicos de actividades en el filtro de la tabla
  const countries = new Set();
  activitiesData.forEach(act => countries.add(act.country));
  
  const selectCountry = document.getElementById('filter-activity-country');
  Array.from(countries).sort().forEach(country => {
    const option = document.createElement('option');
    option.value = country;
    option.textContent = country;
    selectCountry.appendChild(option);
  });

  // Escuchar cambios en el filtro de país del calendario
  selectCountry.addEventListener('change', renderActivities);

  // Renderizar la tabla inicialmente
  renderActivities();
}

function renderActivities() {
  const selectedCountry = document.getElementById('filter-activity-country').value;
  const tbody = document.getElementById('activities-table-body');
  tbody.innerHTML = '';

  const filteredActivities = activitiesData.filter(act => {
    return selectedCountry === "" || act.country === selectedCountry;
  });

  if (filteredActivities.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-gray);">No hay actividades próximas programadas para este país.</td></tr>`;
    return;
  }

  filteredActivities.forEach(act => {
    const tr = document.createElement('tr');
    
    // Tag de tipo de actividad
    const tagClass = `activity-tag activity-tag-${act.type.toLowerCase()}`;
    
    tr.innerHTML = `
      <td class="cell-date">
        <i data-lucide="calendar"></i>
        <span>${act.date}</span>
      </td>
      <td class="cell-activity">
        <div class="activity-title-wrapper">
          <span>${act.title}</span>
          <span class="${tagClass}">${act.type}</span>
        </div>
      </td>
      <td>${act.country}</td>
      <td>${act.city}</td>
      <td>
        <span class="cell-modality">
          <i data-lucide="${act.modality === 'Online' ? 'globe' : act.modality === 'Híbrida' ? 'refresh-cw' : 'map-pin'}"></i>
          <span>${act.modality}</span>
        </span>
      </td>
      <td class="table-actions">
        <button class="btn btn-table-detail" data-id="${act.id}">Más Detalle</button>
        <button class="btn btn-table-register" data-title="${act.title}">Inscribirme</button>
      </td>
    `;
    
    tbody.appendChild(tr);
  });

  // Re-inicializar iconos en la tabla
  lucide.createIcons();

  // Asignar eventos de acciones de la tabla
  tbody.querySelectorAll('.btn-table-detail').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.getAttribute('data-id'));
      openActivityDetailModal(id);
    });
  });

  tbody.querySelectorAll('.btn-table-register').forEach(btn => {
    btn.addEventListener('click', () => {
      const title = btn.getAttribute('data-title');
      openRegisterModal(title);
    });
  });
}
// Configuración de profesiones por categoría
const professionsByCategory = {
  "Medicina, Psicología, Nutrición, Kinesiología, Enfermería, Odontología": [
    "Medicina", "Psicología", "Nutrición", "Kinesiología", "Enfermería", "Odontología", "Cosmética", "Estética"
  ],
  "Educación, Docencia y Pedagogía": [
    "Profesorados", "Maestros", "Psicopedagogía", "Capacitadores", "Coaching Educativo"
  ],
  "Ciencias Sociales, Humanas y Jurídicas": [
    "Abogacía", "Trabajo Social", "Sociología", "Antropología", "Filosofía", "Historia"
  ],
  "Tecnología, Sistemas y Datos": [
    "Programación", "Ingeniería de Software", "Analistas de Datos", "Ciberseguridad"
  ],
  "Diseño, Arte y Expresión Creativa": [
    "Diseño Gráfico/Web", "Artes Visuales", "Música", "Teatro", "Fotografía", "Danza"
  ],
  "Comunicación, Marketing y Medios": [
    "Periodismo", "Relaciones Públicas", "Community Management", "Copywriting", "Locución"
  ],
  "Administración, Finanzas y Legal": [
    "Contador Público", "Administración", "Recursos Humanos", "Logística", "Consultoría"
  ],
  "Ciencias Exactas, Naturales e Ingeniería": [
    "Arquitectura", "Ingeniería Civil/Industrial", "Biología", "Ciencias Ambientales", "Química"
  ],
  "Oficios Técnicos, Manuales y Artesanales": [
    "Carpintería", "Electricidad", "Gastronomía", "Costura/Diseño textil"
  ],
  "Oficios Verdes, Agro y Tierra": [
    "Permacultura", "Agronomía", "Paisajismo", "Jardinería", "Cuidado de Animales", "Veterinaria"
  ]
};

// Helper para renderizar las etiquetas de profesiones en el formulario de alta
function renderSignupProfessions() {
  const container = document.getElementById('signup-professions-tags');
  if (!container) return;
  container.innerHTML = '';
  
  if (signupProfessions.length === 0) {
    container.innerHTML = `<span style="color: #718096; font-size: 0.8rem; font-style: italic;">Ninguna profesión añadida aún.</span>`;
    return;
  }
  
  signupProfessions.forEach((prof, index) => {
    const tag = document.createElement('span');
    tag.className = 'tag-dynamic tag-dynamic-type-profession';
    tag.innerHTML = `
      <span>${prof}</span>
      <button type="button" class="tag-dynamic-remove-btn" data-index="${index}" title="Eliminar">&times;</button>
    `;
    
    tag.querySelector('.tag-dynamic-remove-btn').addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.getAttribute('data-index'));
      signupProfessions.splice(idx, 1);
      renderSignupProfessions();
    });
    
    container.appendChild(tag);
  });
}

// Helper para renderizar las etiquetas de terapias y elementos en el formulario de alta
function renderSignupTherapiesElements() {
  const container = document.getElementById('signup-therapies-elements-tags');
  if (!container) return;
  container.innerHTML = '';
  
  if (signupTherapies.length === 0 && signupElements.length === 0) {
    container.innerHTML = `<span style="color: #718096; font-size: 0.8rem; font-style: italic;">Ninguna terapia o elemento añadido aún.</span>`;
    return;
  }
  
  // Renderizar Terapias (Verde)
  signupTherapies.forEach((therapy, index) => {
    const tag = document.createElement('span');
    tag.className = 'tag-dynamic tag-dynamic-type-therapy';
    tag.innerHTML = `
      <span>🌀 ${therapy}</span>
      <button type="button" class="tag-dynamic-remove-btn" data-index="${index}" title="Eliminar">&times;</button>
    `;
    
    tag.querySelector('.tag-dynamic-remove-btn').addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.getAttribute('data-index'));
      signupTherapies.splice(idx, 1);
      renderSignupTherapiesElements();
    });
    
    container.appendChild(tag);
  });
  
  // Renderizar Elementos (Celeste)
  signupElements.forEach((elem, index) => {
    const tag = document.createElement('span');
    tag.className = 'tag-dynamic tag-dynamic-type-element';
    tag.innerHTML = `
      <span>💎 ${elem}</span>
      <button type="button" class="tag-dynamic-remove-btn" data-index="${index}" title="Eliminar">&times;</button>
    `;
    
    tag.querySelector('.tag-dynamic-remove-btn').addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.getAttribute('data-index'));
      signupElements.splice(idx, 1);
      renderSignupTherapiesElements();
    });
    
    container.appendChild(tag);
  });
}

// Helper para renderizar las etiquetas de dones y claris en el formulario de alta
function renderSignupDonesClaris() {
  const container = document.getElementById('signup-dones-claris-tags');
  if (!container) return;
  container.innerHTML = '';
  
  if (signupDones.length === 0 && signupClaris.length === 0) {
    container.innerHTML = `<span style="color: #718096; font-size: 0.8rem; font-style: italic;">Ningún don o percepción añadida aún.</span>`;
    return;
  }
  
  // Renderizar Dones (Púrpura)
  signupDones.forEach((don, index) => {
    const tag = document.createElement('span');
    tag.className = 'tag-dynamic tag-dynamic-type-don';
    tag.innerHTML = `
      <span>🌟 ${don}</span>
      <button type="button" class="tag-dynamic-remove-btn" data-index="${index}" title="Eliminar">&times;</button>
    `;
    
    tag.querySelector('.tag-dynamic-remove-btn').addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.getAttribute('data-index'));
      signupDones.splice(idx, 1);
      renderSignupDonesClaris();
    });
    
    container.appendChild(tag);
  });

  // Renderizar Claris (Rosa)
  signupClaris.forEach((clari, index) => {
    const tag = document.createElement('span');
    tag.className = 'tag-dynamic tag-dynamic-type-clari';
    tag.innerHTML = `
      <span>👁️ ${clari}</span>
      <button type="button" class="tag-dynamic-remove-btn" data-index="${index}" title="Eliminar">&times;</button>
    `;
    
    tag.querySelector('.tag-dynamic-remove-btn').addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.getAttribute('data-index'));
      signupClaris.splice(idx, 1);
      renderSignupDonesClaris();
    });
    
    container.appendChild(tag);
  });
}

function addProfession(val) {
  const value = val.trim();
  if (value && !signupProfessions.includes(value)) {
    signupProfessions.push(value);
    renderSignupProfessions();
  }
}

function addTherapy(val) {
  const value = val.trim();
  if (value && !signupTherapies.includes(value)) {
    signupTherapies.push(value);
    renderSignupTherapiesElements();
  }
}

function addElement(val) {
  const value = val.trim();
  if (value && !signupElements.includes(value)) {
    signupElements.push(value);
    renderSignupTherapiesElements();
  }
}

function addDones(val) {
  const value = val.trim();
  if (value && !signupDones.includes(value)) {
    signupDones.push(value);
    renderSignupDonesClaris();
  }
}

function addClaris(val) {
  const value = val.trim();
  if (value && !signupClaris.includes(value)) {
    signupClaris.push(value);
    renderSignupDonesClaris();
  }
}

// Navegación de Viñetas (Wizard)
function showSignupStep(stepNum) {
  currentSignupStep = stepNum;
  
  // Ocultar todas las viñetas y mostrar la activa
  document.querySelectorAll('.signup-step').forEach(stepEl => {
    stepEl.classList.remove('active');
  });
  const activeStepEl = document.querySelector(`.signup-step[data-step="${stepNum}"]`);
  if (activeStepEl) {
    activeStepEl.classList.add('active');
  }

  // Actualizar indicadores de pasos
  document.querySelectorAll('.signup-step-header').forEach(headerEl => {
    const step = parseInt(headerEl.getAttribute('data-step'));
    headerEl.classList.remove('active', 'completed');
    if (step === stepNum) {
      headerEl.classList.add('active');
    } else if (step < stepNum) {
      headerEl.classList.add('completed');
    }
  });

  // Llevar el scroll del modal hacia arriba al cambiar de viñeta
  const modalOverlay = document.getElementById('signup-modal');
  if (modalOverlay) {
    modalOverlay.scrollTop = 0;
  }
}

function validateActiveStep(stepNum) {
  const activeStepEl = document.querySelector(`.signup-step[data-step="${stepNum}"]`);
  if (!activeStepEl) return true;
  
  // Validar inputs visibles obligatorios dentro de la sección actual
  const inputs = activeStepEl.querySelectorAll('input[required], select[required], textarea[required]');
  for (let input of inputs) {
    if (!input.checkValidity()) {
      input.reportValidity();
      return false;
    }
  }
  return true;
}

// 6. Lógica de Modales
function initModals() {
  const detailModal = document.getElementById('detail-modal');
  const signupModal = document.getElementById('signup-modal');
  const registerModal = document.getElementById('register-modal');

  // Asignar cierres
  document.getElementById('detail-modal-close').addEventListener('click', () => closeModal(detailModal));
  document.getElementById('signup-modal-close').addEventListener('click', () => closeModal(signupModal));
  document.getElementById('signup-cancel-btn').addEventListener('click', () => closeModal(signupModal));
  document.getElementById('register-modal-close').addEventListener('click', () => closeModal(registerModal));

  // Abrir Darse de Alta
  document.getElementById('btn-darse-alta').addEventListener('click', () => {
    signupModal.classList.add('active');
    
    // Inicializar listas vacías al abrir el modal y restaurar las vistas
    signupProfessions = [];
    signupTherapies = [];
    signupElements = [];
    signupDones = [];
    signupClaris = [];
    
    document.querySelector('.signup-steps-container').style.display = 'flex';
    document.getElementById('signup-form').style.display = 'flex';
    document.getElementById('signup-form').reset();
    document.getElementById('signup-modal-title').style.display = 'block';
    document.getElementById('signup-modal-subtitle').style.display = 'block';
    document.getElementById('signup-success-view').style.display = 'none';

    // Esconder selects dinámicos del Paso 2
    document.getElementById('lbl-profession-select').style.display = 'none';
    document.getElementById('signup-profession-select').style.display = 'none';
    document.getElementById('signup-profession-input').style.display = 'none';
    document.getElementById('btn-add-profession').style.display = 'none';

    // Esconder inputs dinámicos de Paso 3
    document.getElementById('signup-dones-input').style.display = 'none';
    document.getElementById('btn-add-dones').style.display = 'none';
    document.getElementById('signup-claris-input').style.display = 'none';
    document.getElementById('btn-add-claris').style.display = 'none';
    
    renderSignupProfessions();
    renderSignupTherapiesElements();
    renderSignupDonesClaris();
    showSignupStep(1);
  });

  // Cerrar modales haciendo click fuera de la tarjeta
  window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
      closeModal(e.target);
    }
  });

  // Manejo de botones de navegación (Siguiente y Anterior)
  document.querySelectorAll('.btn-next-step').forEach(btn => {
    btn.addEventListener('click', () => {
      const nextStep = parseInt(btn.getAttribute('data-next'));
      const currentStep = nextStep - 1;
      if (validateActiveStep(currentStep)) {
        showSignupStep(nextStep);
      }
    });
  });

  document.querySelectorAll('.btn-prev-step').forEach(btn => {
    btn.addEventListener('click', () => {
      const prevStep = parseInt(btn.getAttribute('data-prev'));
      showSignupStep(prevStep);
    });
  });

  // Lógica del Combo Categoría y combo Profesión (Paso 2)
  const categorySelect = document.getElementById('signup-profession-category');
  const professionSelect = document.getElementById('signup-profession-select');
  const lblProfessionSelect = document.getElementById('lbl-profession-select');
  const professionInput = document.getElementById('signup-profession-input');
  const btnAddProfession = document.getElementById('btn-add-profession');

  if (categorySelect) {
    categorySelect.addEventListener('change', () => {
      const category = categorySelect.value;
      if (!category) {
        lblProfessionSelect.style.display = 'none';
        professionSelect.style.display = 'none';
        professionInput.style.display = 'none';
        btnAddProfession.style.display = 'none';
        return;
      }

      if (category === 'Otra') {
        lblProfessionSelect.style.display = 'block';
        lblProfessionSelect.textContent = 'Escribir Profesión';
        professionSelect.style.display = 'none';
        professionInput.style.display = 'block';
        btnAddProfession.style.display = 'block';
      } else {
        lblProfessionSelect.style.display = 'block';
        lblProfessionSelect.textContent = 'Seleccionar Profesión';
        professionSelect.innerHTML = '<option value="">-- Seleccionar Profesión --</option>';
        const list = professionsByCategory[category] || [];
        list.forEach(prof => {
          const opt = document.createElement('option');
          opt.value = prof;
          opt.textContent = prof;
          professionSelect.appendChild(opt);
        });
        professionSelect.style.display = 'block';
        professionInput.style.display = 'none';
        btnAddProfession.style.display = 'block';
      }
    });
  }

  // Agregar profesion seleccionada/escrita
  if (professionSelect) {
    professionSelect.addEventListener('change', () => {
      if (professionSelect.value) {
        addProfession(professionSelect.value);
        professionSelect.value = '';
      }
    });
  }
  if (btnAddProfession && professionInput) {
    btnAddProfession.addEventListener('click', () => {
      addProfession(professionInput.value);
      professionInput.value = '';
    });
    professionInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addProfession(professionInput.value);
        professionInput.value = '';
      }
    });
  }

  // Configuración de los botones "Añadir" y select combos (Terapias y Elementos)
  const therapySelect = document.getElementById('signup-therapy-select');
  const therapyInput = document.getElementById('signup-therapy-input');
  const btnAddTherapy = document.getElementById('btn-add-therapy');

  if (therapySelect) {
    therapySelect.addEventListener('change', () => {
      if (therapySelect.value) {
        addTherapy(therapySelect.value);
        therapySelect.value = '';
      }
    });
  }
  if (btnAddTherapy && therapyInput) {
    btnAddTherapy.addEventListener('click', () => {
      addTherapy(therapyInput.value);
      therapyInput.value = '';
    });
    therapyInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addTherapy(therapyInput.value);
        therapyInput.value = '';
      }
    });
  }

  const elementSelect = document.getElementById('signup-element-select');
  const elementInput = document.getElementById('signup-element-input');
  const btnAddElement = document.getElementById('btn-add-element');

  if (elementSelect) {
    elementSelect.addEventListener('change', () => {
      if (elementSelect.value) {
        addElement(elementSelect.value);
        elementSelect.value = '';
      }
    });
  }
  if (btnAddElement && elementInput) {
    btnAddElement.addEventListener('click', () => {
      addElement(elementInput.value);
      elementInput.value = '';
    });
    elementInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addElement(elementInput.value);
        elementInput.value = '';
      }
    });
  }

  // Lógica de Dones y Claris (Paso 3)
  const donesSelect = document.getElementById('signup-dones-select');
  const donesInput = document.getElementById('signup-dones-input');
  const btnAddDones = document.getElementById('btn-add-dones');

  if (donesSelect) {
    donesSelect.addEventListener('change', () => {
      const val = donesSelect.value;
      if (val === 'Otro') {
        donesInput.style.display = 'block';
        btnAddDones.style.display = 'block';
      } else if (val) {
        addDones(val);
        donesSelect.value = '';
        donesInput.style.display = 'none';
        btnAddDones.style.display = 'none';
      }
    });
  }
  if (btnAddDones && donesInput) {
    btnAddDones.addEventListener('click', () => {
      addDones(donesInput.value);
      donesInput.value = '';
      donesSelect.value = '';
      donesInput.style.display = 'none';
      btnAddDones.style.display = 'none';
    });
    donesInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addDones(donesInput.value);
        donesInput.value = '';
        donesSelect.value = '';
        donesInput.style.display = 'none';
        btnAddDones.style.display = 'none';
      }
    });
  }

  const clarisSelect = document.getElementById('signup-claris-select');
  const clarisInput = document.getElementById('signup-claris-input');
  const btnAddClaris = document.getElementById('btn-add-claris');

  if (clarisSelect) {
    clarisSelect.addEventListener('change', () => {
      const val = clarisSelect.value;
      if (val === 'Otro') {
        clarisInput.style.display = 'block';
        btnAddClaris.style.display = 'block';
      } else if (val) {
        addClaris(val);
        clarisSelect.value = '';
        clarisInput.style.display = 'none';
        btnAddClaris.style.display = 'none';
      }
    });
  }
  if (btnAddClaris && clarisInput) {
    btnAddClaris.addEventListener('click', () => {
      addClaris(clarisInput.value);
      clarisInput.value = '';
      clarisSelect.value = '';
      clarisInput.style.display = 'none';
      btnAddClaris.style.display = 'none';
    });
    clarisInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addClaris(clarisInput.value);
        clarisInput.value = '';
        clarisSelect.value = '';
        clarisInput.style.display = 'none';
        btnAddClaris.style.display = 'none';
      }
    });
  }

  // Manejo de submits del formulario de alta (Paso 4)
  document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalBtnHtml = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Procesando ubicación...';

    const name = document.getElementById('signup-name').value;
    const lastname = document.getElementById('signup-lastname').value;
    const birthdate = document.getElementById('signup-birthdate').value;
    const birthcountry = document.getElementById('signup-birthcountry').value;
    const city = document.getElementById('signup-city').value;
    const country = document.getElementById('signup-country').value;
    const phone = document.getElementById('signup-phone').value;
    const email = document.getElementById('signup-email').value;
    const instagram = document.getElementById('signup-instagram').value;
    const photo = document.getElementById('signup-photo').value || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200&h=200';
    const about = document.getElementById('signup-about').value;

    // Buscar coordenadas mediante Nominatim API
    let lat = -15.0; 
    let lng = -45.0;
    try {
      const query = `${city}, ${country}`;
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`);
      const data = await response.json();
      if (data && data.length > 0) {
        lat = parseFloat(data[0].lat);
        lng = parseFloat(data[0].lon);
      }
    } catch (err) {
      console.error('Error al consultar Nominatim API:', err);
    }

    // Determinar tipo de miembro:
    let type = "Miembro Caminante / Consultante";
    if (signupTherapies.length > 0) {
      type = "Miembro Facilitador / Terapeuta";
    } else if (signupProfessions.length > 0) {
      type = "Miembro Colaborador / Profesional";
    }

    const dataReport = {
      name: `${name} ${lastname}`,
      birthdate,
      birthcountry,
      residence: `${city}, ${country}`,
      phone,
      email,
      instagram,
      photo,
      coordinates: { lat, lng },
      type,
      professions: signupProfessions,
      therapies: signupTherapies,
      elements: signupElements,
      dones: signupDones,
      claris: signupClaris,
      about
    };

    console.log('Solicitud de alta de miembro consolidada:', dataReport);

    // Restaurar estado del botón de envío
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalBtnHtml;

    // Ocultar formulario, título e indicador de pasos
    document.querySelector('.signup-steps-container').style.display = 'none';
    document.getElementById('signup-form').style.display = 'none';
    document.getElementById('signup-modal-title').style.display = 'none';
    document.getElementById('signup-modal-subtitle').style.display = 'none';

    // Mostrar vista de éxito
    document.getElementById('signup-success-view').style.display = 'block';

    // Configurar el botón "Cerrar" de la vista de éxito
    const successCloseBtn = document.getElementById('btn-signup-success-close');
    const newSuccessCloseBtn = successCloseBtn.cloneNode(true);
    successCloseBtn.parentNode.replaceChild(newSuccessCloseBtn, successCloseBtn);
    
    newSuccessCloseBtn.addEventListener('click', () => {
      closeModal(signupModal);
    });
  });

  document.getElementById('register-form').addEventListener('submit', (e) => {
    e.preventDefault();
    alert('¡Inscripción recibida correctamente! Nos pondremos en contacto contigo por WhatsApp o Email.');
    closeModal(registerModal);
    e.target.reset();
  });
}

function closeModal(modalElement) {
  modalElement.classList.remove('active');
}
// Abrir detalle extendido del miembro en modal
function openDetailModal(memberId) {
  const member = membersData.find(m => m.id === memberId);
  if (!member) return;

  const detailModal = document.getElementById('detail-modal');

  // Llenar datos
  document.getElementById('modal-member-photo').src = member.photo;
  document.getElementById('modal-member-photo').alt = member.name;
  document.getElementById('modal-member-name').textContent = member.name;
  document.getElementById('modal-member-location-text').textContent = `${member.location.city}, ${member.location.country}`;
  document.getElementById('modal-member-profession-text').textContent = member.profession;
  
  // Badge de tipo
  const slugType = slugify(member.type);
  const badge = document.getElementById('modal-member-type-badge');
  badge.textContent = member.type;
  badge.className = `member-type-badge badge-${slugType}`;

  // Sello Verificado
  const verifiedSeal = document.getElementById('modal-member-verified');
  if (member.verified) {
    verifiedSeal.style.display = 'inline-flex';
  } else {
    verifiedSeal.style.display = 'none';
  }

  // Terapias
  const therapiesContainer = document.getElementById('modal-therapies-tags');
  therapiesContainer.innerHTML = member.terapias.map(t => `<span class="tag-modal">${t}</span>`).join('');

  // Contador de avales / Sesiones brindadas
  const sessionsContainer = document.getElementById('modal-member-sessions');
  if (member.sessionsBrindadas !== undefined) {
    sessionsContainer.style.display = 'inline-flex';
    sessionsContainer.innerHTML = `🌀 <strong>${member.sessionsBrindadas} Sesiones</strong> brindadas a la comunidad`;
  } else {
    sessionsContainer.style.display = 'none';
  }

  // Aparatología
  const aparatologiaContainer = document.getElementById('modal-aparatologia-tags');
  aparatologiaContainer.innerHTML = member.aparatologia && member.aparatologia.length > 0
    ? member.aparatologia.map(a => `<span class="tag-modal">${a}</span>`).join('')
    : '<span class="tag-modal">Ninguno</span>';

  // Elementos
  const elementosContainer = document.getElementById('modal-elementos-tags');
  elementosContainer.innerHTML = member.elementos && member.elementos.length > 0
    ? member.elementos.map(el => `<span class="tag-modal">${el}</span>`).join('')
    : '<span class="tag-modal">Ninguno</span>';

  // Asistencia a Jornadas
  const jornadaContainer = document.getElementById('modal-member-jornada');
  if (member.jornada) {
    jornadaContainer.innerHTML = `📅 Participó en <strong>${member.jornada.title}</strong> (${member.jornada.date})`;
  } else {
    jornadaContainer.innerHTML = `<span style="color: var(--text-gray);">Sin registros de asistencia a jornadas recientes.</span>`;
  }

  // Enlace WhatsApp e Instagram
  const waBtn = document.getElementById('modal-whatsapp-btn');
  waBtn.href = `https://wa.me/${member.phone}?text=Hola%20${encodeURIComponent(member.name)},%20te%20contacto%20desde%20el%20Portal%20Comunidad%20del%20Grial.`;

  const igBtn = document.getElementById('modal-instagram-btn');
  if (member.instagram) {
    igBtn.style.display = 'inline-flex';
    igBtn.href = `https://instagram.com/${member.instagram}`;
  } else {
    igBtn.style.display = 'none';
  }

  // Activar modal e iconos
  detailModal.classList.add('active');
  lucide.createIcons();
}

// Abrir detalle extendido de la actividad en modal (reutilizando estructura de modal para info de evento)
function openActivityDetailModal(activityId) {
  const act = activitiesData.find(a => a.id === activityId);
  if (!act) return;

  // Mostramos una alerta estilizada o usamos el modal general. Creemos una alerta detallada para simplificar o reutilicemos el modal.
  // Es mejor usar un alert estilizado o popup informativo para la descripción del evento. 
  // Mostraremos un modal descriptivo sencillo usando un alert para mantener la simplicidad, o mejor, usemos un alert personalizado.
  // Vamos a usar un alert nativo estilizado o simplemente un alert por ahora, o podemos crear un modal. Crearemos un alert detallado:
  alert(`Detalle de Actividad: ${act.title}\n\nFecha: ${act.date}\nPaís: ${act.country}\nCiudad: ${act.city}\nModalidad: ${act.modality}\n\nDescripción:\n${act.details}`);
}

// Abrir formulario de inscripción a actividad
function openRegisterModal(activityTitle) {
  const registerModal = document.getElementById('register-modal');
  document.getElementById('register-activity-title').textContent = `Inscripción a: ${activityTitle}`;
  registerModal.classList.add('active');
}
