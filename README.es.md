# Raindrop Bar Sync

**La barra de marcadores de tu navegador, idéntica en todos tus navegadores, a través de Raindrop.io.**

[English](README.md) · [Türkçe](README.tr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [日本語](README.ja.md) · **Español** · [简体中文](README.zh-CN.md) · [Português (BR)](README.pt-BR.md)

Una extensión que mantiene la **barra de marcadores nativa** de Chrome, Edge, Brave, Vivaldi,
Helium y Firefox sincronizada en ambos sentidos con una colección de Raindrop.io. Añades un
marcador en Firefox y un minuto después aparece en la barra de Chrome, en la misma carpeta y en
la misma posición. Raindrop hace de servidor; no hay nada más que alojar.

<p align="center">
  <img src="docs/images/popup.png" width="320" alt="Ventana emergente de la barra de herramientas">
  &nbsp;
  <img src="docs/images/popup-dark.png" width="320" alt="Ventana emergente, tema oscuro">
</p>

## Por qué

- Chrome Sync y Firefox Sync solo sincronizan dentro de su propia familia de navegadores.
- La extensión oficial de Raindrop guarda marcadores en Raindrop, pero no toca la barra del
  navegador.
- Las herramientas de sincronización entre navegadores necesitan un almacenamiento aparte que
  configuras tú (Nextcloud, WebDAV, Google Drive…). Si ya usas Raindrop, esta lo usa como ese
  almacenamiento.

## Funciones

- **Sincronización en ambos sentidos** de la barra de marcadores y sus subcarpetas: añadir,
  renombrar, cambiar enlaces, mover y eliminar desde cualquier lado.
- **Orden exacto**, incluido cómo se intercalan carpetas y marcadores. Raindrop no puede
  guardarlo por sí mismo, así que se conserva en pequeñas notas ocultas de la colección.
- **Gana el último cambio**, por marcador y por campo, según el momento en que de verdad lo
  hiciste, aunque un navegador haya estado días sin conexión.
- **Nada se pierde por accidente**: la primera sincronización solo añade, una carpeta borrada en
  un lado mientras en el otro se le añadía algo vuelve, y los borrados masivos se detienen y
  preguntan.
- **Copias de seguridad** de la barra de este navegador antes de cada cambio, restaurables con
  un clic.
- **Registro de actividad** con cada cambio y su origen («desde Firefox»).
- **Lista de dispositivos** con todos los navegadores que sincronizan con la colección.
- **Funciona sin conexión**: los cambios hechos sin red se guardan y se envían cuando vuelve.
- Ventana emergente y ajustes en **16 idiomas**, tema claro y oscuro.
- Sin servidores, sin analítica, sin permisos aparte de `bookmarks`, `storage`, `alarms` y
  `api.raindrop.io`.

![Página de ajustes](docs/images/options.png)

## Instalación

La extensión aún no está en la Chrome Web Store ni en addons.mozilla.org; compílala desde el
código fuente. Necesitas [Node.js](https://nodejs.org) 20 o superior.

```sh
git clone https://github.com/ozardali/raindrop-bar-sync.git
cd raindrop-bar-sync
npm install
npm run build            # Chrome, Edge, Brave, Vivaldi, Helium…
npm run build:firefox    # Firefox
```

**Navegadores Chromium**: abre `chrome://extensions`, activa el **Modo de desarrollador**, haz
clic en **Cargar descomprimida** y elige `.output/chrome-mv3`.

**Firefox**: abre `about:debugging#/runtime/this-firefox`, haz clic en **Cargar complemento
temporal…** y elige `.output/firefox-mv3/manifest.json`. Los complementos temporales se
eliminan al cerrar Firefox; para una instalación permanente, ejecuta `npm run zip:firefox` y
firma el zip como complemento no listado en
[addons.mozilla.org](https://addons.mozilla.org/developers/).

## Configuración

1. **Primero haz una copia de tus marcadores** (administrador de marcadores → Exportar). La
   sincronización trabaja con datos reales.
2. Desactiva la sincronización de marcadores integrada (Chrome Sync / Firefox Sync) en los
   navegadores donde uses la extensión. Dos sistemas sobre la misma barra chocan y crean
   duplicados.
3. Haz clic en el icono de la extensión → **Ajustes**.
4. **Cuenta de Raindrop**: pega un token de prueba. La página te guía paso a paso: Raindrop →
   Ajustes → Integraciones → *Crear nueva aplicación* → *Crear token de prueba*. El token solo
   da acceso a tu propia cuenta y no caduca.
5. **Colección**: elige la colección que reflejará tu barra o crea una nueva. Usa **la misma
   colección en todos los navegadores**.
6. Listo. La primera sincronización une ambos lados: añade lo que falta en cada dirección y no
   borra nada.

A partir de ahí, los cambios del navegador llegan a Raindrop en segundos y los de otros
navegadores llegan en menos de un minuto (configurable).

## Cómo funciona

Cada sincronización compara tres árboles: la barra ahora, la colección ahora y el estado en el
que ambos coincidieron en la última sincronización. Lo que cambió solo en un lado se copia al
otro; si ambos lados cambiaron lo mismo, gana el cambio más reciente. La fusión es una función
pura con pruebas unitarias, de propiedades y de fuzzing: cientos de historiales de edición
aleatorios, cada uno comprobado para terminar con ambos lados idénticos y sin perder nada nuevo.

Detalles: [docs/architecture.md](docs/architecture.md). El comportamiento de la API de Raindrop
en el que se basa el diseño, verificado contra la API real:
[docs/raindrop-api.md](docs/raindrop-api.md) (en inglés).

## Limitaciones

- Solo se sincroniza la barra de marcadores (y sus carpetas), no «Otros marcadores» ni «Móvil».
- Los separadores (Firefox) no se sincronizan; Raindrop no tiene equivalente.
- Los enlaces que Raindrop no acepta (bookmarklets `javascript:`, `file:`, `about:`) se quedan
  en su navegador y nunca se borran.
- Firefox para Android y Safari no son compatibles.
- Vivaldi y Brave deberían funcionar como Chrome, pero aún no se han probado.
- El acceso es con token de prueba; «Iniciar sesión con Raindrop» (OAuth) requiere un secreto
  en un servidor y no está implementado.

## Aviso

**Este es un proyecto no oficial, sin relación con Raindrop.io ni respaldado por Raindrop.io.**

**La sincronización modifica datos reales en dos lugares.** Las salvaguardas (sin borrados en
la primera sincronización, pausa ante borrados masivos, copias locales, la papelera de
Raindrop) hacen improbable perder marcadores, no imposible. Guarda una exportación de tus
marcadores a la que puedas volver.

**Sin garantía.** El software se ofrece tal cual, bajo la [licencia MIT](LICENSE).

## Privacidad

La extensión habla con un único servidor: `api.raindrop.io`, con tu token. Sin analítica, sin
terceros. Qué se guarda y dónde, exactamente: [PRIVACY.md](PRIVACY.md) (en inglés).

## Traducciones

La interfaz de la extensión está disponible en los 16 idiomas que admite la aplicación de
Raindrop. Este README está disponible en los idiomas enlazados arriba. Para ambos, **el inglés
es la referencia**; si una traducción difiere, vale el texto en inglés. Cómo corregir o añadir
una traducción: [CONTRIBUTING.md](CONTRIBUTING.md#translations).

## Contribuir

Se agradecen los informes de errores y las pull requests. El entorno de desarrollo, las pruebas
y la estructura del proyecto están en [CONTRIBUTING.md](CONTRIBUTING.md).

## Licencia

[MIT](LICENSE) © Goksel Ozardali
