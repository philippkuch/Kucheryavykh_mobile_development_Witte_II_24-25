<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/search"></ion-back-button>
        </ion-buttons>
        <ion-title>Карта Магазина</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true" class="map-content-flex">
      <div id="leaflet-map-container" ref="mapContainerRef">
        <div v-if="isLoading" class="map-placeholder">
            <ion-spinner name="crescent"></ion-spinner><p>Загрузка данных...</p>
        </div>
        <div v-else-if="!mapDataLoadedOk && !isLoading" class="map-placeholder">
            <p>Не удалось загрузить карту. Проверьте настройки Оператора.</p><p v-if="mapInitError"><small>{{ mapInitError }}</small></p>
        </div>
      </div>

      <div class="results-info-container-flex">
        <p style="font-size: 9px; background: yellow; padding: 2px; margin: 0; text-align: left; color: black;">
          [Debug] currentResults Length: {{ currentResults?.length ?? 'null' }}, isLoading: {{ isLoading }}
        </p>
        <ion-list lines="none" v-if="currentResults.length > 0 && !isLoading">
          <ion-list-header><ion-label>Расположение товаров:</ion-label></ion-list-header>
          <ion-item v-for="item in currentResults" :key="item.productName">
            <ion-label>
              <h2>{{ item.productName }}</h2>
              <p v-if="item.found && item.sectionNames.length > 0">Секции: {{ item.sectionNames.join(', ') }}</p>
              <p v-else-if="item.found && item.sectionNames.length === 0">Расположение не указано</p>
              <p v-else style="color: var(--ion-color-danger)">Товар не найден</p>
            </ion-label>
          </ion-item>
        </ion-list>
        <div v-else-if="!isLoading && currentResults.length === 0 && targetSectionNames.length > 0" class="highlight-info-flex">
          Подсвечены секции: {{ targetSectionNames.join(', ') }}
          <p><small>(Список товаров пуст)</small></p>
        </div>
        <div v-else-if="!isLoading" class="highlight-info-flex">
          <p><small>Для отображения списка "Товар-Секция" найдите товары через Поиск.</small></p>
        </div>
      </div>

    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonSpinner,
  IonList, IonListHeader, IonItem, IonLabel
} from '@ionic/vue';
import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { useRoute } from 'vue-router';
import { Toast } from '@capacitor/toast';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useSearchResults, SearchResultItem } from '@/services/search-results.service';

// --- Интерфейсы ---
interface Section { id: string; name: string; coords: { x: number; y: number; w: number; h: number }; }

// --- Константы ---
const MAP_IMAGE_URI_KEY = 'storeMapFileUri';
const MAP_SECTIONS_KEY = 'storeMapSections';

// --- Refs ---
const mapContainerRef = ref<HTMLDivElement | null>(null);
const mapInstance = ref<L.Map | null>(null);
const imageOverlay = ref<L.ImageOverlay | null>(null);
const svgOverlay = ref<L.SVGOverlay | null>(null);
const imageDimensions = ref<{ width: number; height: number } | null>(null);
const mapImageElement = ref<HTMLImageElement | null>(null);
const sections = ref<Section[]>([]);
const targetSectionNames = ref<string[]>([]);
const isLoading = ref(true);
const mapDataLoadedOk = ref(false);
const mapInitError = ref<string | null>(null);

const route = useRoute();
const { currentResults, clearResults } = useSearchResults();

// --- Стили ---
const defaultSvgStyle = { stroke: 'grey', strokeWidth: 1, strokeOpacity: 0.6, fill: 'grey', fillOpacity: 0.1 };
const highlightedSvgStyle = { stroke: 'green', strokeWidth: 2, strokeOpacity: 0.9, fill: 'green', fillOpacity: 0.3 };

// --- Lifecycle Hooks ---
onMounted(async () => {
  console.log('--- MapPage onMounted ВЫПОЛНЯЕТСЯ ---');
  await nextTick();
  console.log('MapPage onMounted: mapContainerRef =', mapContainerRef.value);
  console.log('MapPage onMounted: Начальное значение currentResults:', JSON.parse(JSON.stringify(currentResults.value)));

  mapDataLoadedOk.value = await loadData();

  let mapInitialized = false; // Флаг для отслеживания инициализации
  if (mapDataLoadedOk.value) {
      mapInitialized = await initializeMap(); // Получаем результат инициализации
  } else {
      console.warn("Данные карты не загружены, инициализация пропущена.");
  }

  updateTargetSectionsFromRoute(route.query.sections);
  // Вызываем отрисовку SVG только если карта была успешно инициализирована
  if (mapInitialized) {
      await nextTick(); // Дадим карте инициализироваться перед отрисовкой SVG
      updateSvgOverlay();
  }

  console.log('MapPage onMounted: Значение currentResults ПОСЛЕ loadData:', JSON.parse(JSON.stringify(currentResults.value)));
});

onUnmounted(() => {
  console.log('--- MapPage onUnmounted ВЫПОЛНЯЕТСЯ ---');
  if (mapInstance.value) { mapInstance.value.remove(); mapInstance.value = null; console.log('MapPage: Экземпляр Leaflet удален.');}
  // clearResults(); // Оставляем закомментированным
});

