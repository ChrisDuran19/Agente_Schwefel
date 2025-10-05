/**
 * Servidor para la aplicación Simulador de Interacción Agente-Ambiente
 * Implementado con Express, Socket.io y MySQL
 * 
 * @author Cristian David Duran
 * @version 3.0.0
 */

'use strict';

// Importación de dependencias
const express = require('express');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io'); // Cambiado para mejorar compatibilidad
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Configuración de variables de entorno
const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = process.env.PORT || 3000;
const DB_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'Kotik2020',
    database: process.env.DB_NAME || 'perception_db',
};

// Inicialización de la aplicación
const app = express();
const server = http.createServer(app);

// Inicialización de Socket.io con configuración mejorada para CORS y ngrok
const io = socketIo(server, {
    cors: {
        origin: '*', // Permite cualquier origen
        methods: ['GET', 'POST'],
        credentials: true
    },
    transports: ['websocket', 'polling'], // Soporta ambos transportes
    allowEIO3: true, // Compatibilidad con Engine.IO 3
    pingTimeout: 60000, // Aumentar timeout para conexiones lentas
    pingInterval: 25000, // Intervalo de ping
    connectTimeout: 45000, // Timeout de conexión
    maxHttpBufferSize: 1e8 // Aumentar tamaño del buffer para evitar desconexiones por eventos frecuentes
});

// Configuración del pool de conexiones MySQL con manejo optimizado
const pool = mysql.createPool({
    ...DB_CONFIG,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 30000, // 30 segundos
    maxIdle: 10,
    idleTimeout: 60000, // 60 segundos
    connectTimeout: 10000, // 10 segundos
    dateStrings: true, // Para manejar fechas como strings
    multipleStatements: false, // Por seguridad
    namedPlaceholders: true // Soporte para placeholders nombrados
});

// Estadísticas de usuarios en tiempo real
const userStats = {
    currentUsers: 0,
    todayUsers: 0,
    totalUsers: new Set(),
    history: [],
    activity: [],
    // Añadir objeto para almacenar datos de sesión activa
    activeUsers: new Map(), // Mapa para almacenar datos de usuario activo por socketId
    // Registro de la última vez que se emitió un evento por socket
    lastEmitTime: new Map() // Para limitar frecuencia de eventos
};

// Middleware de seguridad y optimización
app.use(helmet({ 
    contentSecurityPolicy: false // Desactivar CSP para permitir Socket.io y CDNs
}));
app.use(compression()); // Comprimir respuestas
app.use(express.json({ limit: '1mb' })); // Limitar tamaño de payload
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Limitar peticiones a APIs para prevenir abuso
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // 100 peticiones por ventana
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        status: 'error',
        message: 'Demasiadas peticiones, por favor intente más tarde'
    }
});

// Middleware para logging de peticiones
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Configuración de archivos estáticos con caché optimizada
const staticOptions = {
    maxAge: '1d', // Cache de 1 día
    etag: true,
    lastModified: true
};

app.use('/static', express.static(path.join(__dirname, 'static'), staticOptions));
app.use('/static/css', express.static(path.join(__dirname, 'static/css'), staticOptions));
app.use('/static/js', express.static(path.join(__dirname, 'static/js'), staticOptions));
app.use('/static/img', express.static(path.join(__dirname, 'static/img'), { ...staticOptions, maxAge: '7d' })); // Caché más largo para imágenes

/**
 * Función para convertir timestamp ISO a formato MySQL
 * @param {string} isoTimestamp - Timestamp en formato ISO
 * @returns {string} - Timestamp formateado para MySQL
 */
function formatTimestampForMySQL(isoTimestamp) {
    try {
        const date = new Date(isoTimestamp);
        return date.toISOString().slice(0, 19).replace('T', ' ');
    } catch (error) {
        console.error('Error al formatear timestamp:', error);
        return new Date().toISOString().slice(0, 19).replace('T', ' ');
    }
}

/**
 * Función para throttle (limitar frecuencia de eventos)
 * @param {string} socketId - ID del socket
 * @param {string} eventType - Tipo de evento
 * @param {number} minIntervalMs - Intervalo mínimo entre eventos
 * @returns {boolean} - True si se debe limitar, False si se permite
 */
