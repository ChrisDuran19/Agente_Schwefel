/**
 * Simulador de Interacción Agente-Ambiente
 * Script principal de la aplicación - Versión mejorada con soporte en tiempo real
 * 
 * @author Cristian David Duran
 * @version 3.1.0
 * @license MIT
 */

'use strict';

// Variables globales
let perceptionChart = null;
let historicalChart = null;
let perceptionHistory = [];
let actionHistory = [];
let statsChart = null;
let usersChart = null;
let notificationTimeout = null;
let liveUpdateEnabled = true; // Control para actualización en tiempo real
let debounceTimer = null;
let activeUsersPanel = null; // Panel de usuarios activos
let lastRecommendationId = 0; // Para rastrear la última recomendación recibida
let autoSaveTimer = null;
let autoSaveInterval = 2 * 60 * 60 * 1000; // 2 horas en milisegundos
let lastAutoSaveTime = null; 
let historicalDataStorage = []; // Almacenamiento para datos históricos
let notificationList = []; // Lista de notificaciones
let isInitialLoad = true; // Controla si es la carga inicial
let realtimeUpdatePanel = null; // Panel de actualización en tiempo real
let userId = 'usuario_' + Math.random().toString(36).substring(2, 8); // ID único para este usuario
let lastSyncTime = Date.now(); // Último tiempo de sincronización

