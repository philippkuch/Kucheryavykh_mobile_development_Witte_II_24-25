<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/search" data-testid="back-button"></ion-back-button>
        </ion-buttons>
        <ion-title>Карта Магазина</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true" class="map-content-flex">
      <div id="leaflet-map-container" ref="mapContainerRef" data-testid="map-container">
        <div data-testid="map-loading-placeholder" v-if="isLoading" class="map-placeholder">
          <ion-spinner name="crescent"></ion-spinner><p>Загрузка данных...</p>
        </div>
        <div data-testid="map-error-placeholder" v-else-if="!mapDataLoadedOk && !isLoading" class="map-placeholder">
          <p>Не удалось загрузить карту. Проверьте настройки Оператора.</p><p v-if="mapInitError"><small>{{ mapInitError }}</small></p>
        </div>
      </div>

      <div class="results-info-container-flex" data-testid="results-info-container">
        <ion-list data-testid="results-list" lines="none" v-if="currentResults.length > 0 && !isLoading">
          <ion-list-header><ion-label>Расположение товаров:</ion-label></ion-list-header>
          <ion-item v-for="item in currentResults" :key="item.productName" :data-testid="`result-info-item-${item.productName}`">
            <ion-label>
              <h2>{{ item.productName }}</h2>
              <p v-if="item.found && item.sectionNames.length > 0">Секции: {{ item.sectionNames.join(', ') }}</p>
              <p v-else-if="item.found && item.sectionNames.length === 0">Расположение не указано</p>
              <p v-else style="color: var(--ion-color-danger)">Товар не найден</p>
            </ion-label>
          </ion-item>
        </ion-list>
        <div data-testid="highlight-info" v-else-if="!isLoading && currentResults.length === 0 && targetSectionNames.length > 0" class="highlight-info-flex">
          Подсвечены секции: {{ targetSectionNames.join(', ') }}
          <p><small>(Список товаров пуст)</small></p>
        </div>
        <div data-testid="no-search-info" v-else-if="!isLoading" class="highlight-info-flex">
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
// Импорт оберток для Capacitor API, обеспечивающих консистентную работу и мокирование.
import {
  AppPreferences,
  AppFilesystem,
  AppToast,
  Directory,
  Encoding
} from '@/utils/capacitor-wrappers';
// Хуки и утилиты Vue Router для работы с навигацией и параметрами маршрута.
import { useRoute } from 'vue-router';
// Библиотека Leaflet для отображения интерактивной карты.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css'; // Стили для Leaflet.
// Сервис для получения результатов поиска, переданных со страницы SearchPage.
import { useSearchResults, SearchResultItem } from '@/services/search-results.service';

// Интерфейс, описывающий структуру данных для секции на карте магазина.
interface Section { id: string; name: string; coords: { x: number; y: number; w: number; h: number }; }

// Константы для ключей, используемых при работе с Capacitor Preferences.
const MAP_IMAGE_URI_KEY = 'storeMapFileUri';
const MAP_SECTIONS_KEY = 'storeMapSections';

// Реактивные переменные (refs) для управления состоянием и DOM-элементами карты.
const mapContainerRef = ref<HTMLDivElement | null>(null); // Ссылка на DOM-элемент контейнера карты.
const mapInstance = ref<L.Map | null>(null); // Экземпляр карты Leaflet.
const imageOverlay = ref<L.ImageOverlay | null>(null); // Слой с изображением карты магазина.
const svgOverlay = ref<L.SVGOverlay | null>(null); // Слой SVG для отрисовки секций поверх карты.
const imageDimensions = ref<{ width: number; height: number } | null>(null); // Размеры загруженного изображения карты.
const mapImageElement = ref<HTMLImageElement | null>(null); // HTML-элемент загруженного изображения.
const sections = ref<Section[]>([]); // Массив всех секций магазина, загруженных из Preferences.
const targetSectionNames = ref<string[]>([]); // Массив имен секций, которые должны быть подсвечены.
const isLoading = ref(true); // Флаг состояния загрузки данных карты.
const mapDataLoadedOk = ref(false); // Флаг успешной загрузки и инициализации данных карты.
const mapInitError = ref<string | null>(null); // Сообщение об ошибке инициализации карты.

const route = useRoute(); // Доступ к текущему маршруту для получения query-параметров.
const { currentResults } = useSearchResults(); // Получение текущих результатов поиска из сервиса.

