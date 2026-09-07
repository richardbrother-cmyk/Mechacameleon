# Mecha Chameleon Online

Juego multijugador **online** para navegador inspirado en *MECCHA CHAMELEON* (Steam):
un escondite en el que los escondidos empiezan con el cuerpo **completamente blanco**
y tienen que **pintarse** copiando colores del escenario para fundirse con él antes de
que los buscadores salgan a cazarlos con linterna y escopeta.

- Multijugador en tiempo real por WebSocket (2–12 jugadores por sala).
- Salas públicas (lista en la portada) o privadas por código de 4 letras / enlace.
- **Zoom** con la rueda del ratón (x0.4 – x10) para pintar con precisión y para inspeccionar el escenario.
- Escenarios procedurales (Almacén, Jardín, Galería) generados a partir de una semilla: todos los jugadores ven exactamente los mismos píxeles.
- Pintura por partes del cuerpo (cabeza, torso, brazos, piernas), 5 tamaños de pincel, cuentagotas, relleno de parte, 5 poses, giro y volteo.
- Puntuación como en el original: los escondidos ganan puntos por estar **a la vista** de un buscador sin ser descubiertos, y pueden silbar para atraerlos.

## Ejecutar en local

```bash
npm install
npm start
```

Abre <http://localhost:3000> en varias pestañas o navegadores (o comparte tu IP en la red local).
El puerto se cambia con la variable de entorno `PORT`.

Pruebas:

```bash
npm test
```

## Jugar online (desplegar)

El servidor es un único proceso Node sin base de datos, así que funciona en cualquier host que
acepte WebSockets. Ejemplos:

- **Render (gratis, recomendado para probar)**: el repo incluye `render.yaml`. Entra en
  <https://dashboard.render.com>, pulsa **New → Blueprint**, conecta tu cuenta de GitHub, elige este
  repositorio y la rama, y pulsa **Apply**. En unos minutos tendrás una URL pública
  `https://mecha-chameleon-online.onrender.com` (el nombre puede variar). El plan gratuito se
  duerme tras 15 min sin uso; la primera visita tarda ~30 s en despertar.
- **Railway / Fly.io / Koyeb**: crea un servicio web desde este repositorio; comando de
  inicio `npm start`. Todos ellos detectan el `PORT` automáticamente.
- **Docker**:

  ```bash
  docker build -t mecha-chameleon .
  docker run -p 3000:3000 mecha-chameleon
  ```

- **VPS**: `npm ci --omit=dev && PORT=80 node server/index.js` (o detrás de nginx/caddy con
  soporte de `Upgrade: websocket`). Con HTTPS el cliente usa `wss://` automáticamente.

## Cómo se juega

1. Un jugador crea la sala (es el anfitrión) y los demás se unen por código, por enlace o desde la lista de salas públicas.
2. El anfitrión elige tiempos y escenario y pulsa **Iniciar ronda**. Uno de cada tres jugadores es **buscador**; el resto son **escondidos**.
3. **Fase de escondite**: los buscadores esperan a oscuras en su base. Los escondidos recorren el escenario, eligen sitio, copian colores con el clic derecho y se pintan con el izquierdo. Haz zoom para pintar píxel a píxel.
4. **Fase de búsqueda**: los buscadores salen con una linterna (solo ven un radio alrededor de ellos) y disparan con el clic izquierdo. Un disparo acertado elimina al escondido. Fallar resta 1 punto.
5. Los escondidos ganan **1 punto por segundo** mientras están dentro del haz de un buscador sin ser descubiertos, **+3** por silbar (T) y **+30** por sobrevivir. Los buscadores ganan **25** por captura y **+30** si encuentran a todos.
6. Los roles rotan entre rondas; la puntuación total se acumula en la sala.

### Controles

| Acción | Tecla |
|---|---|
| Moverse | `WASD` / flechas |
| Zoom | rueda del ratón |
| Girar el cuerpo / voltear | `Q` `E` / `R` |
| Poses | `1`–`5` |
| Pintar (escondido) / disparar (buscador) | clic izquierdo (`Espacio` también dispara) |
| Cuentagotas (copia el color del escenario) | clic derecho |
| Tamaño del pincel | `[` `]` o `Shift` + rueda |
| Rellenar la parte bajo el cursor | `G` |
| Silbar | `T` |
| Ver tu silueta durante la búsqueda | mantener `H` |
| Marcador | `Tab` |
| Mostrar/ocultar el panel del lobby | `Esc` |

## Estructura

```
server/index.js   servidor HTTP estático + WebSocket, salas y clientes
server/room.js    lógica de partida: fases, roles, puntuación, disparos
shared/body.js    modelo del cuerpo (partes, poses, test de impacto), compartido servidor/cliente
public/           cliente: generador de mapas, pintura, red, cámara con zoom, HUD
test/             prueba de humo del protocolo
```
