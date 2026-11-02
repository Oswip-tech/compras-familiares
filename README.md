# Compras familiares

Aplicación web móvil para organizar la compra mensual de una familia, registrar lo que
realmente se compra y proyectar cuánto tiempo durará cada producto. La lista usa nombres
genéricos para que cada familia seleccione sus marcas habituales al momento de comprar.

Sitio esperado: <https://oswip-tech.github.io/compras-familiares/>

## Funciones

- Lista completa agrupada por despensa, proteínas y lácteos, frutas y verduras,
  lavandería, limpieza e higiene personal.
- Cantidad recomendada por ciclo semanal, quincenal o mensual.
- Campo para registrar la cantidad realmente comprada.
- Estado comprado o pendiente, con filtros para encontrar lo que falta.
- Duración proyectada de cada compra y fecha estimada de reposición.
- Indicadores de avance general y por categoría.
- Búsqueda por nombre del producto.
- Campo opcional para guardar la marca habitual cuando la familia la elija; inicia vacío.
- Identificación de artículos opcionales o no habituales.
- Reinicio del ciclo que conserva los productos cuya cobertura todavía alcanza.
- Respaldo e importación de los datos en formato JSON.
- Uso sin conexión e instalación en la pantalla de inicio.

## Uso en el teléfono

1. Abre el sitio desde el navegador del teléfono.
2. Busca o filtra los productos pendientes.
3. Registra la cantidad realmente comprada o usa el botón **Completar** para copiar la
   recomendación del ciclo.
4. Revisa la duración calculada y la fecha aproximada en la que necesitarás reponerlo.
5. Al comenzar una nueva compra, inicia un ciclo nuevo. La app mantiene marcados los
   artículos que todavía tienen cobertura y vuelve a pedir los que se agotarán dentro del
   siguiente ciclo.

La interfaz es responsiva y está preparada para usarse con una sola mano. Puede añadirse
a la pantalla de inicio desde las opciones del navegador para abrirla como una app.

## Datos y privacidad

Los estados de compra, cantidades registradas y preferencias se guardan únicamente en el
almacenamiento local del navegador (`localStorage`). La aplicación no usa cuentas, base de
datos, analítica ni un servidor propio, y no envía la información a terceros.

Los datos pertenecen al navegador y dispositivo donde se registran. Borrar los datos del
sitio o usar otro teléfono restablece la aplicación. No existe sincronización automática
entre dispositivos.

## Cálculo de duración

Cada producto parte de una cantidad recomendada y de un período de referencia. La
duración estimada se calcula proporcionalmente:

```text
duración estimada = período recomendado × cantidad comprada ÷ cantidad recomendada
```

Ejemplo: si la recomendación base es 10 kg de arroz para 30 días, una compra quincenal
recomienda 5 kg. Si se compran esos 5 kg, la proyección será de 15 días. La fecha de
reposición se obtiene sumando esa duración a la fecha de compra.

Las unidades indivisibles se redondean hacia arriba. En alimentos perecibles, la cobertura
visible se limita por la vida útil estimada y la aplicación avisa cuando conviene dividir la
compra. Siempre debe respetarse la fecha de caducidad real del empaque.

La proyección es una ayuda para presupuestar. El consumo real puede cambiar por visitas,
desperdicio, comidas fuera de casa o cambios en el tamaño de la familia.

## Desarrollo local

La aplicación es completamente estática y no requiere instalación, compilación ni
dependencias. Para probarla con un servidor local:

```bash
python3 -m http.server 8080
```

Después abre <http://localhost:8080>.

## Publicación

El contenido se publica mediante GitHub Pages desde este repositorio. El archivo
`.nojekyll` indica que GitHub debe servir los archivos estáticos directamente, sin el
procesamiento de Jekyll.