function shouldThrottleEvent(socketId, eventType, minIntervalMs = 300) {
    const now = Date.now();
    const lastEmitKey = `${socketId}:${eventType}`;
    const lastEmitTime = userStats.lastEmitTime.get(lastEmitKey) || 0;
    
    if (now - lastEmitTime < minIntervalMs) {
        return true; // Debería limitar
    }
    
    userStats.lastEmitTime.set(lastEmitKey, now);
    return false; // No limitar
}

// Rutas principales
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'index.html'));
});

// API para guardar recomendaciones (con limitador de peticiones)
app.post('/guardar-recomendacion', apiLimiter, async (req, res) => {
    // Añadir depuración detallada
    console.log("Payload recibido:", JSON.stringify(req.body, null, 2));
    console.log("Tipos de datos:", {
        percepcion: typeof req.body.percepcion,
        accion1: typeof req.body.accion1,
        accion2: typeof req.body.accion2,
        accion3: typeof req.body.accion3,
        accion4: typeof req.body.accion4
    });
    
    const { percepcion, accion1, accion2, accion3, accion4, timestamp } = req.body;

    // Validación de datos más permisiva
    if (
        percepcion === undefined || 
        accion1 === undefined || 
        accion2 === undefined || 
        accion3 === undefined || 
        accion4 === undefined
    ) {
        return res.status(400).json({
            status: 'error',
            message: 'Datos incompletos',
            details: 'Todos los campos son obligatorios'
        });
    }

    try {
        // Conversión mucho más tolerante
        const rawTimestamp = timestamp || new Date().toISOString();
        const mysqlTimestamp = formatTimestampForMySQL(rawTimestamp);
        
        const values = [
            parseFloat(String(accion1).replace(',', '.')),
            parseFloat(String(accion2).replace(',', '.')),
            parseFloat(String(accion3).replace(',', '.')),
            parseFloat(String(accion4).replace(',', '.')),
            parseFloat(String(percepcion).replace(',', '.')),
            mysqlTimestamp
        ];

        // Depurar valores convertidos
        console.log("Valores convertidos:", values);

        // Verificar NaN con mensaje detallado
        for (let i = 0; i < 5; i++) {
            if (isNaN(values[i])) {
                const fieldName = ['accion1', 'accion2', 'accion3', 'accion4', 'percepcion'][i];
                const originalValue = [accion1, accion2, accion3, accion4, percepcion][i];
                throw new Error(`El valor "${originalValue}" para ${fieldName} no es un número válido`);
            }
        }

        const query = `
            INSERT INTO recomendaciones 
            (accion1, accion2, accion3, accion4, percepcion, timestamp) 
            VALUES (?, ?, ?, ?, ?, ?)
        `;

        const [result] = await pool.execute(query, values);
        
        // Crear objeto de recomendación
        const recommendation = {
            id: result.insertId,
            percepcion: values[4],
            accion1: values[0],
            accion2: values[1],
            accion3: values[2],
            accion4: values[3],
            timestamp: rawTimestamp // Usamos el formato original para el cliente
        };

        // Notificar a todos los clientes Socket.io
        io.emit('newRecommendation', recommendation);
        
        // También emitir como actualización de estado general
        io.emit('stateUpdate', {
            type: 'recommendation',
            data: recommendation,
            timestamp: new Date().toISOString()
        });
        
        res.status(201).json({
            status: 'success',
            message: 'Recomendación guardada correctamente',
            data: {
                id: result.insertId
            }
        });
    } catch (error) {
        console.error('Error al guardar recomendación:', error);
        res.status(500).json({
            status: 'error',
            message: 'Error al guardar la recomendación',
            details: error.message
        });
    }
});

