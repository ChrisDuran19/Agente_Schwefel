const socket = new WebSocket('ws://localhost:3000');

// Evento cuando se abre la conexión
socket.addEventListener('open', function (event) {
    console.log('Conectado al servidor WebSocket');
});

// Escuchar mensajes del servidor
socket.addEventListener('message', function (event) {
    console.log('Mensaje del servidor:', event.data);
});

// Función para enviar datos de percepción al servidor
function sendPerception(accion1, accion2, accion3, accion4, percepcion) {
    const message = JSON.stringify({
        accion1: accion1,
        accion2: accion2,
        accion3: accion3,
        accion4: accion4,
        perception: percepcion
    });
    socket.send(message);
}

// Ejemplo de envío manual de datos de percepción
sendPerception(10.0, 20.0, 30.0, 40.0, 100.0);
