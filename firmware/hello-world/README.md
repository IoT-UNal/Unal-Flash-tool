# UNAL Flash Tool — Hello World Firmware

Firmware de prueba para verificar que la plataforma web de flasheo funciona correctamente.

## Qué hace

- **Parpadea el LED** integrado (GPIO 2) cada 500ms
- **Imprime información del chip** por serial al iniciar (modelo, revisión, frecuencia, MAC, etc.)
- **Envía heartbeat** cada segundo por el puerto serial (útil para probar el Serial Terminal)

## Cómo compilar

### Requisitos
- [PlatformIO CLI](https://platformio.org/install/cli) o extensión de VS Code

### Compilar
```bash
cd firmware/hello-world
pio run
```

El binario se genera en `.pio/build/esp32/firmware.bin`

### Subir directamente (USB)
```bash
pio run --target upload
```

## Cómo crear un Release en GitHub

El proyecto incluye un workflow de GitHub Actions que compila y crea releases automáticamente:

1. Crea un tag con formato `vX.Y.Z`:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
2. GitHub Actions compila el firmware y crea un Release con el `.bin` adjunto

### Release manual
También puedes crear un release manual:
1. Ve a **Releases** → **Create a new release**
2. Sube el archivo `firmware.bin` compilado
3. Nómbralo con el formato `esp32-hello-world.bin` para que el wizard lo reconozca

## Uso con la plataforma web

1. Configura `.env` en el proyecto principal:
   ```
   GITHUB_REPO=tu-usuario/Unal-Flash-tool
   ```
2. Abre http://localhost:3000/flash
3. Click en **"Or choose from GitHub Releases"**
4. Selecciona el release → el firmware se descarga y queda listo para flashear
