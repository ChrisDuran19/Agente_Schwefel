/**
 * Sistema de contador de usuarios en tiempo real
 * Integración con Socket.io para el simulador de Interacción Agente-Ambiente
 * Versión optimizada para solucionar problemas de conexión
 * 
 * @author Cristian David Duran
 * @version 1.3.0
 */

// Variables globales
let reconnectAttempts = 0;
let isConnected = false;
let pendingReconnect = false;
let connectionTimeout = null;
let userId = null;
let socketUrl = null; // Para almacenar la URL del servidor Socket.io

// Inicializar al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
    // Generar ID de usuario
    userId = generateUserId();
    
    // Determinar automáticamente la URL del servidor de Socket.io
    detectServerUrl();
    
    // Inicializar Socket.io con configuración optimizada
    initializeSocketIO();

    // Inicializar contadores y UI
    initializeUI();
});

/**
 * Detecta automáticamente la URL del servidor Socket.io
 * Esto resuelve problemas con ngrok y CORS
 */
function detectServerUrl() {
    // Por defecto, usamos la misma URL del host actual
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    const host = window.location.hostname;
    const port = window.location.port || (protocol === 'https:' ? '443' : '80');
    
    // Construir URL base
    socketUrl = `${protocol}//${host}${port !== '80' && port !== '443' ? `:${port}` : ''}`;
    
    console.log(`⚡ Socket.io - Usando servidor: ${socketUrl}`);
    
    // Si estamos en un entorno de desarrollo local, podemos usar esto
    if (host === 'localhost' || host === '127.0.0.1') {
        socketUrl = `${protocol}//${host}:3000`; // Puerto por defecto para desarrollo
    }
}

/**
 * Inicializa la conexión Socket.io con configuración optimizada
 */
function initializeSocketIO() {
    try {
        console.log('⚡ Socket.io - Intentando conectar a:', socketUrl);
        
        // Crear instancia de socket.io con opciones robustas
        window.socket = io(socketUrl, {
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000,
            autoConnect: true,
            transports: ['websocket', 'polling'],
            forceNew: true,
            // Añadimos parámetros de consulta para ayudar con la identificación
            query: {
                clientId: userId,
                timestamp: Date.now()
            }
        });

        // Configurar listeners de Socket.io
        setupSocketListeners();
        
        console.log('⚡ Socket.io - Objeto socket inicializado');
    } catch (error) {
        console.error('⚠️ Error al inicializar Socket.io:', error);
        showConnectionStatus(false);
        showNotification('Error de conexión', 'No se pudo inicializar la conexión en tiempo real', 'error');
    }
}

/**
 * Configura los event listeners de Socket.io
 */
function setupSocketListeners() {
    const socket = window.socket;

    // Evento de conexión exitosa
    socket.on('connect', () => {
        console.log('✓ Conectado al servidor de usuarios en tiempo real');
        isConnected = true;
        reconnectAttempts = 0;
        pendingReconnect = false;
        
        clearTimeout(connectionTimeout);
        
        // Limpiar cualquier mensaje de reconexión
        clearReconnectionMessages();
        
        // Notificar conexión al servidor
        socket.emit('userConnected', { 
            userId: userId,
            time: formatTime(new Date()),
            clientInfo: {
                browser: navigator.userAgent,
                screen: `${window.innerWidth}x${window.innerHeight}`,
                url: window.location.href
            }
        });
        
        // Solicitar datos iniciales
        socket.emit('requestUserStats');
        socket.emit('requestActiveUsers');
        
        // Mostrar notificación de conexión
        showConnectionNotification(true);
    });

    // Evento de desconexión
    socket.on('disconnect', (reason) => {
        console.log(`Desconectado del servidor: ${reason}`);
        isConnected = false;
        handleDisconnection(reason);
    });

    // Evento de error de conexión
    socket.on('connect_error', (error) => {
        console.error('Error de conexión:', error.message);
        isConnected = false;
        
        if (!pendingReconnect) {
            pendingReconnect = true;
            handleReconnection();
        }
    });

    // Eventos de datos
    socket.on('userCount', updateUserCount);
    socket.on('userStats', updateUserStats);
    socket.on('userActivity', addActivityEvent);
    socket.on('activeUsers', updateActiveUsersList);
    socket.on('userHistory', updateUserChart);
    socket.on('newRecommendation', handleNewRecommendation);
    socket.on('connectionStatus', handleConnectionStatus);
    socket.on('pong', handlePong);
    socket.on('serverPing', handleServerPing);
    
    // Eventos de estado
    socket.on('stateUpdate', handleStateUpdate);
    socket.on('serverShutdown', handleServerShutdown);
    
    // ¡NUEVO! - Evento para verificar conexión
    socket.io.on('reconnect_attempt', (attempt) => {
        console.log(`Intento de reconexión #${attempt}`);
        showReconnectionMessage(attempt);
    });
    
    // ¡NUEVO! - Evento para reconexión exitosa
    socket.io.on('reconnect', (attemptNumber) => {
        console.log(`Reconectado después de ${attemptNumber} intentos`);
        showNotification('Reconectado', 'Conexión restablecida con el servidor', 'success');
    });
}