app.post('/guardar-recomendacion-simple', async (req, res) => {
    console.log("Intentando con endpoint simple:", req.body);
    
    // Solo almacena los valores exactamente como vienen, sin validación
    try {
        const currentTime = new Date().toISOString();
        const mysqlTimestamp = formatTimestampForMySQL(currentTime);
        
        const query = `
            INSERT INTO recomendaciones 
            (accion1, accion2, accion3, accion4, percepcion, timestamp) 
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        
        const [result] = await pool.execute(query, [
            0, 0, 0, 0, 0, mysqlTimestamp
        ]);
        
        // Notificar a todos los clientes mediante Socket.io
        io.emit('newRecommendation', {
            id: result.insertId,
            percepcion: 0,
            accion1: 0,
            accion2: 0,
            accion3: 0,
            accion4: 0,
            timestamp: currentTime
        });
        
        res.status(201).json({
            status: 'success',
            message: 'Test simple completado'
        });
    } catch (error) {
        console.error("Error incluso con valores fijos:", error);
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// API para obtener historial con soporte para paginación
app.get('/obtener-historial', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 100;
        const offset = (page - 1) * limit;

        // Consulta con paginación
        const [results] = await pool.query(
            'SELECT * FROM recomendaciones ORDER BY id DESC LIMIT ? OFFSET ?',
            [limit, offset]
        );

        // Consulta para obtener número total de registros
        const [countResult] = await pool.query('SELECT COUNT(*) as total FROM recomendaciones');
        const totalCount = countResult[0].total;

        res.status(200).json({
            status: 'success',
            data: results,
            pagination: {
                page,
                limit,
                totalPages: Math.ceil(totalCount / limit),
                totalCount
            }
        });
    } catch (error) {
        console.error('Error al recuperar historial:', error);
        res.status(500).json({
            status: 'error',
            message: 'Error al recuperar historial',
            details: NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Endpoint para estadísticas del sistema
app.get('/api/stats', async (req, res) => {
    try {
        const [results] = await pool.query(`
            SELECT 
                COUNT(*) as totalRecommendations,
                MIN(percepcion) as minPerception,
                MAX(percepcion) as maxPerception,
                AVG(percepcion) as avgPerception
            FROM recomendaciones
        `);

        res.status(200).json({
            status: 'success',
            data: {
                ...results[0],
                userStats: {
                    currentUsers: userStats.currentUsers,
                    todayUsers: userStats.todayUsers,
                    totalUniqueUsers: userStats.totalUsers.size
                }
            }
        });
    } catch (error) {
        console.error('Error al obtener estadísticas:', error);
        res.status(500).json({
            status: 'error',
            message: 'Error al obtener estadísticas',
            details: NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Endpoint de estado para monitoreo de salud
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        users: userStats.currentUsers
    });
});

// Configuración de Socket.io con manejo mejorado
io.on('connection', async (socket) => {
    try {
        // Asignar un ID único a la conexión
        socket.userId = uuidv4();
        
        // Guardar la IP del cliente para debugging
        const clientIp = socket.handshake.headers['x-forwarded-for'] || 
                        socket.handshake.address || 
                        'unknown';
        
        console.log(`Nueva conexión desde IP: ${clientIp}, Socket ID: ${socket.id}`);
                
        // Almacenar información de sesión
        userStats.activeUsers.set(socket.id, {
            userId: socket.userId,
            connectTime: new Date(),
            ip: clientIp,
            userAgent: socket.handshake.headers['user-agent'] || 'Unknown'
        });
        
        // Incrementar contadores de usuarios
        userStats.currentUsers++;
        userStats.todayUsers++;
        userStats.totalUsers.add(socket.userId);
        
        // Registrar actividad
        const connectionTime = new Date().toISOString();
        userStats.activity.unshift({
            type: 'connect',
            userId: socket.userId.substring(0, 8),
            time: formatTime(new Date()),
            timestamp: connectionTime
        });
        
        // Limitar el historial de actividad a 50 elementos
        if (userStats.activity.length > 50) {
            userStats.activity.pop();
        }
        
        // Actualizar historial de usuarios conectados
        updateUserHistory();
        
        console.log(`Cliente Socket.io conectado [${socket.userId}], Total: ${userStats.currentUsers}`);
        console.log(`Usuarios activos: ${Array.from(userStats.activeUsers.keys()).length}`);
        
        // Emitir a este cliente que está conectado correctamente
        socket.emit('connectionStatus', { 
            connected: true, 
            socketId: socket.id,
            userId: socket.userId
        });
        
        // Enviar contador actualizado a todos los clientes
        io.emit('userCount', userStats.currentUsers);
        
        // Enviar lista de usuarios activos a todos
        const activeUsersList = Array.from(userStats.activeUsers.values()).map(user => ({
            id: user.userId.substring(0, 8),
            connectTime: user.connectTime
        }));
        
        io.emit('activeUsers', activeUsersList);
        console.log(`Emitiendo lista de usuarios activos:`, activeUsersList);

        // Enviar estadísticas iniciales al cliente
        socket.emit('userStats', {
            current: userStats.currentUsers,
            today: userStats.todayUsers,
            total: userStats.totalUsers.size,
            history: userStats.history,
            activity: userStats.activity
        });

        // Cargar últimas recomendaciones y enviarlas al nuevo cliente
        try {
            const [latestRecommendations] = await pool.query(
                'SELECT * FROM recomendaciones ORDER BY id DESC LIMIT 10'
            );
            
            if (latestRecommendations && latestRecommendations.length > 0) {
                socket.emit('initialRecommendations', latestRecommendations);
            }
        } catch (error) {
            console.error('Error al cargar recomendaciones iniciales:', error);
        }

        // Manejar eventos de cliente
        socket.on('requestUserStats', () => {
            socket.emit('userStats', {
                current: userStats.currentUsers,
                today: userStats.todayUsers,
                total: userStats.totalUsers.size,
                history: userStats.history,
                activity: userStats.activity
            });
            
            // Enviar también la lista de usuarios activos
            socket.emit('activeUsers', Array.from(userStats.activeUsers.values()).map(user => ({
                id: (user.customId || user.userId).substring(0, 8),
                connectTime: user.connectTime
            })));
        });
        
        // Gestión mejorada de actions con throttling
        socket.on('userAction', (data) => {
            // Limitar frecuencia de eventos
            if (data.type === 'slider' && shouldThrottleEvent(socket.id, 'slider', 300)) {
                return; // Ignorar eventos muy frecuentes
            }
            
            handleUserAction(data, socket);
        });
        
        socket.on('userConnected', (data) => {
            if (data && data.userId) {
                socket.customId = data.userId;
                
                // Si hay información del cliente, guardarla
                if (data.clientInfo) {
                    console.log(`Info del cliente: ${JSON.stringify(data.clientInfo)}`);
                }
                
                // Actualizar información en el mapa de usuarios activos
                const userInfo = userStats.activeUsers.get(socket.id);
                if (userInfo) {
                    userInfo.customId = data.userId;
                    if (data.clientInfo) {
                        userInfo.clientInfo = data.clientInfo;
                    }
                    userStats.activeUsers.set(socket.id, userInfo);
                }
                
                // Notificar a todos los clientes sobre el cambio
                io.emit('activeUsers', Array.from(userStats.activeUsers.values()).map(user => ({
                    id: (user.customId || user.userId).substring(0, 8),
                    connectTime: user.connectTime
                })));
            }
        });
        
        socket.on('recommendation', async (data) => {
            if (data && data.percepcion) {
                await handleNewRecommendation(data);
            }
        });

        // Manejar ping/pong para mantener conexiones activas
        socket.on('ping', () => {
            socket.emit('pong', { 
                timestamp: new Date().toISOString(),
                activeUsers: userStats.currentUsers 
            });
        });
        
        // Manejar solicitud explícita de lista de usuarios
        socket.on('requestActiveUsers', () => {
            const activeUsersList = Array.from(userStats.activeUsers.values()).map(user => ({
                id: (user.customId || user.userId).substring(0, 8),
                connectTime: user.connectTime
            }));
            
            socket.emit('activeUsers', activeUsersList);
            console.log(`Enviando lista de usuarios activos por solicitud:`, activeUsersList);
        });

        // Manejar notificación de desconexión
        socket.on('userLeaving', (data) => {
            console.log(`Usuario notificando desconexión: ${data.userId || socket.userId}`);
        });

        // Manejar desconexión
        socket.on('disconnect', (reason) => {
            console.log(`Desconexión de cliente [${socket.id}], Razón: ${reason}`);
            
            userStats.currentUsers = Math.max(0, userStats.currentUsers - 1);
            
            // Eliminar del mapa de usuarios activos
            userStats.activeUsers.delete(socket.id);
            
            // Limpiar datos de throttling
            for (const key of userStats.lastEmitTime.keys()) {
                if (key.startsWith(`${socket.id}:`)) {
                    userStats.lastEmitTime.delete(key);
                }
            }
            
            // Registrar actividad de desconexión
            userStats.activity.unshift({
                type: 'disconnect',
                userId: (socket.customId || socket.userId).substring(0, 8),
                time: formatTime(new Date()),
                timestamp: new Date().toISOString(),
                reason: reason
            });
            
            // Actualizar contador para todos
            io.emit('userCount', userStats.currentUsers);
            
            // Actualizar lista de usuarios activos
            const activeUsersList = Array.from(userStats.activeUsers.values()).map(user => ({
                id: (user.customId || user.userId).substring(0, 8),
                connectTime: user.connectTime
            }));
            
            io.emit('activeUsers', activeUsersList);
            console.log(`Emitiendo lista actualizada tras desconexión:`, activeUsersList);
            
            console.log(`Cliente Socket.io desconectado [${socket.userId}], Restantes: ${userStats.currentUsers}`);
            
            // Actualizar historial
            updateUserHistory();
        });

    } catch (error) {
        console.error('Error en manejo de conexión Socket.io:', error);
    }
});

/**
 * Maneja acciones de usuario y las difunde
 * @param {Object} data - Datos de la acción
 * @param {Socket} socket - Socket del cliente
 */
function handleUserAction(data, socket) {
    try {
        // Registrar actividad
        const actionData = {
            type: data.type || 'action',
            userId: (data.userId || socket.customId || socket.userId).substring(0, 8),
            time: data.time || formatTime(new Date()),
            timestamp: new Date().toISOString(),
            data: data.payload || {}
        };
        
        userStats.activity.unshift(actionData);
        
        // Limitar el historial de actividad
        if (userStats.activity.length > 50) {
            userStats.activity.pop();
        }
        
        // Para eventos de slider, solo difundir ocasionalmente para reducir tráfico
        if (data.type === 'slider') {
            // Solo difundir actividad de slider cada cierto tiempo
            if (!shouldThrottleEvent(socket.id, 'broadcast_slider', 1000)) {
                io.emit('userActivity', actionData);
            }
        } else {
            // Para otros tipos de eventos, difundir siempre
            io.emit('userActivity', actionData);
        }
        
        // Difundir actualización de estado para todos los tipos excepto slider
        // (los sliders generan demasiados eventos)
        if (data.type !== 'slider' || !shouldThrottleEvent(socket.id, 'state_update', 2000)) {
            io.emit('stateUpdate', {
                type: 'userAction',
                data: actionData,
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        console.error('Error al manejar acción de usuario:', error);
    }
}

/**
 * Maneja una nueva recomendación desde Socket.io
 * @param {Object} data - Datos de la recomendación
 * @returns {Promise<boolean>} - True si se procesó correctamente
 */
async function handleNewRecommendation(data) {
    try {
        const { percepcion, accion1, accion2, accion3, accion4 } = data;
        
        if (!percepcion || !accion1 || !accion2 || !accion3 || !accion4) {
            throw new Error('Datos incompletos para recomendación');
        }
        
        const query = `
            INSERT INTO recomendaciones 
            (accion1, accion2, accion3, accion4, percepcion, timestamp) 
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        
        // Obtener timestamp actual y formatearlo para MySQL
        const currentTime = new Date().toISOString();
        const mysqlTimestamp = formatTimestampForMySQL(currentTime);
        
        const values = [
            Number(accion1),
            Number(accion2),
            Number(accion3),
            Number(accion4),
            Number(percepcion),
            mysqlTimestamp
        ];

        // Verificar NaN
        if (values.some(val => isNaN(val) || val === null)) {
            throw new Error('Los valores deben ser numéricos');
        }

        const [result] = await pool.execute(query, values);
        
        // Crear objeto de recomendación
        const recommendation = {
            id: result.insertId,
            percepcion: Number(percepcion),
            accion1: Number(accion1),
            accion2: Number(accion2),
            accion3: Number(accion3),
            accion4: Number(accion4),
            timestamp: currentTime // Usar formato ISO para el cliente
        };
        
        // Difundir a todos los clientes
        io.emit('newRecommendation', recommendation);
        
        // También emitir como actualización de estado general
        io.emit('stateUpdate', {
            type: 'recommendation',
            data: recommendation,
            timestamp: currentTime
        });
        
        return true;
    } catch (error) {
        console.error('Error al procesar recomendación Socket.io:', error);
        return false;
    }
}

// Verificar la tabla al iniciar el servidor
async function setupDatabase() {
    try {
        const conn = await pool.getConnection();
        
        // Verificar si la base de datos existe
        const [databases] = await conn.query(`
            SHOW DATABASES LIKE 'perception_db'
        `);
        
        // Si la base de datos no existe, crearla
        if (databases.length === 0) {
            console.log('Base de datos perception_db no encontrada, creándola...');
            await conn.query(`CREATE DATABASE IF NOT EXISTS perception_db`);
            console.log('Base de datos perception_db creada correctamente');
        }
        
        // Usar la base de datos
        await conn.query(`USE perception_db`);
        
        // Verificar si la tabla recomendaciones existe
        const [tables] = await conn.query(`
            SHOW TABLES LIKE 'recomendaciones'
        `);
        
        // Si la tabla no existe, crearla
        if (tables.length === 0) {
            console.log('Tabla recomendaciones no encontrada, creándola...');
            
            await conn.query(`
                CREATE TABLE IF NOT EXISTS recomendaciones (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    accion1 FLOAT NOT NULL,
                    accion2 FLOAT NOT NULL,
                    accion3 FLOAT NOT NULL,
                    accion4 FLOAT NOT NULL,
                    percepcion FLOAT NOT NULL,
                    timestamp DATETIME NOT NULL,
                    userId VARCHAR(36) DEFAULT NULL
                )
            `);
            
            console.log('Tabla recomendaciones creada correctamente');
        } else {
            console.log('Tabla recomendaciones ya existe');
            
            // Verificar estructura de la tabla y añadir columnas faltantes si es necesario
            const [columns] = await conn.query(`SHOW COLUMNS FROM recomendaciones`);
            const columnNames = columns.map(col => col.Field);
            
            // Verificar columna timestamp
            if (!columnNames.includes('timestamp')) {
                console.log('Añadiendo columna timestamp a la tabla recomendaciones...');
                await conn.query(`ALTER TABLE recomendaciones ADD COLUMN timestamp DATETIME NOT NULL`);
            }
            
            // Verificar columna userId
            if (!columnNames.includes('userId')) {
                console.log('Añadiendo columna userId a la tabla recomendaciones...');
                await conn.query(`ALTER TABLE recomendaciones ADD COLUMN userId VARCHAR(36) DEFAULT NULL`);
            }
        }
        
        console.log('Base de datos configurada correctamente');
        conn.release();
        return true;
    } catch (error) {
        console.error('Error al configurar la base de datos:', error);
        return false;
    }
}

// Modificar la parte donde inicias el servidor
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    console.log('WebSocket server está activo');
    
    // Intentar conectar a la base de datos al iniciar
    pool.getConnection()
        .then(async connection => {
            connection.release();
            console.log('Conexión exitosa a la base de datos MySQL');
            
            // Configurar la base de datos
            const dbSetupResult = await setupDatabase();
            if (dbSetupResult) {
                console.log('La aplicación está lista para recibir recomendaciones');
            } else {
                console.error('No se pudo configurar correctamente la base de datos');
            }
        })
        .catch(err => {
            console.error('Error al conectar a la base de datos:', err);
        });
});
/**
 * Actualiza el historial de usuarios conectados
 */