// Стили для SVG-элементов, отображающих секции на карте.
const defaultSvgStyle = { stroke: 'grey', strokeWidth: 1, strokeOpacity: 0.6, fill: 'grey', fillOpacity: 0.1 };
const highlightedSvgStyle = { stroke: 'green', strokeWidth: 2, strokeOpacity: 0.9, fill: 'green', fillOpacity: 0.3 }; // Стиль для подсвеченных секций.

// Хук жизненного цикла onMounted: выполняется при монтировании компонента.
// Основная логика: загрузка данных, инициализация карты и обновление SVG-слоя с секциями.
onMounted(async () => {
  await nextTick(); // Гарантирует, что DOM-элементы доступны перед обращением к ним.

  mapDataLoadedOk.value = await loadData(); // Загрузка данных карты и секций.

  let mapInitialized = false;
  if (mapDataLoadedOk.value) {
    mapInitialized = await initializeMap(); // Инициализация экземпляра карты Leaflet.
  } else {
    // Данные карты не загрузились, инициализация пропускается.
  }

  // Обновление списка целевых секций из параметров URL.
  updateTargetSectionsFromRoute(route.query.sections);
  if (mapInitialized) {
    await nextTick(); // Ожидание возможных обновлений DOM после инициализации карты.
    updateSvgOverlay(); // Первоначальное отображение секций на карте.
  }
});

// Хук жизненного цикла onUnmounted: выполняется перед размонтированием компонента.
// Очищает ресурсы, связанные с картой Leaflet, для предотвращения утечек памяти.
onUnmounted(() => {
  if (mapInstance.value) {
    mapInstance.value.remove(); // Удаление экземпляра карты.
    mapInstance.value = null;
  }
});

// Наблюдатель (watcher) за изменениями в query-параметре 'sections' текущего маршрута.
// При изменении параметра (например, при новой навигации на эту страницу с другими секциями)
// обновляет список подсвечиваемых секций и перерисовывает SVG-слой.
watch(() => route.query.sections, (newSectionsQuery) => {
  updateTargetSectionsFromRoute(newSectionsQuery);
  if(mapInstance.value) { // Обновляем оверлей, только если карта уже инициализирована.
    nextTick(() => { updateSvgOverlay(); });
  }
});

// Обновляет массив targetSectionNames на основе строки из query-параметра 'sections'.
// Строка представляет собой имена секций, разделенные символом '|'.
const updateTargetSectionsFromRoute = (sectionsQuery: any) => {
  if (typeof sectionsQuery === 'string' && sectionsQuery.length > 0) {
    targetSectionNames.value = sectionsQuery.split('|');
  } else {
    targetSectionNames.value = [];
  }
}

// Асинхронная функция загрузки данных, необходимых для отображения карты:
// URI изображения карты и определения секций из Capacitor Preferences,
// а также само изображение карты из Capacitor Filesystem.
const loadData = async (): Promise<boolean> => {
  isLoading.value = true;
  let mapSuccess = false;
  // Сброс предыдущих значений перед загрузкой.
  mapImageElement.value = null; imageDimensions.value = null; sections.value = []; mapInitError.value = null;
  await nextTick();

  try {
    // Загрузка определений секций.
    const sectionsResult = await AppPreferences.get({ key: MAP_SECTIONS_KEY });
    if (sectionsResult.value) {
      try { sections.value = JSON.parse(sectionsResult.value); }
      catch(e){ sections.value=[]; }
    } else {
      sections.value = [];
    }

    // Загрузка URI изображения карты.
    const uriResult = await AppPreferences.get({ key: MAP_IMAGE_URI_KEY });
    if (uriResult.value) {
      const savedUri = uriResult.value;
      // Чтение файла изображения по сохраненному URI.
      const readFileResult = await AppFilesystem.readFile({ path: savedUri, encoding: Encoding.UTF8 });
      const loadedDataUrl = readFileResult.data as string;

      // Проверка, что прочитанные данные являются валидным Data URL изображения.
      if (typeof loadedDataUrl !== 'string' || !loadedDataUrl.startsWith('data:image')) {
        throw new Error("Невалидный Data URL");
      }

      const img = new Image(); // Создание HTMLImageElement для загрузки изображения и получения его размеров.
      // Использование Promise для ожидания полной загрузки изображения.
      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          imageDimensions.value = { width: img.naturalWidth, height: img.naturalHeight };
          mapImageElement.value = img;
          mapSuccess = true;
          resolve();
        };
        img.onerror = (err) => { reject(err); }
        img.src = loadedDataUrl; // Начинает загрузку изображения.
      });
    } else {
      mapSuccess = false; // URI карты не найден.
    }
  } catch (error: any) { // Обработка любых ошибок во время загрузки.
    mapInitError.value = `Ошибка загрузки: ${error.message || error}`;
    mapSuccess = false;
    await AppToast.show({ text: 'Ошибка загрузки данных!', duration: 'short' });
  } finally {
    isLoading.value = false; // Завершение состояния загрузки.
  }
  return mapSuccess; // Возвращает флаг успешности загрузки данных карты.
};