/**
 * Inicializa la interfaz de usuario
 */
function initializeUI() {
    // Mostrar cargando en contadores
    updateLoadingState(true);
    
    // Configurar event listeners
    setupEventListeners();
    
    // Inicializar gráfico
    initializeChart();
    
    // Iniciar monitoreo de conexión
    startConnectionMonitoring();
    
    // ¡NUEVO! - Mostrar versión del contador
    console.log('🔢 Contador de usuarios v1.3.0 inicializado');
}

/**
 * Configura event listeners de la UI
 */
function setupEventListeners() {
    // Botón de estadísticas
    const showStatsBtn = document.getElementById('showUsersStats');
    const closeStatsBtn = document.getElementById('closeUsersModal');
    const usersModal = document.getElementById('usersModal');
    
    if (showStatsBtn && usersModal) {
        showStatsBtn.addEventListener('click', () => {
            usersModal.classList.remove('hidden');
            // Solicitar datos actualizados
            if (isConnected) {
                window.socket.emit('requestUserStats');
                window.socket.emit('requestActiveUsers');
            } else {
                showNotification('No conectado', 'No hay conexión con el servidor. Intentando reconectar...', 'warning');
                attemptReconnection();
            }
        });
    }
    
    if (closeStatsBtn && usersModal) {
        closeStatsBtn.addEventListener('click', () => {
            usersModal.classList.add('hidden');
        });
    }
    
    // Cerrar modal al hacer clic fuera
    if (usersModal) {
        window.addEventListener('click', (e) => {
            if (e.target === usersModal) {
                usersModal.classList.add('hidden');
            }
        });
    }

    // Throttle para eventos de slider
    const actionSliders = document.querySelectorAll('.action-slider');
    if (actionSliders.length > 0) {
        actionSliders.forEach(slider => {
            // Usar solo el evento 'change' para emitir cuando el usuario suelta el slider
            slider.addEventListener('change', (event) => {
                emitUserAction('slider', {
                    id: event.target.id,
                    value: event.target.value
                });
            });
            
            // Opcionalmente, usar throttle para eventos durante el arrastre
            const throttledEmit = throttle((event) => {
                // Solo emitir si hay cambios significativos
                emitUserAction('slider', {
                    id: event.target.id,
                    value: event.target.value
                });
            }, 300); // Limitar a una vez cada 300ms
            
            slider.addEventListener('input', throttledEmit);
        });
    }
    
    // Botones de acción
    const actionButtons = document.querySelectorAll('#enviar, #showStats, .action-button');
    if (actionButtons.length > 0) {
        actionButtons.forEach(button => {
            button.addEventListener('click', () => {
                emitUserAction('button', {
                    id: button.id || 'generic-button'
                });
            });
        });
    }
    
    // Botón de reconexión manual (si existe)
    const reconnectBtn = document.getElementById('reconnectButton');
    if (reconnectBtn) {
        reconnectBtn.addEventListener('click', () => {
            if (!isConnected) {
                attemptReconnection();
            }
        });
    }
    
    // ¡NUEVO! - Crear botón de reconexión si no existe
    else {
        createReconnectButton();
    }
}

/**
 * ¡NUEVO! - Crea un botón de reconexión flotante
 */