// --- Watchers ---
watch(() => route.query.sections, (newSectionsQuery) => {
    console.log('MapPage: Обнаружено изменение query.sections:', newSectionsQuery);
    updateTargetSectionsFromRoute(newSectionsQuery);
    // Обновляем SVG только если карта инициализирована
    if(mapInstance.value) {
        nextTick(() => { updateSvgOverlay(); });
    }
});

/* <<< ЗАКОММЕНТИРОВАН ПРОБЛЕМНЫЙ ОТЛАДОЧНЫЙ WATCH >>>
watch(currentResults, (newValue, oldValue) => {
    console.log(
        'MapPage Watcher: currentResults изменился!',
        JSON.parse(JSON.stringify(newValue))
    );
}, { deep: true });
*/

// --- Functions ---
const updateTargetSectionsFromRoute = (sectionsQuery: any) => {
   if (typeof sectionsQuery === 'string' && sectionsQuery.length > 0) { targetSectionNames.value = sectionsQuery.split('|'); } else { targetSectionNames.value = []; }
   console.log('MapPage: Секции для подсветки:', targetSectionNames.value);
}

// Функция теперь возвращает true, если данные КАРТЫ загружены, иначе false
const loadData = async (): Promise<boolean> => {
  console.log('MapPage: Загрузка данных НАЧАТА...');
  isLoading.value = true;
  let mapSuccess = false;
  mapImageElement.value = null; imageDimensions.value = null; sections.value = []; mapInitError.value = null;
  await nextTick(); // Даем Vue шанс убрать предыдущий canvas/map, если он был

  try {
    // Загрузка секций
    const sectionsResult = await Preferences.get({ key: MAP_SECTIONS_KEY });
    if (sectionsResult.value) { try { sections.value = JSON.parse(sectionsResult.value); } catch(e){ console.error('MapPage: Ошибка парсинга секций:', e); sections.value=[]; } } else { sections.value = []; }
    console.log('MapPage: Секции загружены/сброшены:', sections.value.length);

     // Загрузка URI карты
     const uriResult = await Preferences.get({ key: MAP_IMAGE_URI_KEY });
     console.log('MapPage: Загруженный URI:', uriResult.value);
     if (uriResult.value) {
        const savedUri = uriResult.value;
        const readFileResult = await Filesystem.readFile({ path: savedUri, encoding: Encoding.UTF8 });
        const loadedDataUrl = readFileResult.data as string;
        console.log('MapPage: Результат readFile (начало):', loadedDataUrl ? loadedDataUrl.substring(0, 100) : 'НЕТ ДАННЫХ');

        if (typeof loadedDataUrl !== 'string' || !loadedDataUrl.startsWith('data:image')) { throw new Error("Невалидный Data URL"); }

        const img = new Image();
        console.log('MapPage: Создан объект Image, устанавливаем src...');
        await new Promise<void>((resolve, reject) => {
            img.onload = () => {
                console.log('MapPage: img.onload сработал');
                imageDimensions.value = { width: img.naturalWidth, height: img.naturalHeight };
                mapImageElement.value = img; // Сохраняем загруженный объект
                mapSuccess = true; // Ставим флаг успеха
                console.log('MapPage loadData: Размеры:', JSON.stringify(imageDimensions.value));
                resolve();
            };
            img.onerror = (err) => { console.error("MapPage: Ошибка img.onerror:", err); reject(err); }
            img.src = loadedDataUrl;
        });
     } else { console.log('MapPage: URI карты не найден.'); mapSuccess = false; }
  } catch (error: any) {
    console.error("MapPage: Ошибка при загрузке данных:", error);
    mapInitError.value = `Ошибка загрузки: ${error.message || error}`;
    mapSuccess = false;
    await Toast.show({ text: 'Ошибка загрузки данных!', duration: 'short' });
  } finally {
      isLoading.value = false;
      console.log('MapPage: Загрузка данных ЗАВЕРШЕНА. Успех карты:', mapSuccess);
  }
  return mapSuccess;
};

// Функция теперь возвращает true при успехе, false при ошибке
const initializeMap = async (): Promise<boolean> => {
    await nextTick();
    if (!mapContainerRef.value) { mapInitError.value = "Контейнер не найден"; console.error(mapInitError.value); return false; }
    if (mapInstance.value) { console.log("Карта уже инициализирована"); return true; }
    if (!imageDimensions.value || !mapImageElement.value?.src) { // Проверяем src у Image элемента
        mapInitError.value = "Данные изображения не готовы (нет размеров или src)"; console.error(mapInitError.value); return false;
    }

    try {
        const width = imageDimensions.value.width;
        const height = imageDimensions.value.height;
        const imageBounds: L.LatLngBoundsExpression = [[0, 0], [height, width]];
        console.log('MapPage initializeMap: Границы:', JSON.stringify(imageBounds));

        const map = L.map(mapContainerRef.value, { crs: L.CRS.Simple, minZoom: -5, maxZoom: 5, center: [height / 2, width / 2], zoom: 0, attributionControl: false });
        mapInstance.value = map;

        imageOverlay.value = L.imageOverlay(mapImageElement.value.src, imageBounds).addTo(map);
        map.fitBounds(imageBounds);

        console.log('MapPage: Карта Leaflet инициализирована.');
        mapInitError.value = null;
        return true; // Успех
    } catch (error: any) {
        console.error("MapPage: Ошибка инициализации Leaflet:", error);
        mapInitError.value = `Ошибка инициализации карты: ${error.message || error}`;
        return false; // Провал
    }
};