// Инициализирует карту Leaflet после успешной загрузки изображения карты.
// Устанавливает изображение как слой и настраивает отображение карты.
const initializeMap = async (): Promise<boolean> => {
  await nextTick();
  if (!mapContainerRef.value) { mapInitError.value = "Контейнер не найден"; return false; }
  if (mapInstance.value) { return true; } // Карта уже инициализирована.
  if (!imageDimensions.value || !mapImageElement.value?.src) {
    mapInitError.value = "Данные изображения не готовы (нет размеров или src)"; return false;
  }

  try {
    const width = imageDimensions.value.width;
    const height = imageDimensions.value.height;
    // Границы изображения для Leaflet, используя систему координат CRS.Simple (пиксели).
    const imageBounds: L.LatLngBoundsExpression = [[0, 0], [height, width]];

    // Создание экземпляра карты Leaflet.
    const map = L.map(mapContainerRef.value, {
      crs: L.CRS.Simple, // Использование простой пиксельной системы координат.
      minZoom: -5,       // Минимальный уровень зума.
      maxZoom: 5,        // Максимальный уровень зума.
      center: [height / 2, width / 2], // Центрирование карты.
      zoom: 0,           // Начальный уровень зума.
      attributionControl: false // Отключение стандартной атрибуции Leaflet.
    });
    mapInstance.value = map;

    // Добавление слоя с изображением карты.
    imageOverlay.value = L.imageOverlay(mapImageElement.value.src, imageBounds).addTo(map);
    map.fitBounds(imageBounds); // Масштабирование карты для полного отображения изображения.

    mapInitError.value = null;
    return true;
  } catch (error: any) {
    mapInitError.value = `Ошибка инициализации карты: ${error.message || error}`;
    return false;
  }
};

// Обновляет или создает SVG-слой с секциями на карте.
// Секции рисуются как прямоугольники, подсвеченные секции получают особый стиль и текстовую метку.
const updateSvgOverlay = () => {
  if (!mapInstance.value || !imageDimensions.value) { return; } // Проверка готовности карты и размеров.
  const map = mapInstance.value;
  const width = imageDimensions.value.width;
  const height = imageDimensions.value.height;
  const imageBounds: L.LatLngBoundsExpression = [[0, 0], [height, width]]; // Границы для SVG-слоя.

  // Создание корневого SVG-элемента.
  const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svgElement.setAttribute('viewBox', `0 0 ${width} ${height}`); // Установка viewBox для корректного масштабирования.
  svgElement.setAttribute('width', `${width}`); svgElement.setAttribute('height', `${height}`);
  svgElement.style.width = `${width}px`; svgElement.style.height = `${height}px`;
  svgElement.setAttribute('data-testid', 'map-svg-overlay');

  // Итерация по всем загруженным секциям для их отрисовки.
  sections.value.forEach(section => {
    if (!section.coords || isNaN(section.coords.x)) return; // Пропуск секций без валидных координат.
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    const isHighlighted = targetSectionNames.value.includes(section.name); // Проверка, должна ли секция быть подсвечена.
    const style = isHighlighted ? highlightedSvgStyle : defaultSvgStyle; // Выбор стиля.

    // Установка атрибутов для SVG-прямоугольника.
    rect.setAttribute('x', String(section.coords.x)); rect.setAttribute('y', String(section.coords.y));
    rect.setAttribute('width', String(section.coords.w)); rect.setAttribute('height', String(section.coords.h));
    rect.setAttribute('stroke', style.stroke); rect.setAttribute('stroke-width', String(style.strokeWidth));
    rect.setAttribute('stroke-opacity', String(style.strokeOpacity));
    rect.setAttribute('fill', style.fill); rect.setAttribute('fill-opacity', String(style.fillOpacity));
    rect.setAttribute('data-testid', `section-rect-${section.name}${isHighlighted ? '-highlighted' : ''}`);
    svgElement.appendChild(rect);

    // Если секция подсвечена, добавляем текстовую метку с ее названием.
    if (isHighlighted) {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(section.coords.x + section.coords.w / 2)); // Центрирование текста.
      text.setAttribute('y', String(section.coords.y + section.coords.h / 2 + 4)); // Небольшое смещение для лучшего вида.
      text.setAttribute('font-size', '12'); text.setAttribute('font-weight', 'bold');
      text.setAttribute('text-anchor', 'middle'); text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('fill', 'rgba(0,0,0,0.8)'); text.setAttribute('stroke', 'white');
      text.setAttribute('stroke-width', '0.4px'); text.setAttribute('paint-order', 'stroke'); // Обводка текста для лучшей читаемости.
      text.setAttribute('data-testid', `section-text-${section.name}`);
      text.textContent = section.name;
      svgElement.appendChild(text);
    }
  });

  // Удаление старого SVG-слоя (если он был) и добавление нового.
  if (svgOverlay.value) { map.removeLayer(svgOverlay.value); }
  svgOverlay.value = L.svgOverlay(svgElement, imageBounds, { opacity: 1, interactive: false });
  svgOverlay.value.addTo(map);
};