function createReconnectButton() {
    // Crear solo si no existe
    if (document.getElementById('reconnectButton')) return;
    
    const btn = document.createElement('button');
    btn.id = 'reconnectButton';
    btn.className = 'reconnect-button hidden';
    btn.innerHTML = '<i class="fas fa-plug"></i> Reconectar';
    
    btn.addEventListener('click', () => {
        if (!isConnected) {
            attemptReconnection();
        }
    });
    
    document.body.appendChild(btn);
}

/**
 * Maneja mensajes de estado del servidor
 */
function handleStateUpdate(update) {
    if (!update || !update.type) return;
    
    // Procesar según tipo
    switch(update.type) {
        case 'recommendation':
            handleNewRecommendation(update.data);
            break;
        case 'userAction':
            // Procesar acciones de otros usuarios si es necesario
            break;
        case 'systemMessage':
            showNotification(update.data.message, update.data.level || 'info');
            break;
    }
}

/**
 * Maneja recomendaciones recibidas
 */
function handleNewRecommendation(data) {
    // Delegar al simulador principal si existe
    if (window.simuladorFunctions && typeof window.simuladorFunctions.processNewRecommendation === 'function') {
        window.simuladorFunctions.processNewRecommendation(data);
    }
}

/**
 * Maneja la desconexión del servidor
 */
function handleDisconnection(reason) {
    // Mostrar UI de desconexión
    showConnectionStatus(false);
    
    // Si no es una desconexión intencional, intentar reconectar
    if (reason !== 'io client disconnect' && reason !== 'io server disconnect') {
        if (!pendingReconnect) {
            pendingReconnect = true;
            handleReconnection();
        }
    }
    
    // ¡NUEVO! - Mostrar botón de reconexión manual
    const reconnectBtn = document.getElementById('reconnectButton');
    if (reconnectBtn) {
        reconnectBtn.classList.remove('hidden');
    }
}

/**
 * Gestiona la reconexión automática
 */
function handleReconnection() {
    reconnectAttempts++;
    
    // Limitar intentos
    if (reconnectAttempts > 10) {
        showNotification('Demasiados intentos de reconexión. Por favor, recarga la página.', 'error');
        return;
    }
    
    // Mostrar mensaje
    showReconnectionMessage(reconnectAttempts);
    
    // Esperar y reconectar
    const delay = Math.min(1000 * reconnectAttempts, 5000);
    
    clearTimeout(connectionTimeout);
    connectionTimeout = setTimeout(() => {
        attemptReconnection();
    }, delay);
}

/**
 * Intenta reconectar al servidor
 */
function attemptReconnection() {
    showNotification('Intentando reconectar...', 'info');
    
    if (!isConnected) {
        try {
            // Asegurarse que el socket existe
            if (!window.socket || window.socket.disconnected) {
                if (window.socket) {
                    window.socket.connect();
                } else {
                    // Reinicializar completamente
                    initializeSocketIO();
                }
            }
        } catch (error) {
            console.error('Error al reconectar:', error);
            // Reintentar después
            setTimeout(attemptReconnection, 3000);
        }
    }
}

/**
 * Muestra el estado de conexión en la UI
 */
function showConnectionStatus(connected) {
    const statusElement = document.getElementById('connectionStatus');
    if (statusElement) {
        if (connected) {
            statusElement.className = 'connection-status connected';
            statusElement.innerHTML = '<i class="fas fa-plug"></i> Conectado';
        } else {
            statusElement.className = 'connection-status disconnected';
            statusElement.innerHTML = '<i class="fas fa-plug-circle-exclamation"></i> Desconectado';
        }
    }
    
    // ¡NUEVO! - También actualizar la clase del botón de reconexión
    const reconnectBtn = document.getElementById('reconnectButton');
    if (reconnectBtn) {
        if (connected) {
            reconnectBtn.classList.add('hidden');
        } else {
            reconnectBtn.classList.remove('hidden');
        }
    }
}

/**
 * Muestra un mensaje de reconexión
 */
