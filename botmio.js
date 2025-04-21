const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const { Boom } = require('@hapi/boom');
const fs = require('fs');

// Función para comparar palabras clave de manera aproximada
function palabraClaveValida(mensaje, claves) {
    const mensajeLimpio = mensaje.toLowerCase();
    return claves.some(clave => mensajeLimpio.includes(clave));
}

// Cargar los datos de los productos desde un archivo JSON
const productos = JSON.parse(fs.readFileSync('productos.json', 'utf-8'));

// Función principal para iniciar el bot
async function iniciarBot() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('./auth_info'); // Carpeta para guardar credenciales

        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false // Desactivar QR predeterminado
        });

        // Manejo de conexión y QR
        sock.ev.on('connection.update', async (update) => {
            const { connection, qr, lastDisconnect } = update;
            if (qr) {
                qrcode.generate(qr, { small: true }); // Generar el QR en terminal
            }

            if (connection === 'close') {
                const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
                console.log(`Conexión cerrada. Razón: ${reason}`);
                
                if (reason === DisconnectReason.loggedOut) {
                    console.log('Desconectado. Necesitas escanear el QR nuevamente.');
                } else {
                    console.log('Intentando reconectar...');
                    iniciarBot(); // Reconectar
                }
            } else if (connection === 'open') {
                console.log('¡Conexión exitosa!');
            }
        });

        // Manejo de mensajes
        sock.ev.on('messages.upsert', async ({ messages }) => {
            try {
                const msg = messages[0];

                // Filtrar para solo responder en chats privados
                if (!msg.key.fromMe && msg.key.remoteJid && !msg.key.remoteJid.includes('@g.us')) {
                    const textoRecibido = msg.message.conversation 
                        || msg.message.extendedTextMessage?.text 
                        || ''; // Capturar texto de mensajes

                    const numeroCliente = msg.key.remoteJid;

                    console.log('Mensaje recibido:', textoRecibido); // Depuración del mensaje

                    // Palabras clave aproximadas para cada categoría
                    const clavesProductos = {
                        baterias: ['bateria', 'baterías', 'baterias', 'batería'],
                        motos: ['motos', 'moto'],
                        telefonos: ['telefonos', 'telefono', 'teléfono'],
                        laptops: ['laptops', 'laptop', 'lactop'],
                        fogones: ['fogon', 'hornilla', 'fogón' , 'fogones'],
                        generadores: ['generador', 'generadores', 'planta'],
                        argollas: ['argollas', 'argolla', 'tubo'],
                        neveras: ['nevera', 'neveras'],
                        refrigeradores: ['refrigerador', 'refrigeradores', 'frio']
                    };

                    // Buscar por categoría utilizando palabras clave aproximadas
                    const tipoProducto = Object.keys(clavesProductos).find(tipo =>
                        palabraClaveValida(textoRecibido, clavesProductos[tipo])
                    );

                    if (tipoProducto) {
                        const productosFiltrados = productos[tipoProducto].filter(prod => prod.disponible);

                        if (productosFiltrados.length > 0) {
                            for (const producto of productosFiltrados) {
                                try {
                                    const detallesTexto = Array.isArray(producto.detalles)
                                        ? producto.detalles.join('\n')
                                        : producto.detalles;

                                    if (producto.imagen) {
                                        await sock.sendMessage(numeroCliente, {
                                            image: { url: producto.imagen },
                                            caption: `${producto.nombre}:\n${detallesTexto}\nPrecio: $${producto.precio}`
                                        });
                                    } else {
                                        await sock.sendMessage(numeroCliente, {
                                            text: `${producto.nombre}:\n${detallesTexto}\nPrecio: $${producto.precio}`
                                        });
                                    }
                                } catch (error) {
                                    console.error(`Error enviando información para ${producto.nombre}:`, error);
                                }
                            }
                        } else {
                            await sock.sendMessage(numeroCliente, {
                                text: `No tenemos productos disponibles en la categoría de ${tipoProducto}.`
                            });
                        }
                    } else {
                        console.log('No se detectaron palabras clave aproximadas. No se enviará ningún mensaje.');
                    }
                }
            } catch (err) {
                console.error('Error procesando mensaje:', err);
            }
        });

        sock.ev.on('creds.update', saveCreds); // Guardar credenciales actualizadas
    } catch (err) {
        console.error('Error al iniciar el bot:', err);
    }
}

iniciarBot();








