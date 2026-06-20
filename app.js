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
  });

  // Cerrar modales haciendo click fuera de la tarjeta
  window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
      closeModal(e.target);
    }
  });

  // Manejo de submits de los formularios
  document.getElementById('signup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    alert('¡Gracias por tu solicitud! Revisaremos tus datos y te añadiremos al mapa de la comunidad a la brevedad.');
    closeModal(signupModal);
    e.target.reset();
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