function showReconnectionMessage(attempt) {
    // Buscar o crear el contenedor de mensajes
    let container = document.getElementById('reconnectionMessages');
    if (!container) {
        container = document.createElement('div');
        container.id = 'reconnectionMessages';
        container.className = 'reconnection-messages';
        document.body.appendChild(container);
    }
    
    // Añadir mensaje
    const message = document.createElement('div');
    message.className = 'reconnection-message';
    message.innerHTML = `Intento de reconexión ${attempt}/10...`;
    
    // Reemplazar mensajes anteriores
    container.innerHTML = '';
    container.appendChild(message);
}

/**
 * Limpia los mensajes de reconexión
 */
function clearReconnectionMessages() {
    const container = document.getElementById('reconnectionMessages');
    if (container) {
        container.innerHTML = '';
    }
}

/**
 * Muestra una notificación
 * @param {string} message - Mensaje
 * @param {string} type - Tipo (success, error, info, warning)
 */
function showNotification(message, type = 'info') {
    // Buscar o crear el contenedor
    let container = document.getElementById('notificationContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notificationContainer';
        container.className = 'notification-container';
        document.body.appendChild(container);
    }
    
    // Crear notificación
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    // Determinar icono
    let icon = 'info-circle';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'exclamation-circle';
    if (type === 'warning') icon = 'exclamation-triangle';
    
    notification.innerHTML = `
        <div class="notification-icon">
            <i class="fas fa-${icon}"></i>
        </div>
        <div class="notification-content">
            <p>${message}</p>
        </div>
        <button class="notification-close">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    container.appendChild(notification);
    
    // Añadir evento para cerrar
    const closeBtn = notification.querySelector('.notification-close');
    closeBtn.addEventListener('click', () => {
        notification.classList.add('notification-hiding');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    });
    
    // Auto-cerrar después de 5 segundos
    setTimeout(() => {
        if (notification.parentNode) {
            notification.classList.add('notification-hiding');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }
    }, 5000);
}

/**
 * Muestra notificación de conexión exitosa
 */
function showConnectionNotification(connected) {
    if (connected) {
        showNotification('Conectado al servidor en tiempo real', 'success');
    } else {
        showNotification('Desconectado del servidor', 'error');
    }
}

/**
 * Actualiza el contador de usuarios
 */
function updateUserCount(count) {
    const usersOnlineCounter = document.getElementById('usersOnline');
    const footerUsersCount = document.getElementById('footerUsersCount');
    const currentUsersElement = document.getElementById('currentUsers');
    
    // Función para aplicar animación
    const updateElement = (element, value) => {
        if (!element) return;
        
        // Añadir clase de pulso si el valor cambia
        const currentValue = parseInt(element.textContent);
        if (!isNaN(currentValue) && currentValue !== value) {
            element.classList.add('pulse');
            setTimeout(() => {
                element.classList.remove('pulse');
            }, 1000);
        }
        
        // Actualizar valor
        element.textContent = value;
    };
    
    // Actualizar elementos
    updateElement(usersOnlineCounter, count);
    updateElement(footerUsersCount, count);
    updateElement(currentUsersElement, count);
    
    // Actualizar título
    document.title = `(${count}) Simulador Agente-Ambiente`;
    
    // Debug
    console.log(`📊 Usuarios conectados: ${count}`);
}

/**
 * Actualiza estadísticas de usuarios
 */
function updateUserStats(stats) {
    // Salir si no hay datos
    if (!stats) return;
    
    const todayUsersElement = document.getElementById('todayUsers');
    const totalUsersElement = document.getElementById('totalUsers');
    
    // Actualizar contadores
    if (todayUsersElement) todayUsersElement.textContent = stats.today;
    if (totalUsersElement) totalUsersElement.textContent = stats.total;
    
    // Actualizar historial
    if (stats.history && stats.history.length > 0) {
        updateUserChart(stats.history);
    }
    
    // Actualizar actividad
    const userActivityList = document.getElementById('userActivity');
    if (userActivityList && stats.activity && stats.activity.length > 0) {
        // Limpiar lista actual
        userActivityList.innerHTML = '';
        
        // Añadir actividades al historial
        stats.activity.forEach(activity => {
            addActivityEvent(activity, false); // Sin animación
        });
    }
    
    // Ya no estamos cargando
    updateLoadingState(false);
    
    // Debug
    console.log('📊 Estadísticas actualizadas:', stats);
}

/**
 * Actualiza la lista de usuarios activos
 */
function updateActiveUsersList(users) {
    const activeUsersList = document.getElementById('activeUsersList');
    if (!activeUsersList) return;
    
    // Limpiar lista
    activeUsersList.innerHTML = '';
    
    // Si no hay usuarios
    if (!users || users.length === 0) {
        const emptyItem = document.createElement('li');
        emptyItem.className = 'active-user-item empty';
        emptyItem.textContent = 'No hay usuarios conectados';
        activeUsersList.appendChild(emptyItem);
        return;
    }
    
    // Añadir cada usuario
    users.forEach(user => {
        const listItem = document.createElement('li');
        listItem.className = 'active-user-item';
        
        // Destacar usuario actual
        if (user.id && userId && user.id.includes(userId.substring(0, 8))) {
            listItem.classList.add('current-user');
        }
        
        // Calcular tiempo de conexión
        let timeInfo = '';
        if (user.connectTime) {
            const connectDate = new Date(user.connectTime);
            const now = new Date();
            const diffMinutes = Math.floor((now - connectDate) / (1000 * 60));
            
            if (diffMinutes < 60) {
                timeInfo = `hace ${diffMinutes} min`;
            } else {
                const diffHours = Math.floor(diffMinutes / 60);
                timeInfo = `hace ${diffHours} h`;
            }
        }
        
        listItem.innerHTML = `
            <div class="user-icon">
                <i class="fas fa-user-circle"></i>
            </div>
            <div class="user-details">
                <span class="user-id">${user.id || 'Usuario'}</span>
                <span class="user-time">${timeInfo}</span>
            </div>
        `;
        
        activeUsersList.appendChild(listItem);
    });
    
    // Mostrar contador
    const userCountElement = document.querySelector('.active-users-header .count');
    if (userCountElement) {
        userCountElement.textContent = users.length;
    }
    
    // Debug
    console.log(`📊 Lista de usuarios actualizada: ${users.length} usuarios`);
}

/**
 * Añade un evento de actividad a la lista
 */
function addActivityEvent(event, animate = true) {
    const userActivityList = document.getElementById('userActivity');
    if (!userActivityList || !event) return;
    
    const listItem = document.createElement('li');
    listItem.className = 'activity-item';
    
    if (animate) {
        listItem.classList.add('new-activity');
        
        // Quitar animación después de un tiempo
        setTimeout(() => {
            listItem.classList.remove('new-activity');
        }, 2000);
    }
    
    // Determinar icono y acción
    let icon = 'user';
    let action = 'acción desconocida';
    
    switch (event.type) {
        case 'connect':
            icon = 'sign-in-alt';
            action = 'se ha conectado';
            break;
        case 'disconnect':
            icon = 'sign-out-alt';
            action = 'se ha desconectado';
            break;
        case 'slider':
            icon = 'sliders-h';
            action = 'ajustó parámetros';
            break;
        case 'button':
            icon = 'mouse-pointer';
            action = 'pulsó un botón';
            break;
        case 'recommendation':
            icon = 'star';
            action = 'envió una recomendación';
            break;
    }
    
    // Verificar si es el usuario actual
    const isCurrentUser = event.userId && userId && event.userId.includes(userId.substring(0, 8));
    const userClass = isCurrentUser ? 'activity-user current-user' : 'activity-user';
    
    listItem.innerHTML = `
        <div class="activity-icon">
            <i class="fas fa-${icon}"></i>
        </div>
        <div class="activity-details">
            <span class="${userClass}">Usuario ${event.userId || 'desconocido'}</span>
            <span class="activity-action">${action}</span>
            <span class="activity-time">${event.time || formatTime(new Date())}</span>
        </div>
    `;
    
    // Añadir al inicio
    userActivityList.insertBefore(listItem, userActivityList.firstChild);
    
    // Limitar a 10 eventos
    while (userActivityList.children.length > 10) {
        userActivityList.removeChild(userActivityList.lastChild);
    }
    
    // Notificar al simulador si es necesario y es un evento nuevo
    if (animate && window.simuladorFunctions) {
        if (event.type === 'connect' && !isCurrentUser) {
            if (typeof window.simuladorFunctions.notifyNewConnection === 'function') {
                window.simuladorFunctions.notifyNewConnection(event.userId);
            }
        } else if (event.type === 'recommendation' && !isCurrentUser) {
            if (typeof window.simuladorFunctions.notifyNewRecommendation === 'function') {
                window.simuladorFunctions.notifyNewRecommendation(event.userId);
            }
        }
    }
}

/**
 * Inicializa el gráfico de usuarios
 */
function initializeChart() {
    const ctx = document.getElementById('usersChart');
    if (!ctx) return;
    
    // Verificar si Chart.js está disponible
    if (typeof Chart === 'undefined') {
        console.error('Chart.js no está disponible. Asegúrate de incluir la biblioteca Chart.js.');
        return;
    }
    
    // Configuración inicial
    window.usersChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Usuarios conectados',
                data: [],
                backgroundColor: 'rgba(79, 70, 229, 0.2)',
                borderColor: 'rgba(79, 70, 229, 1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: 'rgba(79, 70, 229, 1)',
                pointRadius: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            return `Usuarios: ${context.raw}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0
                    }
                },
                x: {
                    ticks: {
                        maxRotation: 0
                    }
                }
            },
            animation: {
                duration: 1000,
                easing: 'easeOutQuart'
            }
        }
    });
}