const updateSvgOverlay = () => {
    if (!mapInstance.value || !imageDimensions.value) { console.warn("updateSvgOverlay: Карта/размеры не готовы."); return; }
    const map = mapInstance.value;
    const width = imageDimensions.value.width;
    const height = imageDimensions.value.height;
    const imageBounds: L.LatLngBoundsExpression = [[0, 0], [height, width]];

    const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svgElement.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svgElement.setAttribute('width', `${width}`); svgElement.setAttribute('height', `${height}`);
    svgElement.style.width = `${width}px`; svgElement.style.height = `${height}px`;

    sections.value.forEach(section => {
        if (!section.coords || isNaN(section.coords.x)) return;
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        const isHighlighted = targetSectionNames.value.includes(section.name);
        const style = isHighlighted ? highlightedSvgStyle : defaultSvgStyle;
        rect.setAttribute('x', String(section.coords.x)); rect.setAttribute('y', String(section.coords.y));
        rect.setAttribute('width', String(section.coords.w)); rect.setAttribute('height', String(section.coords.h));
        rect.setAttribute('stroke', style.stroke); rect.setAttribute('stroke-width', String(style.strokeWidth));
        rect.setAttribute('stroke-opacity', String(style.strokeOpacity));
        rect.setAttribute('fill', style.fill); rect.setAttribute('fill-opacity', String(style.fillOpacity));
        svgElement.appendChild(rect);
        if (isHighlighted) {
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', String(section.coords.x + section.coords.w / 2)); text.setAttribute('y', String(section.coords.y + section.coords.h / 2 + 4));
            text.setAttribute('font-size', '12'); text.setAttribute('font-weight', 'bold'); text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'middle'); text.setAttribute('fill', 'rgba(0,0,0,0.8)'); text.setAttribute('stroke', 'white');
            text.setAttribute('stroke-width', '0.4px'); text.setAttribute('paint-order', 'stroke');
            text.textContent = section.name;
            svgElement.appendChild(text);
        }
    });

    if (svgOverlay.value) { map.removeLayer(svgOverlay.value); }
    svgOverlay.value = L.svgOverlay(svgElement, imageBounds, { opacity: 1, interactive: false });
    svgOverlay.value.addTo(map);
    console.log('MapPage: SVG слой секций обновлен/добавлен.');
};

</script>

<style>
/* Стили для Flexbox layout и остального */
ion-content.map-content-flex::part(scroll) {
  padding: 0;
  display: flex;
  flex-direction: column;
  height: 100%; /* Важно для flex */
}
#leaflet-map-container {
  flex: 1; /* Растягиваем карту */
  min-height: 150px;
  width: 100%;
  background-color: #dddddd;
  display: block;
  position: relative;
  overflow: hidden;
}
.map-placeholder {
  position: absolute; top: 0; left: 0; right: 0; bottom: 0;
  display: flex; flex-direction: column; justify-content: center;
  align-items: center; color: var(--ion-color-medium); text-align: center;
  padding: 10px; background-color: rgba(224, 224, 224, 0.9);
  z-index: 10; pointer-events: none;
}
.results-info-container-flex { /* Переименовали класс */
  flex-shrink: 0; /* Не сжиматься */
  width: 100%;
  max-height: 35vh; /* Ограничиваем высоту */
  overflow-y: auto; /* Добавляем скролл */
  background-color: rgba(255, 255, 255, 0.95);
  border-top: 1px solid #cccccc;
  z-index: 1; /* Убрали высокий z-index */
}
.results-info-container-flex ion-list { padding-top: 0; }
.results-info-container-flex ion-list-header { font-weight: bold; padding-bottom: 4px; border-bottom: 1px solid #e0e0e0; padding-top: 8px; }
.results-info-container-flex ion-item { --padding-start: 10px; --padding-end: 10px; --min-height: 40px; }
.results-info-container-flex ion-item h2 { font-size: 0.95em; font-weight: normal; margin: 2px 0; }
.results-info-container-flex ion-item p { font-size: 0.8em; color: var(--ion-color-medium-shade); margin: 0; }
.highlight-info-flex { /* Переименовали класс */
     text-align: center; padding: 15px 10px; font-size: 0.9em;
     color: var(--ion-color-medium-shade); min-height: 30px;
}
#leaflet-map-container svg text { pointer-events: none; font-family: sans-serif; font-size: 12px; font-weight: bold; fill: #333; stroke: white; stroke-width: 0.4px; paint-order: stroke; }
</style>