function updateUserHistory() {
    const now = new Date();
    const timeLabel = formatTime(now);
    
    // Añadir nuevo punto de datos o actualizar el existente
    const existingIndex = userStats.history.findIndex(item => item.time === timeLabel);
    
    if (existingIndex >= 0) {
        userStats.history[existingIndex].count = userStats.currentUsers;
    } else {
        userStats.history.push({
            time: timeLabel,
            count: userStats.currentUsers,
            timestamp: now.toISOString()
        });
        
        // Mantener solo las últimas 24 horas
        if (userStats.history.length > 24) {
            userStats.history.shift();
        }
    }
    
    // Actualizar a todos los clientes con el historial actualizado
    io.emit('userHistory', userStats.history);
}

/**
 * Formatea una hora para mostrarla en la interfaz
 * @param {Date} date - Fecha a formatear
 * @returns {string} - Hora formateada
 */
function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Verificar periódicamente las conexiones de socket para evitar "fantasmas"
const cleanupInterval = setInterval(() => {
    const currentTime = Date.now();
    const timeoutThreshold = 2 * 60 * 1000; // 2 minutos
    let socketsCleaned = 0;
    
    // Verificar cada socket activo
    for (const [socketId, userData] of userStats.activeUsers.entries()) {
        const socket = io.sockets.sockets.get(socketId);
        
        // Si el socket ya no existe o ha estado inactivo demasiado tiempo
        if (!socket || (currentTime - userData.connectTime > timeoutThreshold && !socket.connected)) {
            // Limpiar usuario "fantasma"
            userStats.activeUsers.delete(socketId);
            userStats.currentUsers = Math.max(0, userStats.currentUsers - 1);
            socketsCleaned++;
            
            console.log(`Limpieza: Usuario inactivo/fantasma eliminado [${userData.userId}], Total actual: ${userStats.currentUsers}`);
        }
    }
    
    if (socketsCleaned > 0) {
        // Actualizar estadísticas para todos
        io.emit('userCount', userStats.currentUsers);
        io.emit('activeUsers', Array.from(userStats.activeUsers.values()).map(user => ({
            id: (user.customId || user.userId).substring(0, 8),
            connectTime: user.connectTime
        })));
        
        updateUserHistory();
    }
    
    // Enviar ping periódico a todos para mantener conexiones
    io.emit('serverPing', { timestamp: new Date().toISOString() });
    
    // Log de estado
    console.log(`[${new Date().toISOString()}] Estado del servidor: ${userStats.currentUsers} usuarios, ${userStats.activeUsers.size} sockets activos`);
    
}, 60000); // Ejecutar cada minuto