/**
 * Actualiza el gráfico con nuevos datos
 */
function updateUserChart(historyData) {
    if (!window.usersChart || !historyData) return;
    
    // Extraer datos
    const labels = historyData.map(item => item.time);
    const data = historyData.map(item => item.count);
    
    // Actualizar gráfico
    window.usersChart.data.labels = labels;
    window.usersChart.data.datasets[0].data = data;
    window.usersChart.update();
}

/**
 * Maneja el estado de conexión recibido del servidor
 */
function handleConnectionStatus(status) {
    if (status && status.connected) {
        isConnected = true;
        showConnectionStatus(true);
    } else {
        isConnected = false;
        showConnectionStatus(false);
    }
}

/**
 * Maneja respuesta de ping del servidor
 */
function handlePong(data) {
    // Actualizar último ping
    window.lastPongTime = Date.now();
    
    // Actualizar contador si viene incluido
    if (data && typeof data.activeUsers === 'number') {
        updateUserCount(data.activeUsers);
    }
}/**
 * Maneja ping del servidor
 */
function handleServerPing(data) {
    // Responder para mantener conexión
    if (window.socket && isConnected) {
        window.socket.emit('pong', { 
            userId: userId, 
            timestamp: new Date().toISOString()
        });
    }
}

/**
 * Maneja mensaje de cierre del servidor
 */