// Asegurarse de que todo el DOM esté cargado antes de ejecutar el código
document.addEventListener('DOMContentLoaded', function() {

    // Referencias a elementos del DOM
    const sliders = {
        accion1: document.getElementById('accion1'),
        accion2: document.getElementById('accion2'),
        accion3: document.getElementById('accion3'),
        accion4: document.getElementById('accion4')
    };

    const sliderProgress = {
        progress1: document.getElementById('progress1'),
        progress2: document.getElementById('progress2'),
        progress3: document.getElementById('progress3'),
        progress4: document.getElementById('progress4')
    };

    const sliderValues = {
        accion1: document.getElementById('accion1Value'),
        accion2: document.getElementById('accion2Value'),
        accion3: document.getElementById('accion3Value'),
        accion4: document.getElementById('accion4Value')
    };

    const perceptionField = document.getElementById('perception');
    const perceptionBar = document.getElementById('perceptionBar');
    const recomendarButton = document.getElementById('enviar');
    const historyList = document.getElementById('history-list');
    const showStatsButton = document.getElementById('showStats');
    const closeStatsButton = document.getElementById('closeStats');
    const statisticsContainer = document.getElementById('statisticsContainer');
    const resetSystemButton = document.getElementById('resetSystem');
    const downloadDataButton = document.getElementById('downloadData');
    const fullscreenChartButton = document.getElementById('fullscreenChart');
    const clearHistoryButton = document.getElementById('clearHistory');
    const timeFrameSelect = document.getElementById('timeFrame');
    const emptyRecommendations = document.getElementById('emptyRecommendations');
    const recommendationFilter = document.getElementById('recommendationFilter');
    
    // Elementos de notificación
    const notificationButton = document.getElementById('notificationButton');
    const notificationPanel = document.getElementById('notificationPanel');
    const notificationListElement = document.getElementById('notificationList');
    const notificationCount = document.getElementById('notificationCount');
    const clearNotifications = document.getElementById('clearNotifications');
    const notificationTabs = document.querySelectorAll('.notification-tab');
    
    // Elementos del tutorial
    const tutorialOverlay = document.getElementById('tutorialOverlay');
    const tutorialMessage = document.getElementById('tutorialMessage');
    const nextBtn = document.getElementById('nextBtn');
    const prevBtn = document.getElementById('prevBtn');
    const skipBtn = document.getElementById('skipBtn');
    const tutorialProgressBar = document.getElementById('tutorialProgressBar');

    // Elementos del panel de usuarios
    const showUsersStats = document.getElementById('showUsersStats');
    const usersModal = document.getElementById('usersModal');
    const closeUsersModal = document.getElementById('closeUsersModal');
    const footerUsersCount = document.getElementById('footerUsersCount');
    const currentUsers = document.getElementById('currentUsers');
    const todayUsers = document.getElementById('todayUsers');
    const totalUsers = document.getElementById('totalUsers');
    const userActivity = document.getElementById('userActivity');

    // Inicializar la aplicación
    initializeApp();

    /**
     * Inicializa la aplicación
     */
    function initializeApp() {
        console.log('Inicializando aplicación...');
        initializePerceptionChart();
        initializeStatsChart();
        initializeUsersChart();
        initializeTheme();
        setupEventListeners();
        setupNotificationSystem();
        setupTutorial();
        setupSliderProgressBars();
        createActiveUsersPanel();
        setupSocketListeners();
        createRealtimeUpdatePanel();
        
        // Inicializar percepción con valores actuales
        updatePerception();
        
        // Cargar datos históricos
        fetchHistoryFromDB();
        
        // Iniciar autoguardado
        startAutoSave();
        
        // Mostrar notificación de bienvenida
        showNotification('success', '¡Bienvenido!', 'El simulador de Interacción Agente-Ambiente está listo para usar');
        
        // Control de visibilidad para recomendaciones vacías
        checkEmptyRecommendations();
        
        // Mostrar estado de conexión en tiempo real
        updateConnectionStatus(true);

        // Configurar actualización continua en tiempo real
        setupContinuousRealTimeUpdates();
        
        console.log('Aplicación inicializada correctamente');
    }

    /**
     * Configura actualizaciones continuas en tiempo real para los sliders
     * Esta función garantiza que cada movimiento de los sliders genere un nuevo punto en la gráfica
     */
    function setupContinuousRealTimeUpdates() {
        // Forzar actualizaciones en tiempo real
        liveUpdateEnabled = true;
        
        // Variable para controlar la frecuencia de actualizaciones
        let lastUpdateTime = 0;
        const updateInterval = 50; // Milisegundos entre actualizaciones
        
        // Agregar listeners directos a los sliders
        Object.keys(sliders).forEach(key => {
            const slider = sliders[key];
            
            // Usamos 'input' para capturar cada pequeño cambio mientras se arrastra
            slider.addEventListener('input', function() {
                const now = Date.now();
                
                // Limitar la frecuencia de actualizaciones para mejor rendimiento
                if (now - lastUpdateTime > updateInterval) {
                    lastUpdateTime = now;
                    
                    // En lugar de actualizar el punto en vivo, creamos un nuevo punto
                    const perception = calculatePerception();
                    const actions = {
                        accion1: parseFloat(sliders.accion1.value),
                        accion2: parseFloat(sliders.accion2.value),
                        accion3: parseFloat(sliders.accion3.value),
                        accion4: parseFloat(sliders.accion4.value)
                    };
                    
                    // Agregar nuevo punto al gráfico cada vez que se mueve el slider
                    addNewDataPoint(perception, actions);
                    
                    // Sincronizar con otros usuarios 
                    syncDataWithOtherUsers(perception, actions);
                }
            });
            
            // Cuando se suelta el slider, asegurarse de capturar el valor final
            slider.addEventListener('change', function() {
                const perception = calculatePerception();
                const actions = {
                    accion1: parseFloat(sliders.accion1.value),
                    accion2: parseFloat(sliders.accion2.value),
                    accion3: parseFloat(sliders.accion3.value),
                    accion4: parseFloat(sliders.accion4.value)
                };
                
                // Agregar punto final
                addNewDataPoint(perception, actions);
                
                // Sincronizar valor final
                syncDataWithOtherUsers(perception, actions);
                
                // Actualizar valores numéricos
                updateSliderValues();
            });
        });
        
        console.log('Listeners de actualización continua configurados');
    }
    
    /**
     * Actualiza los campos de valores de los sliders
     */
    function updateSliderValues() {
        Object.keys(sliders).forEach(key => {
            const slider = sliders[key];
            const valueInput = sliderValues[key];
            valueInput.value = parseFloat(slider.value);
        });
    }

    /**
     * Agrega un nuevo punto de datos al gráfico
     * @param {number} perception - Valor de percepción
     * @param {Object} actions - Valores de las acciones
     * @param {Object} [options] - Opciones adicionales
     * @param {string} [options.userId] - ID del usuario que generó el punto
     * @param {string} [options.timestamp] - Marca de tiempo del punto
     */
    function addNewDataPoint(perception, actions, options = {}) {
        if (!perceptionChart) return;
        
        // Valores por defecto
        const userId = options.userId || window.userId;
        const timestamp = options.timestamp || new Date().toISOString();
        
        // Crear copia para evitar referencias
        const actionsCopy = {
            accion1: Number(actions.accion1),
            accion2: Number(actions.accion2),
            accion3: Number(actions.accion3),
            accion4: Number(actions.accion4),
            userId: userId,
            timestamp: timestamp
        };
        
        // Agregar datos a los historiales
        perceptionHistory.push(perception);
        actionHistory.push(actionsCopy);
        
        // Agregar al gráfico como un nuevo punto
        const pointLabel = new Date(timestamp).toLocaleTimeString(); 
        perceptionChart.data.labels.push(pointLabel);
        perceptionChart.data.datasets[0].data.push(perception);
        
        // Limitar número de puntos visibles
        const maxVisiblePoints = 100; // Aumentamos para ver más puntos en la gráfica
        if (perceptionChart.data.labels.length > maxVisiblePoints) {
            perceptionChart.data.labels = perceptionChart.data.labels.slice(-maxVisiblePoints);
            perceptionChart.data.datasets[0].data = perceptionChart.data.datasets[0].data.slice(-maxVisiblePoints);
            // También recortamos los historiales
            perceptionHistory = perceptionHistory.slice(-maxVisiblePoints);
            actionHistory = actionHistory.slice(-maxVisiblePoints);
        }
        
        // Actualizar el gráfico con animación mínima para mejor rendimiento
        perceptionChart.options.animation.duration = 0; // Sin animación para actualizaciones frecuentes
        perceptionChart.update('none');
        
        // Actualizar barra de percepción
        updatePerceptionBar();
        
        // Guardar automáticamente en la base de datos cada cierto número de puntos (solo si es un punto local)
        if (!options.userId && perceptionHistory.length % 5 === 0) { // Cada 5 puntos
            saveCurrentStateToDatabase();
        }
    }

    /**
     * Sincroniza datos con otros usuarios conectados
     * @param {number} perception - Valor de percepción
     * @param {Object} actions - Valores de las acciones
     */
    function syncDataWithOtherUsers(perception, actions) {
        const now = Date.now();
        
        // Limitar la frecuencia de sincronización a máximo 5 por segundo
        if (now - lastSyncTime < 200) {
            return;
        }
        
        lastSyncTime = now;
        
        // Emitir evento para usuarios en línea si está configurado
        if (window.socket && window.socket.connected) {
            window.socket.emit('sliderMovement', {
                perception: perception,
                actions: actions,
                timestamp: new Date().toISOString(),
                userId: window.userId
            });
        }
    }

    /**
     * Guarda el estado actual en la base de datos
     */
    function saveCurrentStateToDatabase() {
        // Obtener último punto de datos
        const lastIndex = perceptionHistory.length - 1;
        if (lastIndex < 0) return;
        
        const perception = perceptionHistory[lastIndex];
        const actions = actionHistory[lastIndex];
        
        // Crear objeto de datos para enviar
        const data = {
            percepcion: Number(perception),
            accion1: Number(actions.accion1),
            accion2: Number(actions.accion2),
            accion3: Number(actions.accion3),
            accion4: Number(actions.accion4),
            timestamp: new Date().toISOString(),
            userId: window.userId,
            isAutoSaved: true // Indicar que es un guardado automático
        };
        
        // Enviar datos al servidor de forma silenciosa (sin notificaciones al usuario)
        fetch('/guardar-recomendacion', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        })
        .then(response => response.json())
        .then(result => {
            // Actualizar ID de recomendación para evitar duplicados
            if (result && result.id) {
                lastRecommendationId = Math.max(lastRecommendationId, result.id);
            }
        })
        .catch(error => {
            console.error('Error al guardar automáticamente:', error);
        });
    }

    /**
     * Maneja datos de movimiento de slider recibidos de otros usuarios
     * @param {Object} data - Datos recibidos
     */
    function handleRemoteSliderMovement(data) {
        if (!perceptionChart) return;
        
        // Extraer datos
        const perception = Number(data.perception);
        const actions = data.actions;
        
        // Validar datos
        if (isNaN(perception) || !actions) return;
        
        // Agregar al gráfico solo si proviene de otro usuario
        if (window.userId !== data.userId) {
            // Agregar como un nuevo punto con opciones de origen
            addNewDataPoint(perception, actions, {
                userId: data.userId,
                timestamp: data.timestamp
            });
            
            // Mostrar notificación discreta
            showMinimalNotification(`Usuario ${data.userId.substring(0, 8)} ha modificado los valores`);
        }
    }

    /**
     * Muestra una notificación mínima y temporal
     * @param {string} message - Mensaje a mostrar
     */
    function showMinimalNotification(message) {
        // Crear contenedor para la notificación si no existe
        let minimalContainer = document.getElementById('minimal-notifications');
        if (!minimalContainer) {
            minimalContainer = document.createElement('div');
            minimalContainer.id = 'minimal-notifications';
            minimalContainer.className = 'minimal-notifications-container';
            document.body.appendChild(minimalContainer);
        }
        
        // Crear notificación
        const notification = document.createElement('div');
        notification.className = 'minimal-notification';
        notification.textContent = message;
        
        minimalContainer.appendChild(notification);
        
        // Aplicar animación de entrada
        setTimeout(() => {
            notification.classList.add('active');
        }, 10);
        
        // Eliminar después de 2 segundos
        setTimeout(() => {
            notification.classList.remove('active');
            setTimeout(() => {
                notification.remove();
                
                // Eliminar contenedor si está vacío
                if (minimalContainer.children.length === 0) {
                    minimalContainer.remove();
                }
            }, 300);
        }, 2000);
    }
    /**
     * Configura las barras de progreso para los sliders
     */
    function setupSliderProgressBars() {
        Object.keys(sliders).forEach(key => {
            const slider = sliders[key];
            const progressKey = 'progress' + key.slice(-1);
            const progressBar = sliderProgress[progressKey];
            
            // Establecer posición inicial
            if (progressBar) {
                updateSliderProgress(slider, progressBar);
            }
        });
    }

    /**
     * Actualiza la barra de progreso del slider
     */
    function updateSliderProgress(slider, progressBar) {
        const min = parseFloat(slider.min) || -100;
        const max = parseFloat(slider.max) || 100;
        const value = parseFloat(slider.value) || 0;
        
        // Calcular porcentaje (considerando rangos negativos)
        const range = max - min;
        const normalizedValue = value - min;
        const percentage = (normalizedValue / range) * 100;
        
        // Actualizar la barra de progreso
        if (progressBar) {
            // Si el valor es negativo, colocar barra a la izquierda
            if (value < 0) {
                const absWidth = Math.abs(value) / Math.abs(min) * 50;
                progressBar.style.left = `${50 - absWidth}%`;
                progressBar.style.width = `${absWidth}%`;
            } 
            // Si el valor es positivo, colocar barra a la derecha
            else if (value > 0) {
                progressBar.style.left = '50%';
                progressBar.style.width = `${value / max * 50}%`;
            } 
            // Si el valor es cero, barra mínima en el centro
            else {
                progressBar.style.left = '49.5%';
                progressBar.style.width = '1%';
            }
        }
    }

    /**
     * Crea el panel de actualización en tiempo real
     */
    function createRealtimeUpdatePanel() {
        // Crear panel solo si no existe
        if (document.getElementById('realtimeUpdatePanel')) {
            realtimeUpdatePanel = document.getElementById('realtimeUpdatePanel');
            return;
        }
        
        realtimeUpdatePanel = document.createElement('div');
        realtimeUpdatePanel.id = 'realtimeUpdatePanel';
        realtimeUpdatePanel.className = 'realtime-update-panel';
        
        // Contenido del panel
        realtimeUpdatePanel.innerHTML = `
            <div class="realtime-update-header">
                <div class="realtime-update-title">
                    <i class="fas fa-sync-alt"></i>
                    <span>Datos en tiempo real</span>
                </div>
                <button class="close-button" id="closeRealtimePanel">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="realtime-update-stats">
                <span>Próximo guardado en: <span id="nextSaveTime">00:00:00</span></span>
            </div>
            <div class="realtime-update-progress">
                <div class="realtime-update-bar"></div>
            </div>
            <div class="autosave-message">
                <i class="fas fa-check-circle"></i>
                <span id="lastSaveTime">Guardado automático activado</span>
            </div>
        `;
        
        // Añadir al cuerpo del documento
        document.body.appendChild(realtimeUpdatePanel);
        
        // Configurar eventos
        document.getElementById('closeRealtimePanel').addEventListener('click', () => {
            realtimeUpdatePanel.classList.remove('active');
        });
        
        // Actualizar tiempo de autoguardado
        updateAutoSaveCountdown();
    }

    /**
     * Inicializa el gráfico de percepción
     */
    function initializePerceptionChart() {
        const ctx = document.getElementById('perceptionChart')?.getContext('2d');
        if (!ctx) {
            console.error('No se encontró el elemento canvas para el gráfico de percepción');
            return;
        }
        
        // Obtener colores del tema actual
        const primaryColor = getComputedStyle(document.body).getPropertyValue('--primary').trim();
        const borderColor = getComputedStyle(document.body).getPropertyValue('--border-color').trim();
        const textColor = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim();
        const bgCard = getComputedStyle(document.body).getPropertyValue('--card-bg').trim();
        const textPrimary = getComputedStyle(document.body).getPropertyValue('--text-primary').trim();
        
        perceptionChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Percepción',
                    data: [],
                    borderColor: primaryColor,
                    backgroundColor: `rgba(${hexToRgb(primaryColor)}, 0.1)`,
                    borderWidth: 2,
                    pointBackgroundColor: primaryColor,
                    pointRadius: 2,
                    pointHoverRadius: 6,
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { 
                        beginAtZero: true,
                        grid: {
                            color: borderColor
                        },
                        ticks: {
                            color: textColor
                        }
                    },
                    x: {
                        grid: {
                            color: borderColor
                        },
                        ticks: {
                            color: textColor,
                            maxRotation: 0,
                            autoSkip: true,
                            maxTicksLimit: 10
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: bgCard,
                        titleColor: textPrimary,
                        bodyColor: textColor,
                        borderColor: borderColor,
                        borderWidth: 1,
                        displayColors: false,
                        callbacks: {
                            title: function(context) {
                                return context[0].label;
                            },
                            label: function(context) {
                                return `Percepción: ${parseFloat(context.raw).toFixed(4)}`;
                            },
                            afterLabel: function(context) {
                                const actions = actionHistory[context.dataIndex];
                                if (actions) {
                                    return [
                                        `A1: ${actions.accion1.toFixed(2)}`,
                                        `A2: ${actions.accion2.toFixed(2)}`,
                                        `A3: ${actions.accion3.toFixed(2)}`,
                                        `A4: ${actions.accion4.toFixed(2)}`,
                                        `Usuario: ${actions.userId?.substring(0, 8) || 'Tú'}`
                                    ];
                                }
                                return '';
                            }
                        }
                    }
                },
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                animation: {
                    duration: 0,
                    easing: 'easeOutQuart'
                },
                onClick: function(e, elements) {
                    if (elements.length) {
                        const index = elements[0].index;
                        const actions = actionHistory[index];
                        const perception = perceptionChart.data.datasets[0].data[index];
                        
                        if (actions) {
                            // Actualizar sliders
                            sliders.accion1.value = actions.accion1;
                            sliders.accion2.value = actions.accion2;
                            sliders.accion3.value = actions.accion3;
                            sliders.accion4.value = actions.accion4;
                            
                            // Actualizar campos de valores
                            sliderValues.accion1.value = actions.accion1;
                            sliderValues.accion2.value = actions.accion2;
                            sliderValues.accion3.value = actions.accion3;
                            sliderValues.accion4.value = actions.accion4;
                            
                            // Actualizar percepción
                            perceptionField.value = parseFloat(perception).toFixed(10);
                            
                            // Actualizar barras de progreso
                            updateAllProgressBars();
                            
                            // Mostrar notificación
                            showNotification('info', 'Valores cargados', 'Se han cargado los valores del punto seleccionado');
                        }
                    }
                }
            }
        });
        
        console.log('Gráfico de percepción inicializado');
    }
    
    /**
     * Actualiza todas las barras de progreso
     */
    function updateAllProgressBars() {
        Object.keys(sliders).forEach(key => {
            const slider = sliders[key];
            const progressKey = 'progress' + key.slice(-1);
            const progressBar = sliderProgress[progressKey];
            
            if (progressBar) {
                updateSliderProgress(slider, progressBar);
            }
        });
        
        // Actualizar barra de percepción
        updatePerceptionBar();
    }
    
    /**
     * Actualiza la barra de percepción
     */
    function updatePerceptionBar() {
        if (perceptionBar) {
            const perception = parseFloat(perceptionField.value);
            perceptionBar.style.width = `${perception}%`;
        }
    }
    
    /**
     * Inicializa el gráfico de estadísticas
     */
    function initializeStatsChart() {
        const ctx = document.getElementById('statsChart')?.getContext('2d');
        if (!ctx) {
            console.warn('No se encontró el elemento canvas para el gráfico de estadísticas');
            return;
        }
        
        // Obtener colores para las barras
        const dangerColor = getComputedStyle(document.body).getPropertyValue('--danger').trim();
        const infoColor = getComputedStyle(document.body).getPropertyValue('--info').trim();
        const successColor = getComputedStyle(document.body).getPropertyValue('--success').trim();
        const borderColor = getComputedStyle(document.body).getPropertyValue('--border-color').trim();
        const textColor = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim();
        
        statsChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Mínima', 'Promedio', 'Máxima'],
                datasets: [{
                    label: 'Estadísticas de percepción',
                    data: [0, 0, 0],
                    backgroundColor: [
                        `rgba(${hexToRgb(dangerColor)}, 0.7)`,
                        `rgba(${hexToRgb(infoColor)}, 0.7)`,
                        `rgba(${hexToRgb(successColor)}, 0.7)`
                    ],
                    borderColor: [
                        dangerColor,
                        infoColor,
                        successColor
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { 
                        beginAtZero: true,
                        grid: {
                            color: borderColor
                        },
                        ticks: {
                            color: textColor
                        }
                    },
                    x: {
                        grid: {
                            color: borderColor
                        },
                        ticks: {
                            color: textColor
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                },
                animation: {
                    duration: 1000,
                    easing: 'easeOutQuart'
                }
            }
        });
        
        console.log('Gráfico de estadísticas inicializado');
    }
    
    /**
     * Inicializa el gráfico de usuarios
     */
    function initializeUsersChart() {
        const ctx = document.getElementById('usersChart')?.getContext('2d');
        if (!ctx) {
            console.warn('No se encontró el elemento canvas para el gráfico de usuarios');
            return;
        }
        
        // Obtener colores del tema
        const primaryColor = getComputedStyle(document.body).getPropertyValue('--primary').trim();
        const borderColor = getComputedStyle(document.body).getPropertyValue('--border-color').trim();
        const textColor = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim();
        
        usersChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [], // Se llenará con horas
                datasets: [{
                    label: 'Usuarios conectados',
                    data: [],
                    borderColor: primaryColor,
                    backgroundColor: `rgba(${hexToRgb(primaryColor)}, 0.1)`,
                    borderWidth: 2,
                    pointBackgroundColor: primaryColor,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { 
                        beginAtZero: true,
                        grid: {
                            color: borderColor
                        },
                        ticks: {
                            color: textColor,
                            stepSize: 1
                        }
                    },
                    x: {
                        grid: {
                            color: borderColor
                        },
                        ticks: {
                            color: textColor
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                },
                animation: {
                    duration: 1000,
                    easing: 'easeOutQuart'
                }
            }
        });
            
            // Inicializar con algunos datos
            updateUsersChart([]);
            
            console.log('Gráfico de usuarios inicializado');
        }
        
        /**
         * Actualiza el gráfico de usuarios con nuevos datos
         */
        function updateUsersChart(userHistory) {
            if (!usersChart) return;
            
            // Si no hay datos de historial, crear algunos puntos de ejemplo
            if (!userHistory || userHistory.length === 0) {
                const currentHour = new Date().getHours();
                const labels = [];
                const data = [];
                
                // Generar datos de las últimas 12 horas
                for (let i = 0; i < 12; i++) {
                    const hour = (currentHour - 11 + i + 24) % 24;
                    labels.push(`${hour}:00`);
                    // Datos aleatorios entre 1 y 10 para el ejemplo
                    data.push(Math.floor(Math.random() * 10) + 1);
                }
                
                usersChart.data.labels = labels;
                usersChart.data.datasets[0].data = data;
            } else {
                // Usar datos reales del historial
                usersChart.data.labels = userHistory.map(item => item.time);
                usersChart.data.datasets[0].data = userHistory.map(item => item.count);
            }
            
            usersChart.update();
        }
        
        /**
         * Configura listeners para eventos de Socket.io
         */
        function setupSocketListeners() {
            if (!window.socket) {
                console.warn('Socket.io no inicializado. Funcionalidad en tiempo real no disponible.');
                updateConnectionStatus(false);
                return;
            }
    
            // Escuchar movimientos de sliders de otros usuarios
            window.socket.on('sliderMovement', (data) => {
                handleRemoteSliderMovement(data);
            });
    
            // Escuchar recomendaciones nuevas
            window.socket.on('newRecommendation', (data) => {
                processNewRecommendation(data);
            });
    
            // Escuchar actualizaciones de usuarios activos
            window.socket.on('activeUsers', (users) => {
                updateActiveUsersList(users);
            });
    
            // Escuchar actividad de usuarios
            window.socket.on('userActivity', (activity) => {
                updateUserActivity(activity);
            });
    
            // Escuchar actualizaciones de estado general
            window.socket.on('stateUpdate', (update) => {
                if (update.type === 'recommendation') {
                    processNewRecommendation(update.data);
                } else if (update.type === 'sliderMovement') {
                    handleRemoteSliderMovement(update.data);
                }
            });
    
            // Escuchar contador de usuarios
            window.socket.on('userCount', (count) => {
                updateUserCount(count);
            });
    
            // Escuchar historial de usuarios
            window.socket.on('userHistory', (history) => {
                updateUsersChart(history);
            });
    
            // Cargar recomendaciones iniciales
            window.socket.on('initialRecommendations', (recommendations) => {
                loadInitialRecommendations(recommendations);
            });
    
            // Escuchar desconexiones
            window.socket.on('disconnect', () => {
                updateConnectionStatus(false);
                showNotification('warning', 'Desconexión', 'La conexión en tiempo real se ha perdido. Intentando reconectar...', 0);
            });
    
            // Escuchar reconexiones
            window.socket.on('connect', () => {
                updateConnectionStatus(true);
                showNotification('success', 'Conexión restablecida', 'La conexión en tiempo real ha sido restablecida.', 3000);
            });
    
            // Conectar y emitir presencia
            if (window.socket.connected) {
                window.socket.emit('userPresence', { userId: window.userId });
                // Solicitar historial de usuarios
                window.socket.emit('requestUserHistory');
            }
    
            console.log('Socket.io listeners configurados');
        }
        
        /**
         * Actualiza el estado de conexión en tiempo real
         */
        function updateConnectionStatus(isConnected) {
            const realTimeIndicator = document.querySelector('.real-time-indicator');
            if (realTimeIndicator) {
                if (isConnected) {
                    realTimeIndicator.classList.add('connected');
                    realTimeIndicator.classList.remove('disconnected');
                    realTimeIndicator.querySelector('span').textContent = 'Datos en tiempo real';
                } else {
                    realTimeIndicator.classList.add('disconnected');
                    realTimeIndicator.classList.remove('connected');
                    realTimeIndicator.querySelector('span').textContent = 'Conexión interrumpida';
                }
            }
        }
        
        /**
         * Configura el sistema de notificaciones
         */
        function setupNotificationSystem() {
            if (!notificationButton || !notificationPanel) return;
            
            // Mostrar/ocultar panel de notificaciones
            notificationButton.addEventListener('click', () => {
                notificationPanel.classList.toggle('hidden');
                
                // Marcar notificaciones como leídas cuando se abre el panel
                if (!notificationPanel.classList.contains('hidden')) {
                    markNotificationsAsRead();
                }
            });
            
            // Cerrar panel al hacer clic fuera
            document.addEventListener('click', (e) => {
                if (!notificationButton.contains(e.target) && 
                    !notificationPanel.contains(e.target) &&
                    !notificationPanel.classList.contains('hidden')) {
                    notificationPanel.classList.add('hidden');
                }
            });
            
            // Cambiar entre pestañas de notificaciones
            if (notificationTabs) {
                notificationTabs.forEach(tab => {
                    tab.addEventListener('click', () => {
                        // Quitar clase activa de todas las pestañas
                        notificationTabs.forEach(t => t.classList.remove('active'));
                        
                        // Añadir clase activa a la pestaña actual
                        tab.classList.add('active');
                        
                        // Filtrar notificaciones según la pestaña
                        const tabType = tab.getAttribute('data-tab');
                        filterNotificationsByType(tabType);
                    });
                });
            }
            
            // Limpiar todas las notificaciones
            if (clearNotifications) {
                clearNotifications.addEventListener('click', () => {
                    clearAllNotifications();
                });
            }
        }
        
        /**
         * Filtra las notificaciones por tipo
         */
        function filterNotificationsByType(type) {
            if (!notificationListElement) return;
            
            const items = notificationListElement.querySelectorAll('.notification-item');
            
            items.forEach(item => {
                if (type === 'all' || item.classList.contains(type)) {
                    item.style.display = 'block';
                } else {
                    item.style.display = 'none';
                }
            });
            
            // Mostrar mensaje si no hay notificaciones del tipo seleccionado
            const visibleItems = Array.from(items).filter(item => 
                item.style.display === 'block'
            );
            
            const emptyNotifications = document.querySelector('.empty-notifications');
            if (emptyNotifications) {
                if (visibleItems.length === 0) {
                    emptyNotifications.classList.remove('hidden');
                } else {
                    emptyNotifications.classList.add('hidden');
                }
            }
        }
        
        /**
         * Marca todas las notificaciones como leídas
         */
        function markNotificationsAsRead() {
            if (!notificationCount) return;
            
            notificationCount.textContent = '0';
            notificationCount.classList.add('hidden');
            
            // Marcar notificaciones individuales como leídas
            const unreadItems = document.querySelectorAll('.notification-item.unread');
            unreadItems.forEach(item => {
                item.classList.remove('unread');
            });
        }
        
        /**
         * Limpia todas las notificaciones
         */
        function clearAllNotifications() {
            if (!notificationListElement) return;
            
            // Eliminar todas las notificaciones con animación
            const items = notificationListElement.querySelectorAll('.notification-item');
            let delay = 0;
            
            items.forEach(item => {
                setTimeout(() => {
                    item.classList.add('removing');
                    setTimeout(() => {
                        item.remove();
                    }, 300);
                }, delay);
                delay += 50;
            });
            
            // Mostrar mensaje de vacío después de eliminar todas
            setTimeout(() => {
                const emptyNotifications = document.querySelector('.empty-notifications');
                if (emptyNotifications) {
                    emptyNotifications.classList.remove('hidden');
                }
                
                // Resetear contador
                if (notificationCount) {
                    notificationCount.textContent = '0';
                    notificationCount.classList.add('hidden');
                }
            }, delay + 300);
        }
        /**
     * Crea el panel de usuarios activos
     */
    function createActiveUsersPanel() {
        // No necesitamos crear el panel ya que está en el HTML
        activeUsersPanel = document.getElementById('usersModal');
        
        if (!activeUsersPanel) {
            console.warn('Panel de usuarios activos no encontrado en el DOM');
            return;
        }

        // Si hay un botón para mostrar usuarios, configurarlo
        if (showUsersStats) {
            showUsersStats.addEventListener('click', () => {
                activeUsersPanel.classList.remove('hidden');
                // Solicitar lista actualizada
                if (window.socket) {
                    window.socket.emit('requestActiveUsers');
                    window.socket.emit('requestUserHistory');
                }
            });
        }
        
        // Configurar botón de cierre
        if (closeUsersModal) {
            closeUsersModal.addEventListener('click', () => {
                activeUsersPanel.classList.add('hidden');
            });
        }
        
        console.log('Panel de usuarios activos configurado');
    }

    /**
     * Actualiza la lista de usuarios activos
     */
    function updateActiveUsersList(users) {
        // Actualizar contador principal
        updateUserCount(users.length);

        // Actualizar estadísticas detalladas
        if (currentUsers) {
            currentUsers.textContent = users.length;
        }

        // Actualizar lista de actividad (si existe)
        if (userActivity) {
            updateUsersActivityList(users);
        }
    }

    /**
     * Actualiza la lista de actividad de usuarios
     */
    function updateUsersActivityList(users) {
        if (!userActivity) return;
        
        // Limpiar lista actual
        userActivity.innerHTML = '';
        
        // Si no hay usuarios
        if (!users || users.length === 0) {
            const emptyItem = document.createElement('li');
            emptyItem.className = 'activity-item empty';
            emptyItem.innerHTML = 'No hay actividad reciente';
            userActivity.appendChild(emptyItem);
            return;
        }
        
        // Ordenar usuarios por tiempo de conexión (más recientes primero)
        const sortedUsers = [...users].sort((a, b) => {
            if (!a.connectTime) return 1;
            if (!b.connectTime) return -1;
            return new Date(b.connectTime) - new Date(a.connectTime);
        });
        
        // Mostrar solo los 5 últimos usuarios
        const recentUsers = sortedUsers.slice(0, 5);
        
        // Obtener ID del usuario actual
        const currentUserId = window.userId;
        
        // Añadir cada usuario a la lista
        recentUsers.forEach(user => {
            const listItem = document.createElement('li');
            listItem.className = 'activity-item';
            
            // Determinar si es el usuario actual
            const isCurrentUser = currentUserId && user.id && 
                user.id.includes(currentUserId);
            
            // Calcular tiempo desde la conexión
            let connectTime = '';
            if (user.connectTime) {
                connectTime = formatTimeSince(new Date(user.connectTime));
            }
            
            // Icono según acción reciente
            let lastActionIcon = 'user';
            if (user.lastAction) {
                switch (user.lastAction) {
                    case 'recommendation': lastActionIcon = 'star'; break;
                    case 'slider': lastActionIcon = 'sliders-h'; break;
                    case 'button': lastActionIcon = 'mouse-pointer'; break;
                    default: lastActionIcon = 'user';
                }
            }
            
            // Contenido del elemento
            listItem.innerHTML = `
                <div class="activity-icon">
                    <i class="fas fa-${lastActionIcon}"></i>
                </div>
                <div class="activity-details">
                    <span class="activity-user ${isCurrentUser ? 'current-user' : ''}">${user.id || 'Usuario'}</span>
                    <span class="activity-action">${user.lastAction ? formatLastAction(user.lastAction) : 'se conectó'}</span>
                </div>
                <div class="activity-time">${connectTime}</div>
            `;
            
            userActivity.appendChild(listItem);
        });
    }

    /**
     * Actualiza la actividad del usuario
     */
    function updateUserActivity(activity) {
        if (!userActivity) return;
        
        // Crear nuevo elemento de actividad
        const listItem = document.createElement('li');
        listItem.className = 'activity-item new-activity';
        
        // Icono según tipo de actividad
        let actionIcon = 'user';
        if (activity.type) {
            switch (activity.type) {
                case 'recommendation': actionIcon = 'star'; break;
                case 'slider': actionIcon = 'sliders-h'; break;
                case 'button': actionIcon = 'mouse-pointer'; break;
                default: actionIcon = 'user';
            }
        }
        
        // Obtener ID del usuario actual
        const currentUserId = window.userId;
        
        // Determinar si es el usuario actual
        const isCurrentUser = currentUserId && activity.userId && 
            activity.userId.includes(currentUserId);
        
        // Datos del usuario
        const userId = activity.userId || 'Usuario';
        const actionType = activity.type ? formatLastAction(activity.type) : 'se conectó';
        const actionTime = 'ahora';
        
        // Contenido del elemento
        listItem.innerHTML = `
            <div class="activity-icon">
                <i class="fas fa-${actionIcon}"></i>
            </div>
            <div class="activity-details">
                <span class="activity-user ${isCurrentUser ? 'current-user' : ''}">${userId}</span>
                <span class="activity-action">${actionType}</span>
            </div>
            <div class="activity-time">${actionTime}</div>
        `;
        
        // Insertar al principio de la lista
        userActivity.insertBefore(listItem, userActivity.firstChild);
        
        // Limitar a 5 elementos
        while (userActivity.children.length > 5) {
            userActivity.removeChild(userActivity.lastChild);
        }

        // Quitar animación después de 2 segundos
        setTimeout(() => {
            listItem.classList.remove('new-activity');
        }, 2000);
        
        // Si la actividad es una recomendación, también notificar
        if (activity.type === 'recommendation' && activity.data) {
            processNewRecommendation(activity.data);
        } else if (activity.type === 'sliderMovement' && activity.data) {
            handleRemoteSliderMovement(activity.data);
        }
    }
    
    /**
     * Formatea la descripción de la última acción
     */
    function formatLastAction(action) {
        switch (action) {
            case 'connect': return 'se conectó';
            case 'disconnect': return 'se desconectó';
            case 'slider': return 'ajustó parámetros';
            case 'sliderMovement': return 'está ajustando los sliders';
            case 'button': return 'pulsó un botón';
            case 'recommendation': return 'envió recomendación';
            default: return action;
        }
    }
    
    /**
     * Formatea el tiempo transcurrido desde una fecha
     */
    function formatTimeSince(date) {
        const seconds = Math.floor((new Date() - date) / 1000);
        
        let interval = Math.floor(seconds / 31536000);
        if (interval >= 1) {
            return `hace ${interval} ${interval === 1 ? 'año' : 'años'}`;
        }
        
        interval = Math.floor(seconds / 2592000);
        if (interval >= 1) {
            return `hace ${interval} ${interval === 1 ? 'mes' : 'meses'}`;
        }
        
        interval = Math.floor(seconds / 86400);
        if (interval >= 1) {
            return `hace ${interval} ${interval === 1 ? 'día' : 'días'}`;
        }
        
        interval = Math.floor(seconds / 3600);
        if (interval >= 1) {
            return `hace ${interval} ${interval === 1 ? 'hora' : 'horas'}`;
        }
        
        interval = Math.floor(seconds / 60);
        if (interval >= 1) {
            return `hace ${interval} ${interval === 1 ? 'minuto' : 'minutos'}`;
        }
        
        return `hace ${Math.floor(seconds)} segundos`;
    }

    /**
     * Actualiza el contador de usuarios
     */
    function updateUserCount(count) {
        // Actualizar en la barra superior
        const countElement = document.getElementById('usersOnline');
        if (countElement) {
            countElement.textContent = count;
        }

        // Actualizar en el footer
        if (footerUsersCount) {
            footerUsersCount.textContent = count;
        }

        // Actualizar en estadísticas detalladas
        if (currentUsers) {
            currentUsers.textContent = count;
        }
        
        // Actualizar contador total (estimado)
        if (totalUsers) {
            // Número base más el actual (para ejemplo, en producción usar valor real de la BD)
            const baseUsers = 1000;
            totalUsers.textContent = baseUsers + count;
        }
        
        // Actualizar usuarios de hoy (estimado)
        if (todayUsers) {
            // Estimado para ejemplo (en producción usar valor real de la BD)
            const todayEstimate = Math.max(50, Math.floor(count * 2.5));
            todayUsers.textContent = todayEstimate;
        }
        
        // Actualizar gráfico de usuarios si hay un nuevo punto
        if (usersChart) {
            // Añadir nuevo punto cada 15 minutos (en producción)
            const now = new Date();
            const minutes = now.getMinutes();
            
            if (minutes % 15 === 0 && now.getSeconds() < 10) {
                const currentHour = `${now.getHours()}:${minutes.toString().padStart(2, '0')}`;
                
                // Añadir nuevo punto solo si la última etiqueta es diferente
                const lastLabel = usersChart.data.labels[usersChart.data.labels.length - 1];
                if (lastLabel !== currentHour) {
                    usersChart.data.labels.push(currentHour);
                    usersChart.data.datasets[0].data.push(count);
                    
                    // Limitar a 12 puntos
                    if (usersChart.data.labels.length > 12) {
                        usersChart.data.labels.shift();
                        usersChart.data.datasets[0].data.shift();
                    }
                    
                    usersChart.update();
                }
            }
        }
    }
    
    /**
     * Calcula la percepción basada en los valores de las acciones
     * @returns {number} - Valor de percepción calculado
     */
    function calculatePerception() {
        const A = parseFloat(sliders.accion1.value) * 4;
        const B = parseFloat(sliders.accion2.value) * 4;
        const C = parseFloat(sliders.accion3.value) * 4;
        const D = parseFloat(sliders.accion4.value) * 4;

        let estado = (4 * 418.9829) - (
            ((A - 620.0) * Math.sin(Math.sqrt(Math.abs(A - 620.0)))) +
            ((B + 320.0) * Math.sin(Math.sqrt(Math.abs(B + 320.0)))) +
            ((C + 720.0) * Math.sin(Math.sqrt(Math.abs(C + 720.0)))) +
            ((D - 520.0) * Math.sin(Math.sqrt(Math.abs(D - 520.0))))
        );

        estado = estado / 45.5600;

        if (estado > 100) estado = 100;
        if (estado < 0.0) estado = 0.0;

        return parseFloat(estado.toFixed(18));
    }

    /**
     * Actualiza el campo de percepción con el valor calculado
     */
    function updatePerception() {
        const perception = calculatePerception();
        if (perceptionField) {
            perceptionField.value = perception.toFixed(10);
        }
        
        // Actualizar barra de percepción
        updatePerceptionBar();
        
        return perception;
    }

    /**
     * Guarda una recomendación en la base de datos y la muestra en la interfaz
     */
    function saveRecommendation() {
        const perception = calculatePerception();
        
        // Obtener valores de acciones y convertirlos explícitamente a números
        const actions = {
            accion1: Number(parseFloat(sliders.accion1.value)),
            accion2: Number(parseFloat(sliders.accion2.value)),
            accion3: Number(parseFloat(sliders.accion3.value)),
            accion4: Number(parseFloat(sliders.accion4.value))
        };
        
        // Validar datos numéricos
        if (Object.values(actions).some(isNaN)) {
            showNotification('error', 'Error de validación', 'Todos los valores deben ser numéricos');
            return;
        }
        
        // Crear elemento visual en la lista de recomendaciones
        addRecommendationToHistory(perception, actions);
        
        // Guardar en la base de datos
        savePerceptionToDB(perception, actions, true);
        
        // Ocultar mensaje de vacío
        checkEmptyRecommendations(false);
        
        // Notificar al usuario
        showNotification('success', 'Recomendación guardada', 'Tus valores han sido guardados y compartidos con otros agentes');
        
        // Actualizar estadísticas
        updateStatistics();
    }

    /**
     * Guarda la percepción y acciones en la base de datos
     * @param {number} perception - Valor de percepción
     * @param {Object} actions - Valores de las acciones
     * @param {boolean} isUserRecommendation - Indica si es una recomendación explícita del usuario
     */
    function savePerceptionToDB(perception, actions, isUserRecommendation = false) {
        // Conversión explícita a números
        const data = {
            percepcion: Number(perception),
            accion1: Number(actions.accion1),
            accion2: Number(actions.accion2),
            accion3: Number(actions.accion3),
            accion4: Number(actions.accion4),
            timestamp: new Date().toISOString(),
            userId: window.userId,
            isUserRecommendation: isUserRecommendation
        };
        
        // Verificar NaN
        const hasNaN = Object.entries(data).some(([key, val]) => 
            key !== 'timestamp' && key !== 'userId' && key !== 'isUserRecommendation' && (isNaN(val) || val === null)
        );
        
        if (hasNaN) {
            console.error('Error: Algunos valores no son numéricos válidos');
            showNotification('error', 'Error de datos', 'Algunos valores no son numéricos válidos');
            return;
        }
        
        fetch('/guardar-recomendacion', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => Promise.reject(err));
            }
            return response.json();
        })
        .then(result => {
            console.log('Recomendación guardada con éxito:', result);
            
            if (isUserRecommendation) {
                // Añadir notificación al centro de notificaciones
                addNotificationToPanel('success', 'Recomendación guardada', 'Tu recomendación ha sido guardada en la base de datos');
                
                // Notificar a otros usuarios si hay socket configurado
                if (window.socket && window.socket.connected) {
                    window.socket.emit('newRecommendation', {
                        ...data,
                        id: result.id,
                        userId: window.userId
                    });
                }
            }
        })
        .catch(error => {
            console.error('Error al guardar la recomendación:', error);
            
            if (isUserRecommendation) {
                showNotification('error', 'Error al guardar', error.message || 'No se pudo guardar la recomendación en la base de datos');
                // Añadir notificación al centro de notificaciones
                addNotificationToPanel('error', 'Error de guardado', error.message || 'No se pudo guardar la recomendación');
            }
        });
    }
    /**
     * Agrega una recomendación al historial visual
     * @param {number} perception - Valor de percepción
     * @param {Object} actions - Valores de las acciones
     * @param {string} [userId] - ID del usuario que hizo la recomendación (opcional)
     * @param {boolean} [isRemote] - Indica si la recomendación vino de otro usuario
     */
    function addRecommendationToHistory(perception, actions, userId = null, isRemote = false) {
        if (!historyList) return;
        
        const fecha = new Date();
        const recomendacion = document.createElement('div');
        recomendacion.className = 'history-item'; // Clase base
        
        // Añadir clase especial si es remota
        if (isRemote) {
            recomendacion.classList.add('remote-recommendation');
        }
        
        // Agregar atributo de datos para identificación
        if (actions.id) {
            recomendacion.setAttribute('data-id', actions.id);
        }
        
        // Determinar texto de usuario
        let userText = '';
        if (userId) {
            const currentUserId = window.userId;
            
            if (currentUserId && userId.includes(currentUserId)) {
                userText = '<span class="history-user current-user">Tú</span>';
            } else {
                userText = `<span class="history-user">Usuario ${userId.substring(0, 8)}</span>`;
            }
        } else {
            userText = '<span class="history-user">Tú</span>';
        }
        
        const formattedPercepcion = perception.toFixed(4);
        const scoreClass = perception > 80 ? "high-score" : 
                        perception > 50 ? "medium-score" : "low-score";
        
        recomendacion.innerHTML = `
            <div class="history-item-header">
                <span class="history-time">${fecha.toLocaleTimeString()}</span>
                ${userText}
            </div>
            <div class="history-item-content">
                <div class="history-values">
                    <div class="history-value-item">A1: ${actions.accion1.toFixed(2)}</div>
                    <div class="history-value-item">A2: ${actions.accion2.toFixed(2)}</div>
                    <div class="history-value-item">A3: ${actions.accion3.toFixed(2)}</div>
                    <div class="history-value-item">A4: ${actions.accion4.toFixed(2)}</div>
                </div>
                <div class="history-perception">
                    <span>Percepción:</span>
                    <span class="history-perception-value ${scoreClass}">${formattedPercepcion}</span>
                </div>
            </div>
        `;
        
        // Agregar evento para cargar esta recomendación
        recomendacion.addEventListener('click', () => {
            sliders.accion1.value = actions.accion1;
            sliders.accion2.value = actions.accion2;
            sliders.accion3.value = actions.accion3;
            sliders.accion4.value = actions.accion4;
            
            sliderValues.accion1.value = actions.accion1;
            sliderValues.accion2.value = actions.accion2;
            sliderValues.accion3.value = actions.accion3;
            sliderValues.accion4.value = actions.accion4;
            
            perceptionField.value = perception.toFixed(10);
            
            // Actualizar barras de progreso
            updateAllProgressBars();
            
            // Actualizar el punto en vivo
            addNewDataPoint(perception, actions);
            
            showNotification('info', 'Valores cargados', 'Se han cargado los valores de la recomendación seleccionada');
        });
        
        // Añadir al inicio para que las más recientes aparezcan primero
        historyList.insertBefore(recomendacion, historyList.firstChild);
        
        // Mantener máximo 50 elementos en la lista
        while (historyList.children.length > 50) {
            historyList.removeChild(historyList.lastChild);
        }
        
        // Aplicar efecto de nuevo elemento
        recomendacion.classList.add('new-item');
        setTimeout(() => {
            recomendacion.classList.remove('new-item');
        }, 2000);
    }

    /**
     * Procesa una nueva recomendación recibida de otro usuario
     * @param {Object} data - Datos de la recomendación
     */
    function processNewRecommendation(data) {
        // Verificar que no sea una recomendación duplicada
        if (data.id && lastRecommendationId === data.id) {
            return; // Evitar duplicados
        }
        
        // Actualizar ID de última recomendación
        if (data.id) {
            lastRecommendationId = data.id;
        }
        
        // Crear objeto de acciones
        const actions = {
            accion1: Number(data.accion1),
            accion2: Number(data.accion2),
            accion3: Number(data.accion3),
            accion4: Number(data.accion4),
            id: data.id // Guardar ID para evitar duplicados
        };
        
        // Validar datos
        if (Object.values(actions).some(val => val === undefined || isNaN(val))) {
            console.warn('Recomendación recibida con datos inválidos:', data);
            return;
        }
        
        // Obtener percepción
        const perception = Number(data.percepcion);
        if (isNaN(perception)) {
            console.warn('Percepción inválida en recomendación:', data);
            return;
        }
        
        // Añadir como un nuevo punto
        const userId = data.userId || 'remoto';
        
        // Verificar que no sea del usuario actual
        if (userId !== window.userId) {
            // Agregar al gráfico como un nuevo punto
            addNewDataPoint(perception, actions, {
                userId: userId,
                timestamp: data.timestamp || new Date().toISOString()
            });
            
            // Añadir al historial visual
            addRecommendationToHistory(perception, actions, userId, true);
            
            // Ocultar mensaje de vacío
            checkEmptyRecommendations(false);
            
            // Mostrar notificación
            showNotification('info', 'Nueva recomendación', `El usuario ${userId.substring(0, 8)} ha enviado una nueva recomendación`, 3000);
            
            // Añadir notificación al panel
            addNotificationToPanel('info', 'Nueva recomendación', `Usuario ${userId.substring(0, 8)} ha enviado una recomendación con percepción ${perception.toFixed(2)}`);
            
            // Actualizar estadísticas
            updateStatistics();
        }
    }

    /**
     * Carga recomendaciones iniciales recibidas del servidor
     * @param {Array} recommendations - Lista de recomendaciones
     */
    function loadInitialRecommendations(recommendations) {
        if (!Array.isArray(recommendations) || recommendations.length === 0) {
            return;
        }
        
        console.log(`Cargando ${recommendations.length} recomendaciones iniciales`);
        
        // Ordenar por ID (suponiendo que son cronológicas)
        recommendations.sort((a, b) => a.id - b.id);
        
        // Guardar el ID más alto para evitar duplicados
        if (recommendations.length > 0) {
            lastRecommendationId = Math.max(...recommendations.map(r => r.id || 0));
        }
        
        // Para cada recomendación
        recommendations.forEach(rec => {
            // Crear objeto de acciones
            const actions = {
                accion1: Number(rec.accion1),
                accion2: Number(rec.accion2),
                accion3: Number(rec.accion3),
                accion4: Number(rec.accion4),
                id: rec.id
            };
            
            // Validar datos
            if (Object.values(actions).some(val => val === undefined || isNaN(val))) {
                return;
            }
            
            // Obtener percepción
            const perception = Number(rec.percepcion);
            if (isNaN(perception)) {
                return;
            }
            
            // Verificar que no sea del usuario actual
            const userId = rec.userId || 'sistema';
            const isRemote = userId !== window.userId;
            
            // Añadir al gráfico solo si es de otro usuario o si es una recomendación explícita
            if (isRemote || rec.isUserRecommendation) {
                // Añadir al gráfico como un nuevo punto
                addNewDataPoint(perception, actions, {
                    userId: userId,
                    timestamp: rec.timestamp || new Date().toISOString()
                });
                
                // Añadir al historial visual solo si es una recomendación explícita
                if (rec.isUserRecommendation) {
                    addRecommendationToHistory(perception, actions, userId, isRemote);
                }
            }
        });
        
        // Ocultar mensaje de vacío si hay recomendaciones
        const hasRecommendations = recommendations.some(rec => rec.isUserRecommendation);
        checkEmptyRecommendations(!hasRecommendations);
        
        // Actualizar estadísticas
        updateStatistics();
        
        // Mostrar notificación
        if (recommendations.length > 0) {
            showNotification('info', 'Datos cargados', `Se han cargado ${recommendations.length} valores históricos`, 3000);
        }
    }

    /**
     * Carga el historial desde la base de datos
     */
    function fetchHistoryFromDB() {
        fetch('/obtener-historial')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Error al recuperar historial: ${response.statusText}`);
                }
                return response.json();
            })
            .then(data => {
                // Verificar si los datos tienen el formato esperado
                if (Array.isArray(data.data)) {
                    data = data.data; // API mejorada puede devolver { data: [...] }
                } else if (!Array.isArray(data)) {
                    console.error('Formato de datos inesperado:', data);
                    throw new Error('Formato de datos inesperado');
                }
                
                // Guardar el ID más alto para evitar duplicados
                if (data.length > 0) {
                    lastRecommendationId = Math.max(...data.map(item => item.id || 0));
                }
                
                // Contador para recomendaciones explícitas
                let explicitRecommendationsCount = 0;
                
                // Procesar cada elemento
                data.forEach(item => {
                    // Asegurarse de que los valores sean numéricos
                    const actions = {
                        accion1: Number(item.accion1),
                        accion2: Number(item.accion2),
                        accion3: Number(item.accion3),
                        accion4: Number(item.accion4),
                        id: item.id
                    };
                    
                    const perception = Number(item.percepcion);
                    
                    // Verificar que los datos sean válidos
                    if (!isNaN(perception) && !Object.values(actions).some(isNaN)) {
                        // Verificar que no sea del usuario actual o que sea una recomendación explícita
                        const userId = item.userId || 'histórico';
                        const isRemote = userId !== window.userId;
                        
                        // Añadir al gráfico como un nuevo punto
                        addNewDataPoint(perception, actions, {
                            userId: userId,
                            timestamp: item.timestamp || new Date().toISOString()
                        });
                        
                        // Añadir a la lista visual solo si es una recomendación explícita
                        if (item.isUserRecommendation) {
                            addRecommendationToHistory(
                                perception, 
                                actions, 
                                userId, 
                                isRemote
                            );
                            explicitRecommendationsCount++;
                        }
                    } else {
                        console.warn('Datos inválidos ignorados:', item);
                    }
                });
                
                // Ocultar mensaje de vacío si hay recomendaciones
                checkEmptyRecommendations(explicitRecommendationsCount === 0);
                
                // Actualizar estadísticas
                updateStatistics();
                
                // Notificar al usuario
                if (data.length > 0 && !isInitialLoad) {
                    showNotification('info', 'Datos cargados', `Se han cargado ${data.length} registros históricos`);
                }
                
                // Marcar que la carga inicial ya pasó
                isInitialLoad = false;
            })
            .catch(error => {
                console.error('Error al recuperar historial:', error);
                
                // Solo mostrar notificación si no es la carga inicial
                if (!isInitialLoad) {
                    showNotification('error', 'Error de carga', 'No se pudo recuperar el historial de la base de datos');
                }
                
                // Marcar que la carga inicial ya pasó
                isInitialLoad = false;
            });
    }

    /**
     * Verifica si hay recomendaciones y muestra/oculta mensaje
     */
    function checkEmptyRecommendations(forceEmpty = false) {
        if (!historyList || !emptyRecommendations) return;
        
        const isEmpty = forceEmpty || historyList.children.length === 0;
        
        if (isEmpty) {
            emptyRecommendations.classList.remove('hidden');
        } else {
            emptyRecommendations.classList.add('hidden');
        }
    }

    /**
     * Muestra las estadísticas de percepción
     */
    function showStatistics() {
        if (!statisticsContainer || perceptionHistory.length === 0) {
            showNotification('warning', 'No hay datos', 'No hay suficientes datos para mostrar estadísticas');
            return;
        }
        
        // Calcular estadísticas
        const maxPerception = Math.max(...perceptionHistory);
        const minPerception = Math.min(...perceptionHistory);
        const avgPerception = perceptionHistory.reduce((sum, val) => sum + val, 0) / perceptionHistory.length;
        
        // Actualizar elementos visuales
        document.getElementById('maxPerception').textContent = maxPerception.toFixed(4);
        document.getElementById('minPerception').textContent = minPerception.toFixed(4);
        document.getElementById('avgPerception').textContent = avgPerception.toFixed(4);
        document.getElementById('totalTrials').textContent = perceptionHistory.length;
        
        // Actualizar gráfico de estadísticas
        if (statsChart) {
            statsChart.data.datasets[0].data = [minPerception, avgPerception, maxPerception];
            statsChart.update();
        }
        
        // Mostrar panel de estadísticas
        statisticsContainer.classList.remove('hidden');
    }

    /**
     * Actualiza las estadísticas sin mostrarlas
     */
    function updateStatistics() {
        if (perceptionHistory.length === 0) return;
        
        const maxPerception = Math.max(...perceptionHistory);
        const minPerception = Math.min(...perceptionHistory);
        const avgPerception = perceptionHistory.reduce((sum, val) => sum + val, 0) / perceptionHistory.length;
        
        if (document.getElementById('maxPerception')) {
            document.getElementById('maxPerception').textContent = maxPerception.toFixed(4);
        }
        
        if (document.getElementById('minPerception')) {
            document.getElementById('minPerception').textContent = minPerception.toFixed(4);
        }
        
        if (document.getElementById('avgPerception')) {
            document.getElementById('avgPerception').textContent = avgPerception.toFixed(4);
        }
        
        if (document.getElementById('totalTrials')) {
            document.getElementById('totalTrials').textContent = perceptionHistory.length;
        }
        
        if (statsChart) {
            statsChart.data.datasets[0].data = [minPerception, avgPerception, maxPerception];
            statsChart.update();
        }
    }
    /**
     * Configurar todos los event listeners
     */
    function setupEventListeners() {
        // Event listeners para sliders
        Object.keys(sliders).forEach(key => {
            const slider = sliders[key];
            const valueInput = sliderValues[key];
            const progressKey = 'progress' + key.slice(-1);
            const progressBar = sliderProgress[progressKey];
            
            // Cuando se cambia el valor manualmente en el input
            valueInput.addEventListener('input', () => {
                const value = parseFloat(valueInput.value);
                if (!isNaN(value) && value >= -100 && value <= 100) {
                    slider.value = value;
                    updatePerception();
                    
                    // Actualizar barra de progreso
                    if (progressBar) {
                        updateSliderProgress(slider, progressBar);
                    }
                    
                    // Crear nuevo punto con el valor actualizado
                    const perception = calculatePerception();
                    const actions = {
                        accion1: parseFloat(sliders.accion1.value),
                        accion2: parseFloat(sliders.accion2.value),
                        accion3: parseFloat(sliders.accion3.value),
                        accion4: parseFloat(sliders.accion4.value)
                    };
                    
                    // Agregar nuevo punto al gráfico
                    addNewDataPoint(perception, actions);
                    
                    // Sincronizar con otros usuarios
                    syncDataWithOtherUsers(perception, actions);
                }
            });
            
            // Validar límites en los inputs
            valueInput.addEventListener('blur', () => {
                const value = parseFloat(valueInput.value);
                if (isNaN(value)) {
                    valueInput.value = 0;
                    slider.value = 0;
                } else if (value < -100) {
                    valueInput.value = -100;
                    slider.value = -100;
                } else if (value > 100) {
                    valueInput.value = 100;
                    slider.value = 100;
                }
                
                updatePerception();
                
                // Actualizar barra de progreso
                if (progressBar) {
                    updateSliderProgress(slider, progressBar);
                }
                
                // Crear punto final
                const perception = calculatePerception();
                const actions = {
                    accion1: parseFloat(sliders.accion1.value),
                    accion2: parseFloat(sliders.accion2.value),
                    accion3: parseFloat(sliders.accion3.value),
                    accion4: parseFloat(sliders.accion4.value)
                };
                
                // Agregar punto final al gráfico
                addNewDataPoint(perception, actions);
                
                // Sincronizar valor final
                syncDataWithOtherUsers(perception, actions);
            });
        });
        
        // Botón recomendar
        if (recomendarButton) {
            recomendarButton.addEventListener('click', () => {
                recomendarButton.classList.add('pulse-once');
                setTimeout(() => {
                    recomendarButton.classList.remove('pulse-once');
                }, 1000);
                
                saveRecommendation();
            });
        }
        
        // Botón mostrar estadísticas
        if (showStatsButton) {
            showStatsButton.addEventListener('click', () => {
                showStatistics();
            });
        }
        
        // Botón cerrar estadísticas
        if (closeStatsButton) {
            closeStatsButton.addEventListener('click', () => {
                statisticsContainer.classList.add('hidden');
            });
        }
        
        // Botón reiniciar sistema
        if (resetSystemButton) {
            resetSystemButton.addEventListener('click', () => {
                resetSystem();
            });
        }
        
        // Botón descargar datos
        if (downloadDataButton) {
            downloadDataButton.addEventListener('click', () => {
                downloadData();
            });
        }
        
        // Botón pantalla completa para el gráfico
        if (fullscreenChartButton) {
            fullscreenChartButton.addEventListener('click', () => {
                toggleFullscreen(document.querySelector('.chart-wrapper'));
            });
        }
        
        // Botón limpiar historial
        if (clearHistoryButton) {
            clearHistoryButton.addEventListener('click', () => {
                clearRecommendations();
            });
        }
        
        // Selector de periodo de tiempo
        if (timeFrameSelect) {
            timeFrameSelect.addEventListener('change', () => {
                filterChartByTimeFrame(timeFrameSelect.value);
            });
        }
        
        // Filtro de recomendaciones
        if (recommendationFilter) {
            recommendationFilter.addEventListener('change', () => {
                filterRecommendations(recommendationFilter.value);
            });
        }
        
        // Cambio de tema
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                toggleTheme();
            });
        }
        
        // Evento para expandir todos los controles
        const expandAllActions = document.getElementById('expandAllActions');
        if (expandAllActions) {
            expandAllActions.addEventListener('click', () => {
                toggleExpandAllActions();
            });
        }
        
        console.log('Event listeners configurados');
    }
    
    /**
     * Inicia el temporizador de autoguardado
     */
    function startAutoSave() {
        // Detener cualquier temporizador existente
        if (autoSaveTimer) {
            clearInterval(autoSaveTimer);
        }
        
        // Configurar nuevo temporizador
        autoSaveTimer = setInterval(() => {
            autoSaveData();
        }, autoSaveInterval);
        
        // Mostrar panel de actualización en tiempo real
        if (realtimeUpdatePanel) {
            realtimeUpdatePanel.classList.add('active');
        }
        
        // Iniciar actualización del contador
        updateAutoSaveCountdown();
        setInterval(updateAutoSaveCountdown, 1000);
        
        console.log('Autoguardado iniciado con intervalo de', formatDuration(autoSaveInterval));
    }
    
    /**
     * Realiza el autoguardado de datos
     */
    function autoSaveData() {
        // Verificar si hay datos para guardar
        if (perceptionHistory.length === 0) {
            console.log('No hay datos para autoguardar');
            return;
        }
        
        // Guardar datos históricos
        saveHistoricalData();
        
        // Actualizar tiempo del último guardado
        lastAutoSaveTime = new Date();
        
        // Actualizar interfaz
        updateLastSaveTime();
        
        // Mostrar notificación
        showNotification('success', 'Datos guardados', 'Los datos históricos han sido guardados automáticamente', 3000);
        
        console.log('Autoguardado completado:', formatTime(lastAutoSaveTime));
    }
    
    /**
     * Actualiza el contador de tiempo para el próximo autoguardado
     */
    function updateAutoSaveCountdown() {
        const nextSaveTimeElement = document.getElementById('nextSaveTime');
        if (!nextSaveTimeElement) return;
        
        // Calcular tiempo restante
        const now = new Date();
        let nextSaveTime;
        
        if (lastAutoSaveTime) {
            nextSaveTime = new Date(lastAutoSaveTime.getTime() + autoSaveInterval);
        } else {
            // Si no hay guardado previo, calcular desde ahora
            nextSaveTime = new Date(now.getTime() + autoSaveInterval);
        }
        
        // Calcular diferencia en segundos
        const diffMs = nextSaveTime - now;
        if (diffMs <= 0) {
            nextSaveTimeElement.textContent = "En proceso...";
            return;
        }
        
        // Formatear tiempo restante
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
        
        nextSaveTimeElement.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    /**
     * Actualiza el tiempo del último guardado
     */
    function updateLastSaveTime() {
        const lastSaveTimeElement = document.getElementById('lastSaveTime');
        if (!lastSaveTimeElement || !lastAutoSaveTime) return;
        
        lastSaveTimeElement.textContent = `Último guardado: ${formatTime(lastAutoSaveTime)}`;
    }

    /**
     * Guarda los datos históricos en el servidor
     */
    function saveHistoricalData() {
        // Crear objeto con datos históricos
        const data = {
            perceptions: perceptionHistory,
            actions: actionHistory,
            timestamp: new Date().toISOString(),
            dataPoints: perceptionHistory.length
        };
        
        // Intentar guardar en el servidor
        fetch('/guardar-historico', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => Promise.reject(err));
            }
            return response.json();
        })
        .then(result => {
            console.log('Datos históricos guardados:', result);
            
            // Guardar localmente para respaldo
            saveHistoricalDataLocally(data);
            
            // Actualizar la interfaz de usuario
            showAutoSaveSuccess();
        })
        .catch(error => {
            console.error('Error al guardar datos históricos:', error);
            
            // Intentar guardar localmente como respaldo
            saveHistoricalDataLocally(data);
            
            showNotification('warning', 'Error de guardado en servidor', 'Los datos se han guardado localmente como respaldo', 5000);
        });
    }

    /**
     * Guarda los datos históricos localmente
     */
    function saveHistoricalDataLocally(data) {
        try {
            // Guardar en localStorage (con límite de tamaño)
            const storageKey = `historical_data_${new Date().toISOString().slice(0, 10)}`;
            
            // Añadir a la lista de almacenamiento
            historicalDataStorage.push(data);
            
            // Limitar a 10 conjuntos de datos para no sobrecargar localStorage
            if (historicalDataStorage.length > 10) {
                historicalDataStorage = historicalDataStorage.slice(-10);
            }
            
            // Intentar guardar en localStorage
            try {
                localStorage.setItem(storageKey, JSON.stringify(data));
            } catch (e) {
                console.warn('No se pudo guardar en localStorage (posiblemente por límite de tamaño)');
            }
            
            console.log('Datos históricos guardados localmente');
        } catch (error) {
            console.error('Error al guardar datos localmente:', error);
        }
    }

    /**
     * Muestra indicador de éxito en autoguardado
     */
    function showAutoSaveSuccess() {
        const autosaveMessage = document.querySelector('.autosave-message');
        if (!autosaveMessage) return;
        
        // Añadir clase de éxito
        autosaveMessage.classList.add('autosave-success');
        
        // Quitar clase después de 3 segundos
        setTimeout(() => {
            autosaveMessage.classList.remove('autosave-success');
        }, 3000);
    }

    /**
     * Muestra una notificación temporal
     * @param {string} type - Tipo de notificación: success, error, warning, info
     * @param {string} title - Título de la notificación
     * @param {string} message - Mensaje de la notificación
     * @param {number} [duration=5000] - Duración en milisegundos, 0 para no ocultar automáticamente
     */
    function showNotification(type, title, message, duration = 5000) {
        const toastContainer = document.getElementById('toastContainer');
        if (!toastContainer) return;

        // Crear nueva notificación
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        // Icono según tipo
        let icon = 'info-circle';
        switch(type) {
            case 'success': icon = 'check-circle'; break;
            case 'error': icon = 'times-circle'; break;
            case 'warning': icon = 'exclamation-triangle'; break;
        }

        toast.innerHTML = `
            <div class="toast-icon">
                <i class="fas fa-${icon}"></i>
            </div>
            <div class="toast-content">
                <h3 class="toast-title">${title}</h3>
                <p class="toast-message">${message}</p>
            </div>
            <button class="toast-close">
                <i class="fas fa-times"></i>
            </button>
        `;

        // Agregar al contenedor
        toastContainer.appendChild(toast);

        // Configurar botón de cierre
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => {
            toast.classList.add('hiding');
            setTimeout(() => {
                toast.remove();
            }, 300);
        });

        // Añadir al panel de notificaciones si no es una notificación transitoria
        if (duration !== 0) {
            addNotificationToPanel(type, title, message);
        }

        // Auto-cerrar después del tiempo especificado
        if (duration > 0) {
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.classList.add('hiding');
                    setTimeout(() => {
                        if (toast.parentNode) {
                            toast.remove();
                        }
                    }, 300);
                }
            }, duration);
        }
    }

    /**
     * Añade una notificación al panel de notificaciones
     * @param {string} type - Tipo de notificación: success, error, warning, info
     * @param {string} title - Título de la notificación
     * @param {string} message - Mensaje de la notificación
     */
    function addNotificationToPanel(type, title, message) {
        const notificationListElement = document.getElementById('notificationList');
        if (!notificationListElement) return;

        // Crear nueva notificación
        const notification = document.createElement('div');
        notification.className = `notification-item ${type} unread`;

        // Datos de tiempo
        const now = new Date();
        const timeString = formatTime(now);

        notification.innerHTML = `
            <div class="notification-title">${title}</div>
            <div class="notification-message">${message}</div>
            <div class="notification-time">${timeString}</div>
        `;

        // Agregar al contenedor
        notificationListElement.insertBefore(notification, notificationListElement.firstChild);

        // Incrementar contador de notificaciones
        incrementNotificationCount();

        // Ocultar mensaje de vacío si existe
        const emptyNotifications = document.querySelector('.empty-notifications');
        if (emptyNotifications) {
            emptyNotifications.classList.add('hidden');
        }

        // Limitar a 50 notificaciones
        const items = notificationListElement.querySelectorAll('.notification-item');
        if (items.length > 50) {
            items[items.length - 1].remove();
        }
    }

    /**
     * Incrementa el contador de notificaciones no leídas
     */
    function incrementNotificationCount() {
        const countElement = document.getElementById('notificationCount');
        if (!countElement) return;

        const currentCount = parseInt(countElement.textContent) || 0;
        countElement.textContent = currentCount + 1;
        countElement.classList.remove('hidden');

        // Añadir efecto de pulso al botón de notificaciones
        const notificationButton = document.getElementById('notificationButton');
        if (notificationButton) {
            notificationButton.classList.add('pulse-once');
            setTimeout(() => {
                notificationButton.classList.remove('pulse-once');
            }, 1000);
        }
    }

    /**
     * Reinicia el sistema a valores predeterminados
     */
    function resetSystem() {
        if (confirm('¿Estás seguro de que deseas reiniciar el simulador? Esta acción no eliminará los datos guardados en la base de datos.')) {
            // Reiniciar sliders y valores
            Object.keys(sliders).forEach(key => {
                sliders[key].value = 0;
                sliderValues[key].value = 0;
                
                // Actualizar barra de progreso
                const progressKey = 'progress' + key.slice(-1);
                const progressBar = sliderProgress[progressKey];
                if (progressBar) {
                    updateSliderProgress(sliders[key], progressBar);
                }
            });
            
            // Actualizar percepción
            updatePerception();
            
            // Agregar un nuevo punto con los valores reiniciados
            const perception = calculatePerception();
            const actions = {
                accion1: 0,
                accion2: 0,
                accion3: 0,
                accion4: 0
            };
            
            // Agregar nuevo punto al gráfico
            addNewDataPoint(perception, actions);
            
            // Sincronizar con otros usuarios
            syncDataWithOtherUsers(perception, actions);
            
            // Notificar al usuario
            showNotification('info', 'Sistema reiniciado', 'Todos los valores han sido restablecidos a sus valores predeterminados');
            
            // Notificar a otros usuarios
            if (window.socket && window.socket.connected) {
                window.socket.emit('userAction', {
                    type: 'reset',
                    userId: window.userId,
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    /**
     * Descarga los datos de percepción como CSV
     */
    function downloadData() {
        if (perceptionHistory.length === 0) {
            showNotification('warning', 'No hay datos', 'No hay datos para descargar');
            return;
        }
        
        // Crear contenido CSV
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Intento,Percepcion,Accion1,Accion2,Accion3,Accion4,Timestamp,Usuario\n";

        for (let i = 0; i < perceptionHistory.length; i++) {
            const perception = perceptionHistory[i];
            const actions = actionHistory[i];
            const timestamp = actions.timestamp || new Date().toISOString();
            const userId = actions.userId || window.userId;
            
            csvContent += `${i + 1},${perception},${actions.accion1},${actions.accion2},${actions.accion3},${actions.accion4},${timestamp},${userId}\n`;
        }

        // Crear enlace de descarga
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `percepciones_${new Date().toISOString().slice(0,10)}.csv`);
        document.body.appendChild(link);

        // Descargar archivo
        link.click();
        document.body.removeChild(link);

        // Notificar al usuario
        showNotification('success', 'Descarga completa', 'Los datos han sido descargados como un archivo CSV');
        
        // Notificar a otros usuarios
        if (window.socket && window.socket.connected) {
            window.socket.emit('userAction', {
                type: 'download',
                userId: window.userId,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Limpia la lista de recomendaciones
     */
    function clearRecommendations() {
        if (confirm('¿Estás seguro de que deseas limpiar el historial de recomendaciones? Esta acción no eliminará los datos de la base de datos.')) {
            if (historyList) {
                historyList.innerHTML = '';
            }
            
            // Mostrar mensaje de vacío
            checkEmptyRecommendations(true);
            
            // Notificar al usuario
            showNotification('info', 'Historial limpiado', 'Se ha limpiado el historial de recomendaciones');
            
            // Notificar a otros usuarios
            if (window.socket && window.socket.connected) {
                window.socket.emit('userAction', {
                    type: 'clearHistory',
                    userId: window.userId,
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    /**
     * Filtra las recomendaciones en la lista
     */
    function filterRecommendations(filterType) {
        if (!historyList) return;
        
        const items = historyList.querySelectorAll('.history-item');
        if (items.length === 0) return;
        
        items.forEach(item => {
            switch (filterType) {
                case 'all':
                    item.style.display = 'block';
                    break;
                case 'own':
                    if (item.classList.contains('remote-recommendation')) {
                        item.style.display = 'none';
                    } else {
                        item.style.display = 'block';
                    }
                    break;
                case 'others':
                    if (item.classList.contains('remote-recommendation')) {
                        item.style.display = 'block';
                    } else {
                        item.style.display = 'none';
                    }
                    break;
            }
        });
        
        // Verificar si hay elementos visibles
        const visibleItems = Array.from(items).filter(item => 
            item.style.display === 'block'
        );
        
        // Mostrar mensaje si no hay elementos visibles
        checkEmptyRecommendations(visibleItems.length === 0);
    }

    /**
     * Filtra la gráfica por periodo de tiempo
     */
    function filterChartByTimeFrame(timeFrame) {
        if (!perceptionChart || perceptionHistory.length === 0) return;
        
        // Hacer copia de los datos originales si no existe
        if (!perceptionChart.originalData) {
            perceptionChart.originalData = {
                labels: [...perceptionChart.data.labels],
                data: [...perceptionChart.data.datasets[0].data]
            };
        }
        
        // Si es "all", restaurar datos originales
        if (timeFrame === 'all') {
            perceptionChart.data.labels = [...perceptionChart.data.labels];
            perceptionChart.data.datasets[0].data = [...perceptionChart.data.datasets[0].data];
            perceptionChart.update();
            return;
        }
        
        // Calcular tiempo límite según selección
        const now = new Date();
        let limitTime;
        
        switch (timeFrame) {
            case '10m': limitTime = new Date(now - 10 * 60 * 1000); break;
            case '30m': limitTime = new Date(now - 30 * 60 * 1000); break;
            case '1h': limitTime = new Date(now - 60 * 60 * 1000); break;
            case '2h': limitTime = new Date(now - 2 * 60 * 60 * 1000); break;
            default: limitTime = new Date(0); // Todos los datos
        }
        
        // Filtrar datos por tiempo
        const filteredData = [];
        const filteredLabels = [];
        
        // Solo mantener los últimos N puntos para mayor rendimiento
        const maxPoints = 100; // Máximo número de puntos a mostrar
        const startIdx = Math.max(0, perceptionHistory.length - maxPoints);
        
        for (let i = startIdx; i < perceptionHistory.length; i++) {
            // Solo mostrar puntos más recientes que el límite
            const pointTime = actionHistory[i].timestamp ? new Date(actionHistory[i].timestamp) : new Date();
            
            if (pointTime >= limitTime) {
                filteredData.push(perceptionHistory[i]);
                filteredLabels.push(perceptionChart.data.labels[i]);
            }
        }
        
        // Actualizar gráfico con datos filtrados
        perceptionChart.data.labels = filteredLabels;
        perceptionChart.data.datasets[0].data = filteredData;
        perceptionChart.update();
    }

    /**
     * Alterna entre tema claro y oscuro
     */
    function toggleTheme() {
        const html = document.documentElement;
        const currentTheme = html.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';

        // Cambiar atributo
        html.setAttribute('data-theme', newTheme);

        // Guardar preferencia
        localStorage.setItem('theme', newTheme);

        // Actualizar colores de gráficos
        updateChartColors();

        // Notificar al usuario
        showNotification('info', 'Tema cambiado', `Se ha activado el tema ${newTheme === 'dark' ? 'oscuro' : 'claro'}`);
        
        // Notificar a otros usuarios
        if (window.socket && window.socket.connected) {
            window.socket.emit('userAction', {
                type: 'toggleTheme',
                userId: window.userId,
                theme: newTheme,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Inicializa el tema basado en preferencias del usuario
     */
    function initializeTheme() {
        const html = document.documentElement;
        const savedTheme = localStorage.getItem('theme');

        if (savedTheme) {
            html.setAttribute('data-theme', savedTheme);
        } else {
            const prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
            html.setAttribute('data-theme', prefersDarkMode ? 'dark' : 'light');
        }

        // Configurar listener para cambios en preferencias del sistema
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
            if (!localStorage.getItem('theme')) {
                html.setAttribute('data-theme', e.matches ? 'dark' : 'light');
                updateChartColors();
            }
        });
    }

    /**
     * Actualiza los colores de los gráficos basados en el tema actual
     */
    function updateChartColors() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        // Obtener colores del tema actual
        const textColor = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim();
        const gridColor = getComputedStyle(document.body).getPropertyValue('--border-color').trim();
        const primaryColor = getComputedStyle(document.body).getPropertyValue('--primary').trim();
        const bgColor = getComputedStyle(document.body).getPropertyValue('--bg-card').trim();

        // Actualizar gráfico de percepción
        if (perceptionChart) {
            perceptionChart.options.scales.x.grid.color = gridColor;
            perceptionChart.options.scales.x.ticks.color = textColor;
            perceptionChart.options.scales.y.grid.color = gridColor;
            perceptionChart.options.scales.y.ticks.color = textColor;
            
            perceptionChart.data.datasets[0].borderColor = primaryColor;
            perceptionChart.data.datasets[0].pointBackgroundColor = primaryColor;
            perceptionChart.data.datasets[0].backgroundColor = `rgba(${hexToRgb(primaryColor)}, 0.1)`;
            
            perceptionChart.options.plugins.tooltip.backgroundColor = bgColor;
            perceptionChart.options.plugins.tooltip.titleColor = getComputedStyle(document.body).getPropertyValue('--text-primary').trim();
            perceptionChart.options.plugins.tooltip.bodyColor = textColor;
            perceptionChart.options.plugins.tooltip.borderColor = gridColor;
            
            perceptionChart.update();
        }

        // Actualizar gráfico de estadísticas
        if (statsChart) {
            statsChart.options.scales.x.grid.color = gridColor;
            statsChart.options.scales.x.ticks.color = textColor;
            statsChart.options.scales.y.grid.color = gridColor;
            statsChart.options.scales.y.ticks.color = textColor;
            
            // Actualizar colores de las barras
            const dangerColor = getComputedStyle(document.body).getPropertyValue('--danger').trim();
            const infoColor = getComputedStyle(document.body).getPropertyValue('--info').trim();
            const successColor = getComputedStyle(document.body).getPropertyValue('--success').trim();
            
            statsChart.data.datasets[0].backgroundColor = [
                `rgba(${hexToRgb(dangerColor)}, 0.7)`,
                `rgba(${hexToRgb(infoColor)}, 0.7)`,
                `rgba(${hexToRgb(successColor)}, 0.7)`
            ];
            statsChart.data.datasets[0].borderColor = [
                dangerColor,
                infoColor,
                successColor
            ];
            
            statsChart.update();
        }

        // Actualizar gráfico de usuarios
        if (usersChart) {
            usersChart.options.scales.x.grid.color = gridColor;
            usersChart.options.scales.x.ticks.color = textColor;
            usersChart.options.scales.y.grid.color = gridColor;
            usersChart.options.scales.y.ticks.color = textColor;
            
            usersChart.data.datasets[0].borderColor = primaryColor;
            usersChart.data.datasets[0].pointBackgroundColor = primaryColor;
            usersChart.data.datasets[0].backgroundColor = `rgba(${hexToRgb(primaryColor)}, 0.1)`;
            
            usersChart.update();
        }
    }

    /**
     * Expande o contrae todos los controles de acción
     */
    function toggleExpandAllActions() {
        const actionControls = document.querySelectorAll('.action-control');
        const expandButton = document.getElementById('expandAllActions');
        
        // Verificar si algún control está colapsado
        const anyCollapsed = Array.from(actionControls).some(control => 
            control.classList.contains('collapsed')
        );
        
        // Expandir todos si hay alguno colapsado, colapsar todos si no
        actionControls.forEach(control => {
            if (anyCollapsed) {
                control.classList.remove('collapsed');
            } else {
                control.classList.add('collapsed');
            }
        });
        
        // Actualizar icono del botón
        if (expandButton) {
            if (anyCollapsed) {
                expandButton.innerHTML = '<i class="fas fa-angle-double-up"></i>';
                expandButton.setAttribute('title', 'Colapsar todos los controles');
            } else {
                expandButton.innerHTML = '<i class="fas fa-angle-double-down"></i>';
                expandButton.setAttribute('title', 'Expandir todos los controles');
            }
        }
    }

    /**
     * Alterna el modo pantalla completa para un elemento
     * @param {HTMLElement} element - Elemento a mostrar en pantalla completa
     */
    function toggleFullscreen(element) {
        if (!element) return;

        if (!document.fullscreenElement) {
            if (element.requestFullscreen) {
                element.requestFullscreen();
            } else if (element.mozRequestFullScreen) { // Firefox
                element.mozRequestFullScreen();
            } else if (element.webkitRequestFullscreen) { // Chrome, Safari y Opera
                element.webkitRequestFullscreen();
            } else if (element.msRequestFullscreen) { // IE/Edge
                element.msRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        }
    }

    /**
     * Convierte un color hexadecimal a formato RGB
     * @param {string} hex - Color en formato hexadecimal
     * @returns {string} - Color en formato RGB (r,g,b)
     */
    function hexToRgb(hex) {
        // Remover # si existe
        hex = hex.replace('#', '');

        // Convertir formato corto (3 dígitos) a formato largo (6 dígitos)
        if (hex.length === 3) {
            hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        }

        // Convertir a valores RGB
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);

        return `${r}, ${g}, ${b}`;
    }

    /**
     * Formatea una hora para mostrarla en la interfaz
     * @param {Date} date - Fecha a formatear
     * @returns {string} - Hora formateada
     */
    function formatTime(date) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    /**
     * Formatea una duración en milisegundos a formato legible
     * @param {number} ms - Duración en milisegundos
     * @returns {string} - Duración formateada
     */
    function formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours} ${hours === 1 ? 'hora' : 'horas'}`;
        } else if (minutes > 0) {
            return `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
        } else {
            return `${seconds} ${seconds === 1 ? 'segundo' : 'segundos'}`;
        }
    }
});

// Asignar un ID de usuario al cargar la página
window.userId = 'usuario_' + Math.random().toString(36).substring(2, 8);

// Estilos CSS para notificaciones minimales
document.head.insertAdjacentHTML('beforeend', `
<style>
.minimal-notifications-container {
    position: fixed;
    bottom: 20px;
    left: 20px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 10px;
    pointer-events: none;
}

.minimal-notification {
    background-color: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 12px;
    max-width: 300px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.3s ease, transform 0.3s ease;
    pointer-events: none;
}

.minimal-notification.active {
    opacity: 1;
    transform: translateY(0);
}

.minimal-notification.fade-out {
    opacity: 0;
    transform: translateY(-20px);
}
</style>
`);