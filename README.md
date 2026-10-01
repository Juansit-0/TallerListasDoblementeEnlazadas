# Plan de ascenso: taller de listas doblemente enlazadas

Cuando un buzo hace una inmersión profunda no puede subir directo a la superficie. Tiene que detenerse a ciertas profundidades durante un tiempo para que su cuerpo elimine el nitrógeno acumulado: son las **paradas de descompresión**. El conjunto ordenado de paradas forma el **plan de ascenso**.

En este taller ese plan se modela como una **lista doblemente enlazada**:

- Cada parada es un nodo `DecoStop` con profundidad, minutos, gas respirado y dos punteros: `prev` y `next`.
- `AscentPlan` es la lista. Guarda `head` (la primera parada), `tail` (la última) y `size`.
- Todas las operaciones se hacen moviendo punteros a mano. No se usan `append`, `pop`, `insert`, `sort` ni `sorted` de Python.

Que sea doble tiene sentido en el caso real: el buzo recorre el plan hacia adelante mientras asciende, y el instructor lo revisa hacia atrás desde la superficie.

## Estructura

```
app.py                      servidor Flask y rutas de la API
dive/deco_stop.py           nodo DecoStop
dive/ascent_plan.py         lista doblemente enlazada AscentPlan
dive/pointer_trace.py       registro de cada asignación de puntero
dive/plan_error.py          error de dominio con mensajes para el usuario
dive/sample_dive.py         plan de ejemplo precargado
templates/index.html        interfaz
static/css/styles.css       estilos
static/js/renderer.js       dibujo SVG y animaciones
static/js/app.js            eventos, llamadas a la API y registro de punteros
```

## Operaciones de la lista

| Operación | Método |
|---|---|
| Insertar al inicio | `insert_first` |
| Insertar al final | `insert_last` |
| Insertar en una posición | `insert_at` |
| Insertar después de una parada | `insert_after` |
| Quitar la primera | `remove_first` |
| Quitar la última | `remove_last` |
| Quitar por número de parada | `remove_by_id` |
| Buscar por profundidad o número | `find_by_depth`, `find_by_id` |
| Recorrer con `next` o con `prev` | `traverse_forward`, `traverse_backward`, `walk` |
| Invertir | `reverse` |
| Ordenar por profundidad | `sort_by_depth` (insertion sort reenlazando nodos) |
| Tiempo total y validación del ascenso | `total_minutes`, `is_safe_ascent` |

## Cómo ejecutarlo

Necesitas Python 3.10 o superior.

```bash
cd TallerListasDoblementeEnlazadas
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py
```

Abre `http://127.0.0.1:5000` en el navegador. Para detener el servidor, presiona `Ctrl + C`.

En Windows, activa el entorno con `venv\Scripts\activate`.

## Cómo leer la interfaz

- El eje vertical es la profundidad real y las bandas de color son tramos de 6 m.
- El eje horizontal es el orden de los nodos en la lista.
- La flecha amarilla de arriba es `next` y la coral de abajo es `prev`. El círculo con `None` indica un puntero vacío.
- Las etiquetas `head` y `tail` se mueven cuando cambian esas referencias.
- El registro de punteros muestra, en orden, cada asignación que hizo Python (por ejemplo `#7.prev → #1`), al mismo tiempo que se dibuja la flecha.
- Al buscar o recorrer, un marcador amarillo salta de nodo en nodo siguiendo los punteros.
- Si alguna parada queda igual o más profunda que la anterior, aparece el aviso de ascenso inseguro.
- El control de velocidad acelera o frena las animaciones.

Puedes hacer clic en una parada para seleccionarla y luego quitarla o insertar otra después de ella.