function handleServerShutdown(data) {
    showNotification(data.message || 'El servidor está cerrando. Por favor, espere un momento.', 'warning');
    isConnected = false;
    showConnectionStatus(false);
}

/**
 * Inicia monitoreo de conexión
 */
function startConnectionMonitoring() {
    // Ping regular
    setInterval(() => {
        if (window.socket && isConnected) {
            window.socket.emit('ping', { 
                userId: userId,
                timestamp: new Date().toISOString()
            });
        }
    }, 30000);
    
    // Verificar estado de conexión
    setInterval(() => {
        const now = Date.now();
        const lastPong = window.lastPongTime || 0;
        
        // Si hace más de 2 minutos que no recibimos respuesta y creemos que estamos conectados
        if (isConnected && (now - lastPong) > 120000) {
            console.log('Sin respuesta del servidor por 2 minutos, intentando reconectar');
            isConnected = false;
            showConnectionStatus(false);
            
            // NUEVO: Mostrar mensaje en la interfaz
            showNotification('Conexión perdida', 'No se ha recibido respuesta del servidor. Reconectando...', 'warning');
            
            attemptReconnection();
        }
    }, 60000);
    
    // Solicitar actualizaciones periódicas
    setInterval(() => {
        if (isConnected) {
            // Solicitar estado cada 30 segundos
            window.socket.emit('requestActiveUsers');
        }
    }, 30000);
}

/**
 * Actualiza el estado de carga en la UI
 */
function updateLoadingState(loading) {
    const elements = [
        document.getElementById('currentUsers'),
        document.getElementById('todayUsers'),
        document.getElementById('totalUsers')
    ];
    
    elements.forEach(el => {
        if (el) {
            if (loading) {
                el.classList.add('loading');
                el.textContent = '...';
            } else {
                el.classList.remove('loading');
            }
        }
    });
}

