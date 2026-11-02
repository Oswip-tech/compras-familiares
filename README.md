# Compras familiares

Aplicación web móvil para organizar las compras de una familia, registrar lo que todavía
hay en casa, evitar compras excesivas y convertir la factura en un presupuesto real. La
lista usa nombres genéricos para que cada familia seleccione sus marcas habituales al
momento de comprar.

Sitio esperado: <https://oswip-tech.github.io/compras-familiares/>

## Funciones

- Lista completa agrupada por despensa, proteínas y lácteos, frutas y verduras,
  lavandería, limpieza e higiene personal.
- Cantidad recomendada por ciclo semanal, quincenal o mensual.
- Acciones rápidas **Compré**, **Aún lo tengo** y **No comprar**, con filtros para saber
  qué falta resolver.
- Campo desplegable para indicar la cantidad exacta comprada y el inventario que queda.
- Alertas de sobrecompra según la cantidad disponible, el ciclo y la conservación
  estimada; los perecibles avisan cuando existe riesgo de desperdicio.
- Duración proyectada de cada compra y fecha estimada de reposición.
- Indicadores de avance general y por categoría.
- Búsqueda por nombre del producto.
- Campo opcional para guardar la marca habitual cuando la familia la elija; inicia vacío.
- Identificación de artículos opcionales o no habituales.
- Reinicio del ciclo que conserva los productos cuya cobertura todavía alcanza.
- Pantalla de factura para corregir el nombre, marca, cantidad y total pagado de cada
  producto comprado.
- Foto de la factura guardada localmente como referencia durante la revisión.
- Total real del ciclo, comparación con el total impreso y proyección de la siguiente
  compra a partir de los últimos precios conocidos.
- Respaldo e importación de los datos en formato JSON.
- Uso sin conexión e instalación en la pantalla de inicio.

## Uso en el teléfono

1. Abre el sitio desde el navegador del teléfono.
2. Busca o filtra los productos pendientes.
3. Pulsa **Compré** para registrar la recomendación o **Aún lo tengo** si el producto sigue
   disponible en casa. Abre **Cambiar cantidad** únicamente si necesitas corregirla.
4. Atiende cualquier aviso de sobrecompra antes de agregar más, especialmente en frutas,
   verduras y otros productos perecibles.
5. En **Factura**, toma o selecciona una foto y revisa las líneas compradas. Corrige el
   nombre, la marca, la cantidad y el total pagado para actualizar el gasto y el precio
   de referencia.
6. Revisa la duración calculada y la fecha aproximada en la que necesitarás reponerlo.
7. Al comenzar una nueva compra, inicia un ciclo nuevo. La app mantiene como inventario
   lo que todavía tiene cobertura y vuelve a pedir lo que se agotará dentro del
   siguiente ciclo.

La interfaz es responsiva y está preparada para usarse con una sola mano. Puede añadirse
a la pantalla de inicio desde las opciones del navegador para abrirla como una app.

## Datos y privacidad

Los estados de compra, cantidades, precios y preferencias se guardan únicamente en el
almacenamiento local del navegador (`localStorage`). La foto de la factura se guarda en
`IndexedDB` en el mismo dispositivo. La aplicación no usa cuentas, analítica ni un
servidor propio, y no envía la información a terceros.

El respaldo JSON incluye la lista, inventario, historial y precios, pero **no incluye la
foto de la factura**. La imagen puede contener datos personales o de pago y permanece
solo en el navegador donde fue tomada o seleccionada.

Los datos pertenecen al navegador y dispositivo donde se registran. Borrar los datos del
sitio o usar otro teléfono restablece la aplicación. No existe sincronización automática
entre dispositivos.

## Cálculo de duración

Cada producto parte de una cantidad recomendada y de un período de referencia. Para la
compra actual, la app limita la recomendación al menor plazo entre el ciclo elegido, la
frecuencia propia del producto y su conservación estimada. Después descuenta la cantidad
que aún queda en casa.

La duración estimada se calcula proporcionalmente:

```text
duración estimada = período recomendado × cantidad comprada ÷ cantidad recomendada
```

Ejemplo: si la recomendación base es 10 kg de arroz para 30 días, una compra quincenal
recomienda 5 kg. Si se compran esos 5 kg, la proyección será de 15 días. La fecha de
reposición se obtiene sumando esa duración a la fecha de compra.

Las unidades indivisibles se redondean hacia arriba. Si la suma de lo que queda y lo que
se compró supera la necesidad segura, la aplicación muestra una advertencia; en alimentos
perecibles, el aviso resalta el posible desperdicio. Siempre debe respetarse la fecha de
caducidad real del empaque.

Los productos que se compran en un lote para 2 o 3 meses —como pasta dental, cepillos o
afeitadoras— no se fraccionan en cada quincena: la app espera hasta que el lote esté cerca
de agotarse antes de recomendar la reposición completa. El remanente fraccionario de
artículos indivisibles es una estimación de consumo, no una pieza física partida.

El presupuesto siguiente usa el último precio unitario obtenido de las líneas revisadas
de la factura. Los productos sin precio se cuentan aparte para no presentar un total
parcial como si fuera completo.

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