// Enviar actualización a todos cada 15 segundos para mantener conteo actualizado
const updateInterval = setInterval(() => {
    // Si hay usuarios conectados, enviar actualizaciones regulares
    if (userStats.currentUsers > 0) {
        io.emit('userCount', userStats.currentUsers);
        
        // También enviar lista de usuarios activos
        io.emit('activeUsers', Array.from(userStats.activeUsers.values()).map(user => ({
            id: (user.customId || user.userId).substring(0, 8),
            connectTime: user.connectTime
        })));
    }
}, 15000);

// Manejo de errores no capturados
process.on('uncaughtException', (error) => {
    console.error('Error no capturado:', error);
    // En producción, podríamos notificar por email, Slack, etc.
});

process.on('unhandledRejection', (error) => {
    console.error('Promesa rechazada no manejada:', error);
});

// Manejo de señales para cierre graceful
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

/**
 * Realiza un cierre graceful del servidor
 */
async function gracefulShutdown() {
    console.log('Iniciando cierre graceful del servidor...');
    
    // Limpiar intervalos
    clearInterval(cleanupInterval);
    clearInterval(updateInterval);
    
    // Notificar a todos los clientes
    io.emit('serverShutdown', { message: 'El servidor está cerrando, por favor recargue la página en unos momentos.' });
    
    // Cerrar conexiones Socket.io
    io.close();
    
    // Cerrar pool de base de datos
    try {
        await pool.end();
        console.log('Conexiones a base de datos cerradas');
    } catch (error) {
        console.error('Error al cerrar conexiones de base de datos:', error);
    }
    
    // Cerrar servidor HTTP (no aceptar nuevas conexiones)
    server.close(() => {
        console.log('Servidor HTTP cerrado');
        process.exit(0);
    });
}

// Iniciar el servidor en el puerto configurado
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    console.log('WebSocket server está activo');
    // Intentar conectar a la base de datos al iniciar
    pool.getConnection()
        .then(connection => {
            connection.release();
            console.log('Conexión exitosa a la base de datos MySQL');
        })
        .catch(err => {
            console.error('Error al conectar a la base de datos:', err);
        });
});