/**
 * Genera un ID único para el usuario
 */
function generateUserId() {
    const timestamp = new Date().getTime().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 8);
    return `${timestamp}-${randomStr}`;
}

/**
 * Emite acción de usuario
 */
function emitUserAction(actionType, payload = {}) {
    // Si no estamos conectados, intentar reconectar
    if (!isConnected) {
        // Evitar múltiples intentos de reconexión
        if (!window.reconnectInProgress) {
            window.reconnectInProgress = true;
            
            // Mostrar mensaje una sola vez
            showNotification('Reconectando al servidor...', 'info');
            
            // Intentar reconectar
            attemptReconnection();
            
            // Restablecer flag después de un tiempo
            setTimeout(() => {
                window.reconnectInProgress = false;
            }, 5000);
        }
        return;
    }
    
    // Solo si estamos conectados
    window.socket.emit('userAction', {
        type: actionType,
        userId: userId,
        time: formatTime(new Date()),
        timestamp: new Date().toISOString(),
        payload: payload
    });
}

/**
 * Formatea tiempo para mostrar
 */
function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Función de throttle para limitar frecuencia de eventos
 */
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * NUEVO: Comprueba si el servidor está disponible
 */
function checkServerAvailability() {
    return new Promise((resolve, reject) => {
        // Hacer petición simple para verificar si el servidor responde
        fetch(socketUrl, { 
            method: 'HEAD',
            cache: 'no-cache',
            mode: 'no-cors'
        })
        .then(() => {
            console.log('✓ Servidor disponible');
            resolve(true);
        })
        .catch(error => {
            console.error('✗ Servidor no disponible:', error);
            reject(error);
        });
    });
}

/**
 * NUEVO: Agrega estilos CSS necesarios para los elementos creados dinámicamente
 */
function injectStyles() {
    // Evitar duplicados
    if (document.getElementById('users-counter-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'users-counter-styles';
    style.innerHTML = `
        .reconnect-button {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #4f46e5;
            color: white;
            border: none;
            border-radius: 8px;
            padding: 10px 15px;
            font-size: 14px;
            cursor: pointer;
            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
            z-index: 1000;
            transition: all 0.3s;
        }
        .reconnect-button:hover {
            background: #4338ca;
        }
        .reconnect-button.hidden {
            transform: translateY(100px);
            opacity: 0;
            pointer-events: none;
        }
        .reconnection-messages {
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 10px 15px;
            border-radius: 8px;
            font-size: 14px;
            z-index: 1000;
        }
        .connection-status {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 5px 10px;
            border-radius: 50px;
            font-size: 12px;
            font-weight: 500;
        }
        .connection-status.connected {
            background: rgba(34, 197, 94, 0.1);
            color: #16a34a;
        }
        .connection-status.disconnected {
            background: rgba(239, 68, 68, 0.1);
            color: #dc2626;
        }
    `;
    
    document.head.appendChild(style);
}

/**
 * NUEVO: Agrega un indicador de estado de conexión en la interfaz
 */
function addConnectionIndicator() {
    // Evitar duplicados
    if (document.getElementById('connectionStatus')) return;
    
    // Buscar lugar adecuado para el indicador
    let container = document.querySelector('.header-actions');
    if (!container) {
        container = document.querySelector('.app-header') || document.body;
    }
    
    const indicator = document.createElement('div');
    indicator.id = 'connectionStatus';
    indicator.className = 'connection-status disconnected';
    indicator.innerHTML = '<i class="fas fa-plug-circle-exclamation"></i> Desconectado';
    
    container.prepend(indicator);
}

/**
 * Exportar funciones para uso desde otros scripts
 */
window.userRealtime = {
    emitUserAction: emitUserAction,
    isConnected: () => isConnected,
    getUserId: () => userId,
    showNotification: showNotification,
    reconnect: attemptReconnection
};

/**
 * Manejador de cierre de ventana
 */
window.addEventListener('beforeunload', () => {
    // Notificar al servidor que estamos cerrando
    if (window.socket && isConnected) {
        window.socket.emit('userLeaving', {
            userId: userId,
            timestamp: new Date().toISOString()
        });
    }
});