</script>

<style>
/* Стили для обеспечения корректного Flexbox-расположения контента на странице карты. */
ion-content.map-content-flex::part(scroll) {
  padding: 0;
  display: flex;
  flex-direction: column;
  height: 100%; /* Важно для растягивания flex-элементов на всю высоту. */
}
/* Стили контейнера карты Leaflet. */
#leaflet-map-container {
  flex: 1; /* Позволяет карте занимать все доступное пространство по высоте. */
  min-height: 150px; /* Минимальная высота для предотвращения схлопывания. */
  width: 100%;
  background-color: #dddddd; /* Фоновый цвет на случай, если карта не загрузится. */
  display: block;
  position: relative; /* Необходимо для корректного позиционирования слоев Leaflet. */
  overflow: hidden; /* Предотвращает выход содержимого карты за пределы контейнера. */
}
/* Стили для плейсхолдеров (загрузка, ошибка), отображаемых поверх карты. */
.map-placeholder {
  position: absolute; top: 0; left: 0; right: 0; bottom: 0;
  display: flex; flex-direction: column; justify-content: center;
  align-items: center; color: var(--ion-color-medium); text-align: center;
  padding: 10px; background-color: rgba(224, 224, 224, 0.9);
  z-index: 10; /* Плейсхолдер должен быть выше слоев карты. */
  pointer-events: none; /* Позволяет событиям мыши/касания проходить "сквозь" плейсхолдер к карте. */
}
/* Стили для контейнера с информацией о результатах поиска. */
.results-info-container-flex {
  flex-shrink: 0; /* Предотвращает сжатие контейнера, если контент карты большой. */
  width: 100%;
  max-height: 35vh; /* Ограничение максимальной высоты. */
  overflow-y: auto; /* Добавление вертикальной прокрутки при необходимости. */
  background-color: rgba(255, 255, 255, 0.95); /* Полупрозрачный фон. */
  border-top: 1px solid #cccccc;
  z-index: 1; /* z-index меньше, чем у плейсхолдера карты. */
}
.results-info-container-flex ion-list { padding-top: 0; }
.results-info-container-flex ion-list-header { font-weight: bold; padding-bottom: 4px; border-bottom: 1px solid #e0e0e0; padding-top: 8px; }
.results-info-container-flex ion-item { --padding-start: 10px; --padding-end: 10px; --min-height: 40px; }
.results-info-container-flex ion-item h2 { font-size: 0.95em; font-weight: normal; margin: 2px 0; }
.results-info-container-flex ion-item p { font-size: 0.8em; color: var(--ion-color-medium-shade); margin: 0; }
/* Стили для блока информации о подсвеченных секциях или отсутствия результатов. */
.highlight-info-flex {
  text-align: center; padding: 15px 10px; font-size: 0.9em;
  color: var(--ion-color-medium-shade); min-height: 30px;
}
/* Стили для текста внутри SVG (имена секций). */
#leaflet-map-container svg text {
  pointer-events: none; /* Текст не должен перехватывать события мыши/касания. */
  font-family: sans-serif;
  font-size: 12px;
  font-weight: bold;
  fill: #333;
  stroke: white; /* Обводка для лучшей читаемости на разных фонах. */
  stroke-width: 0.4px;
  paint-order: stroke; /* Определяет порядок отрисовки обводки и заливки. */
}
</style>