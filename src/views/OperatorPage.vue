<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Панель Оператора</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content :fullscreen="true" class="ion-padding">

      <ion-button expand="block" @click="triggerImageFileUpload" data-testid="load-image-button">
        <ion-icon slot="start" :icon="cloudUploadOutline"></ion-icon>
        Загрузить Схему Магазина (Картинка)
      </ion-button>
      <input
        type="file"
        accept="image/*"
        ref="imageFileInputRef"
        @change="handleImageFileChange"
        style="display: none;"
        data-testid="image-file-input" />

      <div class="map-editor-container ion-margin-top">
        <canvas
          ref="canvasRef"
          @mousedown="handleMouseDown"
          @mousemove="handleMouseMove"
          @mouseup="handleMouseUp"
          @mouseleave="handleMouseLeave"
          @touchstart.prevent="handleTouchStart"
          @touchmove.prevent="handleTouchMove"
          @touchend.prevent="handleTouchEnd"
          style="border: 1px solid grey; max-width: 100%; height: auto;"
          data-testid="operator-canvas" ></canvas>
      </div>

      <div data-testid="defined-sections-list-container"> <h3>Определенные секции:</h3>
        <ul v-if="sections.length > 0">
            <li v-for="(section) in sections" :key="section.id" :data-testid="`section-list-item-${section.id}`">
              {{ section.name }} ({{ section.coords.x }}, {{ section.coords.y }}, {{ section.coords.w }}x{{ section.coords.h }})
            </li>
        </ul>
        <p data-testid="no-sections-message" v-else>Секции еще не добавлены.</p> </div>

      <ion-button
        expand="block"
        color="success"
        class="ion-margin-top"
        :disabled="!mapImageSrc && sections.length === 0 && products.length === 0"
        @click="saveData"
        data-testid="save-all-button" >
        <ion-icon slot="start" :icon="saveOutline"></ion-icon>
        Сохранить Все Изменения
      </ion-button>

      <hr style="margin: 20px 0;">

      <ion-list lines="inset" class="ion-margin-top" data-testid="product-list-container"> <ion-list-header>
          <ion-label>Управление Товарами</ion-label>
          <ion-button
            @click="triggerTxtFileUpload"
            fill="clear"
            size="small"
            title="Загрузить список товаров из .txt"
            data-testid="load-txt-button" >
            <ion-icon slot="icon-only" :icon="documentTextOutline"></ion-icon>
          </ion-button>
          <ion-button
            @click="promptForNewProduct"
            fill="clear"
            size="small"
            title="Добавить товар вручную"
            data-testid="add-product-button" >
            <ion-icon slot="icon-only" :icon="addCircleOutline"></ion-icon>
          </ion-button>
        </ion-list-header>

        <input
          type="file"
          accept=".txt,text/plain"
          ref="txtFileInputRef"
          @change="handleTxtFileChange"
          style="display: none;"
          data-testid="txt-file-input" />

        <ion-item data-testid="no-products-message" v-if="products.length === 0 && !isLoadingData"> <ion-label class="ion-text-center ion-text-wrap">
            <p>Товары еще не добавлены.</p>
          </ion-label>
        </ion-item>
        <ion-item data-testid="loading-indicator" v-if="isLoadingData"> <ion-spinner name="dots" slot="start"></ion-spinner>
            <ion-label>Загрузка данных...</ion-label>
        </ion-item>

        <ion-item v-for="(product) in products" :key="product.id" :data-testid="`product-item-${product.id}`">
          <ion-label>
            <h2>{{ product.name }}</h2>
            <p>Секции: {{ product.sectionNames.length > 0 ? product.sectionNames.join(', ') : 'Не заданы' }}</p>
          </ion-label>
          <ion-button
            fill="clear"
            slot="end"
            @click="promptForProductSections(product)"
            title="Назначить секции"
            :data-testid="`assign-sections-button-${product.id}`"
          >
            <ion-icon slot="icon-only" :icon="optionsOutline"></ion-icon>
          </ion-button>
          <ion-button
            fill="clear"
            color="danger"
            slot="end"
            @click="confirmDeleteProduct(product)"
            title="Удалить товар"
            :data-testid="`delete-product-button-${product.id}`"
            >
            <ion-icon slot="icon-only" :icon="trashOutline"></ion-icon>
          </ion-button>
        </ion-item>
      </ion-list>

    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonIcon,
  IonList, IonListHeader, IonItem, IonLabel, IonSpinner,
} from '@ionic/vue';
import {
  cloudUploadOutline, saveOutline, addCircleOutline, optionsOutline, trashOutline,
  documentTextOutline
} from 'ionicons/icons';
// Импорт оберток для взаимодействия с Capacitor API, обеспечивающих корректную работу как на устройстве, так и при тестировании.
import {
  AppPreferences,
  AppFilesystem,
  AppToast,
  AppAlertController,
  Directory,
  Encoding
} from '@/utils/capacitor-wrappers';

// Ключи для хранения данных в Preferences и имя файла для сохранения изображения карты.
// Использование констант улучшает читаемость и упрощает изменение ключей при необходимости.
const MAP_IMAGE_URI_KEY = 'storeMapFileUri';
const MAP_SECTIONS_KEY = 'storeMapSections';
const PRODUCTS_KEY = 'storeProducts';
const SAVED_MAP_FILENAME = 'storeMapImage.txt';

// Определения интерфейсов для представления данных о секциях и товарах.
// Это обеспечивает типизацию и улучшает понимание структуры данных.
interface Section { id: string; name: string; coords: { x: number; y: number; w: number; h: number }; }
interface Product { id: string; name: string; sectionNames: string[]; }

// Реактивные переменные (refs) для управления состоянием компонента.
// Ссылки на DOM-элементы для программного взаимодействия (например, вызов click() для скрытых input).
const imageFileInputRef = ref<HTMLInputElement | null>(null);
const txtFileInputRef = ref<HTMLInputElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null); // Ссылка на элемент canvas для рисования.

// Состояние, связанное с картой магазина: источник изображения, элемент изображения, контекст рисования.
const mapImageSrc = ref<string | null>(null); // Data URL загруженного изображения карты.
const mapImageElement = ref<HTMLImageElement | null>(null); // HTMLImageElement для работы с загруженной картой.
const ctxRef = ref<CanvasRenderingContext2D | null>(null); // 2D контекст холста для операций рисования.

// Основные данные приложения: список секций и список товаров.
const sections = ref<Section[]>([]);
const products = ref<Product[]>([]);
const isLoadingData = ref(true); // Флаг для отображения индикатора загрузки начальных данных.

// Состояние, связанное с процессом рисования секций на холсте.
const isDrawing = ref(false); // Флаг, активен ли процесс рисования в данный момент.
const startX = ref(0); // Начальная координата X при рисовании прямоугольника.
const startY = ref(0); // Начальная координата Y при рисовании прямоугольника.
const currentRect = ref<{ x: number; y: number; w: number; h: number } | null>(null); // Текущий рисуемый прямоугольник.

// Хук жизненного цикла onMounted: выполняется после монтирования компонента.
// Используется для инициализации контекста рисования холста и загрузки сохраненных данных.
onMounted(async () => {
  if (canvasRef.value) {
    ctxRef.value = canvasRef.value.getContext('2d');
    console.log('[DEBUG OperatorPage APP onMounted] canvasRef exists, ctxRef set:', !!ctxRef.value);
  } else {
    console.warn('[DEBUG OperatorPage APP onMounted] canvasRef is NULL onMounted!');
  }

  // Специальная логика для тестового окружения Cypress: предоставляет доступ к внутреннему состоянию компонента.
  if (window.Cypress) {
    (window as any).testState = {
      getMapImageSrc: () => mapImageSrc.value,
      getIsDrawing: () => isDrawing.value,
      getCurrentRect: () => currentRect.value,
    };
    console.log('[DEBUG OperatorPage APP onMounted] testState exposed to window for Cypress. Initial mapImageSrc:', mapImageSrc.value);
  }

  await loadData(); // Загрузка данных при инициализации страницы.
});

// Программно вызывает клик на скрытом элементе input для выбора файла изображения.
const triggerImageFileUpload = () => { imageFileInputRef.value?.click(); };

// Обработчик события изменения в input для загрузки изображения карты.
// Отвечает за чтение файла, его отображение на холсте и обновление состояния.
const handleImageFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file && canvasRef.value && file.type.startsWith('image/')) {
    const reader = new FileReader(); // Используется FileReader для асинхронного чтения содержимого файла.
    reader.onload = async (e) => {
      const imgSrc = e.target?.result as string;
      mapImageSrc.value = imgSrc; // Сохраняем Data URL изображения.
      await nextTick(); // Ожидаем обновления DOM перед дальнейшими операциями.

      const img = new Image(); // Создаем HTMLImageElement для получения размеров изображения.
      img.onload = async () => {
        if (canvasRef.value && ctxRef.value) {
          mapImageElement.value = img;
          // Устанавливаем размеры холста равными размерам загруженного изображения.
          canvasRef.value.width = img.naturalWidth;
          canvasRef.value.height = img.naturalHeight;
          sections.value = []; // Очищаем существующие секции при загрузке новой карты.
          await nextTick();
          redrawCanvas(); // Перерисовываем холст с новым изображением.
        } else {
          // Обработка ситуации, когда холст или контекст не доступны.
        }
      };
      img.onerror = async () => {
        mapImageSrc.value = null; mapImageElement.value = null;
        await AppToast.show({ text: 'Не удалось загрузить изображение.', duration: 'short'});
        redrawCanvas(); // Перерисовываем, чтобы отобразить состояние без карты.
      }
      img.src = imgSrc; // Запускает загрузку изображения.
    };
    reader.onerror = async () => {
      mapImageSrc.value = null; mapImageElement.value = null;
      await AppToast.show({ text: 'Ошибка чтения файла изображения.', duration: 'short'});
      redrawCanvas();
    }
    reader.readAsDataURL(file); // Читаем файл как Data URL.
  } else if (file && !file.type.startsWith('image/')) {
    AppToast.show({ text: 'Пожалуйста, выберите файл изображения.', duration: 'short'});
  }
  if (target) target.value = ''; // Сбрасываем значение input для возможности повторной загрузки того же файла.
};

// Программно вызывает клик на скрытом элементе input для выбора текстового файла.
const triggerTxtFileUpload = () => { txtFileInputRef.value?.click(); };

// Обработчик события изменения в input для загрузки списка товаров из .txt файла.
// Отвечает за чтение файла и передачу его содержимого на обработку.
const handleTxtFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) { return; }
  // Проверка типа файла.
  if (file.type !== 'text/plain' && !file.name.endsWith('.txt')) {
    AppToast.show({ text: 'Пожалуйста, выберите файл .txt', duration: 'short'});
    if (target) target.value = ''; return;
  }
  const reader = new FileReader();
  reader.onload = async (e) => {
    const fileContent = e.target?.result as string;
    if (typeof fileContent !== 'string') {
      await AppToast.show({ text: 'Не удалось прочитать содержимое файла.', duration: 'short'}); return;
    }
    try {
      // Обработка содержимого файла для импорта списка товаров.
      const result = processProductList(fileContent);
      await AppToast.show({ text: `Импорт завершен. Добавлено: ${result.added}, Обновлено: ${result.updated}. ${result.warnings.length > 0 ? 'Предупреждений: ' + result.warnings.length : ''}`, duration: 'long' });
      if (result.warnings.length > 0) { console.warn("Предупреждения при импорте:", result.warnings); }
    } catch (error) {
      console.error("Ошибка обработки файла списка товаров:", error);
      await AppToast.show({ text: 'Ошибка при обработке файла.', duration: 'short'});
    } finally { if (target) target.value = ''; } // Сброс input.
  };
  reader.onerror = async () => {
    await AppToast.show({ text: 'Ошибка чтения текстового файла.', duration: 'short'});
    if (target) target.value = '';
  };
  reader.readAsText(file); // Читаем файл как текст.
};

// Функция обработки текстового содержимого файла со списком товаров.
// Парсит строки, добавляет новые товары или обновляет существующие, связывает их с секциями.
// Возвращает статистику по импорту и предупреждения.
const processProductList = (content: string): { added: number, updated: number, warnings: string[] } => {
  let addedCount = 0;
  let updatedCount = 0;
  const warnings: string[] = [];
  const lines = content.split(/\r?\n/); // Разбиваем содержимое на строки.
  const existingSectionNames = new Set(sections.value.map(s => s.name)); // Множество для быстрой проверки существования секции.

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmedLine = line.trim();
    // Пропускаем пустые строки или строки без разделителя ';'.
    if (!trimmedLine || !trimmedLine.includes(';')) {
      return;
    }
    const parts = trimmedLine.split(';');
    const productName = parts[0].trim();
    // Пропускаем строки с пустым именем товара.
    if (!productName) {
      warnings.push(`Строка ${lineNumber}: Пропущено - пустое имя товара.`);
      return;
    }
    const sectionNamesRaw = (parts[1] || '').trim(); // Имена секций, разделенные запятыми.
    let parsedSectionNames: string[] = [];
    if (sectionNamesRaw) {
      parsedSectionNames = sectionNamesRaw
        .split(',')
        .map(name => name.trim())
        .filter(name => name.length > 0);
    }
    // Фильтруем имена секций, оставляя только существующие.
    const validSectionNames = parsedSectionNames.filter(name => {
      if (existingSectionNames.has(name)) {
        return true;
      } else {
        warnings.push(`Строка ${lineNumber}: Секция "${name}" для товара "${productName}" не найдена и будет проигнорирована.`);
        return false;
      }
    });

    // Поиск существующего товара для обновления или создание нового.
    const existingProductIndex = products.value.findIndex(p => p.name.toLowerCase() === productName.toLowerCase());
    if (existingProductIndex > -1) { // Товар существует - обновляем секции.
      products.value[existingProductIndex].sectionNames = validSectionNames;
      updatedCount++;
    } else { // Новый товар - добавляем в список.
      const newProduct: Product = {
        id: Date.now().toString() + Math.random().toString(36).substring(2, 7) + productName.replace(/\s/g, ''), // Генерация временного ID.
        name: productName,
        sectionNames: validSectionNames
      };
      products.value.push(newProduct);
      addedCount++;
    }
  });
  return { added: addedCount, updated: updatedCount, warnings };
};

// Преобразует координаты события (мышь/касание) в координаты относительно холста (canvas).
// Учитывает возможное масштабирование холста и его положение на странице.
const getCoords = (event: MouseEvent | TouchEvent): { x: number; y: number } => {
  const canvas = canvasRef.value;
  if (!canvas) {
    return { x: 0, y: 0 };
  }
  const rect = canvas.getBoundingClientRect(); // Получаем размеры и позицию холста.
  let clientX: number | undefined;
  let clientY: number | undefined;

  // Определение координат в зависимости от типа события (мышь или касание).
  if ((event as TouchEvent).touches && (event as TouchEvent).touches.length > 0) {
    clientX = (event as TouchEvent).touches[0].clientX;
    clientY = (event as TouchEvent).touches[0].clientY;
  } else if (typeof (event as MouseEvent).clientX === 'number' && typeof (event as MouseEvent).clientY === 'number') {
    clientX = (event as MouseEvent).clientX;
    clientY = (event as MouseEvent).clientY;
  } else {
    return { x: 0, y: 0 };
  }

  // Расчет масштаба, если размеры холста на странице отличаются от его внутренних размеров.
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  // Применение масштаба и смещения для получения точных координат на холсте.
  const canvasX = (clientX - rect.left) * scaleX;
  const canvasY = (clientY - rect.top) * scaleY;
  return { x: Math.round(canvasX), y: Math.round(canvasY) };
};

// Обработчики событий мыши и касаний для рисования секций на холсте.
// Эти функции управляют состоянием isDrawing и currentRect для интерактивного создания прямоугольников.
const handleMouseDown = (event: MouseEvent) => {
  if (!ctxRef.value || !mapImageSrc.value) { return; } // Не начинаем рисовать, если нет карты или контекста.
  isDrawing.value = true;
  const { x, y } = getCoords(event);
  startX.value = x;
  startY.value = y;
  currentRect.value = { x: x, y: y, w: 0, h: 0 }; // Инициализация текущего прямоугольника.
};

const handleMouseMove = (event: MouseEvent) => {
  if (!isDrawing.value || !ctxRef.value || !currentRect.value) return;
  const { x, y } = getCoords(event);
  // Обновление размеров текущего прямоугольника в процессе движения мыши.
  currentRect.value = { x: startX.value, y: startY.value, w: x - startX.value, h: y - startY.value };
  redrawCanvas(); // Перерисовка холста для отображения текущего прямоугольника.
};

const handleMouseLeave = () => {
  // Если мышь покинула холст во время рисования, отменяем текущее рисование.
  if (isDrawing.value) {
    isDrawing.value = false;
    currentRect.value = null;
    redrawCanvas();
  }
};

const handleMouseUp = () => {
  if (!currentRect.value || !ctxRef.value) {
    if (isDrawing.value) isDrawing.value = false;
    if (currentRect.value) currentRect.value = null;
    redrawCanvas();
    return;
  }
  const wasActuallyDrawing = isDrawing.value;
  isDrawing.value = false; // Завершаем процесс рисования.

  const rectToProcess = { ...currentRect.value }; // Копируем данные текущего прямоугольника.
  currentRect.value = null; // Сбрасываем текущий прямоугольник.

  // Нормализация координат и размеров (ширина и высота должны быть положительными).
  let finalX = rectToProcess.x;
  let finalY = rectToProcess.y;
  let finalWidth = rectToProcess.w;
  let finalHeight = rectToProcess.h;

  if (finalWidth < 0) { finalX = rectToProcess.x + rectToProcess.w; finalWidth = Math.abs(rectToProcess.w); }
  if (finalHeight < 0) { finalY = rectToProcess.y + rectToProcess.h; finalHeight = Math.abs(rectToProcess.h); }

  // Если прямоугольник достаточно большой, запрашиваем имя для новой секции.
  if (wasActuallyDrawing && (finalWidth > 5 || finalHeight > 5)) {
    promptForSectionName({ x: finalX, y: finalY, w: finalWidth, h: finalHeight });
  } else {
    redrawCanvas(); // Иначе просто перерисовываем холст (убираем временный прямоугольник).
  }
};

// Аналогичные обработчики для сенсорных событий (touchstart, touchmove, touchend).
// Логика повторяет обработчики мыши для обеспечения работы на мобильных устройствах.
const handleTouchStart = (event: TouchEvent) => {
  if (!ctxRef.value || !mapImageSrc.value) { return; }
  isDrawing.value = true;
  const { x, y } = getCoords(event);
  startX.value = x;
  startY.value = y;
  currentRect.value = { x: x, y: y, w: 0, h: 0 };
};

const handleTouchMove = (event: TouchEvent) => {
  if (!isDrawing.value || !ctxRef.value || !currentRect.value) return;
  const { x, y } = getCoords(event);
  currentRect.value = { x: startX.value, y: startY.value, w: x - startX.value, h: y - startY.value };
  redrawCanvas();
};

const handleTouchEnd = () => {
  if (!currentRect.value || !ctxRef.value) {
    if (isDrawing.value) isDrawing.value = false;
    if (currentRect.value) currentRect.value = null;
    redrawCanvas();
    return;
  }
  const wasActuallyDrawing = isDrawing.value;
  isDrawing.value = false;
  const rectToProcess = { ...currentRect.value };
  currentRect.value = null;
  let finalX = rectToProcess.x;
  let finalY = rectToProcess.y;
  let finalWidth = rectToProcess.w;
  let finalHeight = rectToProcess.h;
  if (finalWidth < 0) { finalX = rectToProcess.x + rectToProcess.w; finalWidth = Math.abs(rectToProcess.w); }
  if (finalHeight < 0) { finalY = rectToProcess.y + rectToProcess.h; finalHeight = Math.abs(rectToProcess.h); }

  if (wasActuallyDrawing && (finalWidth > 5 || finalHeight > 5)) {
    promptForSectionName({ x: finalX, y: finalY, w: finalWidth, h: finalHeight });
  } else {
    redrawCanvas();
  }
};

// Функция полной перерисовки холста.
// Отображает фоновое изображение (карту магазина), все сохраненные секции и текущий рисуемый прямоугольник (если есть).
const redrawCanvas = () => {
  if (!ctxRef.value || !canvasRef.value) { console.warn("redrawCanvas: Контекст или canvas не найден"); return; }
  const ctx = ctxRef.value; const canvas = canvasRef.value;
  ctx.clearRect(0, 0, canvas.width, canvas.height); // Очистка холста.

  // Отрисовка изображения карты, если оно загружено.
  if (mapImageElement.value && mapImageElement.value.complete && mapImageElement.value.naturalWidth > 0) {
    try { ctx.drawImage(mapImageElement.value, 0, 0, canvas.width, canvas.height); } catch (e) { console.error("Ошибка отрисовки карты:", e); }
  } else { // Если карты нет, рисуем плейсхолдер.
    ctx.fillStyle = '#eee'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'black'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '14px sans-serif';
    ctx.fillText(mapImageSrc.value ? 'Загрузка карты...' : 'Загрузите карту магазина', canvas.width/2, canvas.height/2);
  }
  ctx.lineWidth = 2;
  // Отрисовка всех сохраненных секций.
  sections.value.forEach(section => {
    const { x, y, w, h } = section.coords;
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)'; // Красный для существующих секций
    ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
    ctx.strokeRect(x, y, w, h);
    ctx.fillRect(x, y, w, h);
    const centerX = x + w / 2;
    const centerY = y + h / 2;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(section.name, centerX, centerY); // Отображение имени секции.
  });
  // Отрисовка текущего рисуемого прямоугольника (если процесс рисования активен).
  if (isDrawing.value && currentRect.value) {
    ctx.strokeStyle = 'rgba(0, 0, 255, 0.7)'; // Синий для нового рисуемого прямоугольника
    ctx.fillStyle = 'rgba(0, 0, 255, 0.2)';
    if (currentRect.value.w !== 0 || currentRect.value.h !== 0) {
        ctx.strokeRect(currentRect.value.x, currentRect.value.y, currentRect.value.w, currentRect.value.h);
        ctx.fillRect(currentRect.value.x, currentRect.value.y, currentRect.value.w, currentRect.value.h);
    }
  }
  ctx.lineWidth = 1;
};

// Вызывает диалоговое окно для ввода имени новой секции.
// После подтверждения добавляет секцию в список, если имя валидно и уникально.
const promptForSectionName = async (coords: { x: number; y: number; w: number; h: number }) => {
  const alert = await AppAlertController.create({
    header: 'Название секции',
    inputs: [{ name: 'sectionName', type: 'text', placeholder: 'Например: Овощи', attributes: { autocapitalize: 'sentences', enterkeyhint: 'done'} }],
    buttons: [
      { text: 'Отмена', role: 'cancel', handler: () => { redrawCanvas(); } }, // Перерисовать для очистки временного прямоугольника
      { text: 'ОК', handler: (data) => {
          const name = data.sectionName?.trim();
          if (name && coords.w > 0 && coords.h > 0) { // Проверка на пустое имя и валидные размеры.
            if (sections.value.some(s => s.name.toLowerCase() === name.toLowerCase())) { // Проверка уникальности имени.
              AppToast.show({ text: `Секция с именем "${name}" уже существует!`, duration: 'short'});
            } else {
              const newSection: Section = {
                id: Date.now().toString() + Math.random().toString(36).substring(2, 7), // Временный ID.
                name: name,
                coords: coords
              };
              sections.value.push(newSection);
            }
          } else {
            if (!name) AppToast.show({ text: 'Название секции не может быть пустым.', duration: 'short'});
          }
          redrawCanvas(); // Перерисовать для отображения новой секции или очистки.
        }
      }
    ],
    backdropDismiss: false // Запрет закрытия алерта по клику на фон.
  });
  await alert.present();
};

// Вызывает диалоговое окно для добавления нового товара.
// Добавляет товар в список, если имя валидно и уникально.
const promptForNewProduct = async () => {
  const alert = await AppAlertController.create({
    header: 'Новый товар',
    inputs: [{ name: 'productName', type: 'text', placeholder: 'Название товара', attributes: { autocapitalize: 'sentences', enterkeyhint: 'done' } }],
    buttons: [
      { text: 'Отмена', role: 'cancel' },
      { text: 'Добавить', handler: (data) => {
          const name = data.productName?.trim();
          if (name) {
            if (products.value.some(p => p.name.toLowerCase() === name.toLowerCase())) {
              AppToast.show({ text: `Товар с именем "${name}" уже существует!`, duration: 'short'});
              return;
            }
            const newProduct: Product = {
              id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
              name: name,
              sectionNames: [] // Новый товар добавляется без назначенных секций.
            };
            products.value.push(newProduct);
            AppToast.show({ text: `Товар "${name}" добавлен. Не забудьте назначить секции и сохранить изменения.`, duration: 'long'});
          } else {
            AppToast.show({ text: 'Название не может быть пустым.', duration: 'short'});
          }
        }}
    ],
    backdropDismiss: false
  });
  await alert.present();
};

// Вызывает диалоговое окно для назначения или изменения секций для выбранного товара.
// Использует чекбоксы для выбора из списка существующих секций.
const promptForProductSections = async (product: Product) => {
  if (sections.value.length === 0) {
    await AppToast.show({ text: 'Сначала определите секции на карте!', duration: 'short'});
    return;
  }
  // Формирование списка инпутов (чекбоксов) на основе существующих секций.
  const sectionInputs = sections.value.map(section => ({
    name: section.name, type: 'checkbox' as const, label: section.name, value: section.name, checked: product.sectionNames.includes(section.name)
  }));
  const alert = await AppAlertController.create({
    header: `Секции для "${product.name}"`,
    inputs: sectionInputs,
    buttons: [
      { text: 'Отмена', role: 'cancel' },
      { text: 'Сохранить', handler: (selectedSectionNames: string[]) => {
          // selectedSectionNames - массив имен выбранных секций.
          const productIndex = products.value.findIndex(p => p.id === product.id);
          if (productIndex > -1) {
            products.value[productIndex].sectionNames = selectedSectionNames || []; // Обновляем секции товара.
            AppToast.show({text:'Назначение секций обновлено. Не забудьте сохранить все изменения.', duration:'long'})
          }
        }}
    ],
    backdropDismiss: false
  });
  await alert.present();
};

// Вызывает диалоговое окно для подтверждения удаления товара.
// Удаляет товар из локального списка `products`.
const confirmDeleteProduct = async (productToDelete: Product) => {
  const alert = await AppAlertController.create({
    header: 'Подтверждение удаления',
    message: `Вы уверены, что хотите удалить товар "${productToDelete.name}"? Это действие нельзя будет отменить.`,
    buttons: [
      { text: 'Отмена', role: 'cancel', cssClass: 'secondary' },
      { text: 'Удалить', cssClass: 'danger', handler: () => {
          const index = products.value.findIndex(p => p.id === productToDelete.id);
          if (index > -1) {
            products.value.splice(index, 1); // Удаление товара из массива.
            AppToast.show({ text: `Товар "${productToDelete.name}" удален. Нажмите 'Сохранить Все Изменения' для подтверждения.`, duration: 'long' });
          }
        },
      },
    ],
    backdropDismiss: false
  });
  await alert.present();
};

// Загружает все данные (карта, секции, товары) из постоянного хранилища (Preferences, Filesystem).
// Выполняется при инициализации компонента для восстановления предыдущего состояния.
const loadData = async () => {
  isLoadingData.value = true;
  let mapUri: string | null = null;
  try {
    // Параллельная загрузка всех данных для ускорения.
    const [sectionsResult, productsResult, uriResult] = await Promise.all([
      AppPreferences.get({ key: MAP_SECTIONS_KEY }),
      AppPreferences.get({ key: PRODUCTS_KEY }),
      AppPreferences.get({ key: MAP_IMAGE_URI_KEY })
    ]);
    sections.value = sectionsResult.value ? JSON.parse(sectionsResult.value) : [];
    products.value = productsResult.value ? JSON.parse(productsResult.value) : [];
    mapUri = uriResult.value;

    mapImageElement.value = null;
    mapImageSrc.value = null;

    if (mapUri) { // Если URI карты сохранен, пытаемся загрузить изображение.
      try {
        const readFileResult = await AppFilesystem.readFile({ path: mapUri, encoding: Encoding.UTF8 });
        const loadedDataUrl = readFileResult.data as string;

        if (loadedDataUrl && loadedDataUrl.startsWith('data:image')) { // Проверка, что это Data URL изображения.
          mapImageSrc.value = loadedDataUrl;
          await nextTick();
          const img = new Image();
          try {
            // Асинхронная загрузка изображения для получения его размеров.
            await new Promise<void>((resolve, reject) => {
              img.onload = async () => {
                if (canvasRef.value) {
                  mapImageElement.value = img;
                  canvasRef.value.width = img.naturalWidth;
                  canvasRef.value.height = img.naturalHeight;
                  await nextTick();
                  redrawCanvas(); // Отображаем загруженную карту.
                  resolve();
                } else {
                  reject(new Error("Canvas ref не найден в img.onload при загрузке данных"));
                }
              };
              img.onerror = (err) => {
                mapImageSrc.value = null; mapImageElement.value = null;
                reject(err instanceof Error ? err : new Error('Ошибка загрузки изображения карты'));
              };
              img.src = loadedDataUrl;
            });
          } catch (promiseError) { // Обработка ошибок загрузки самого изображения.
            mapImageSrc.value = null; mapImageElement.value = null;
            await nextTick(); redrawCanvas();
            await AppToast.show({ text: 'Не удалось загрузить изображение карты.', duration: 'short' });
          }
        } else { // Если Data URL невалиден.
          mapImageSrc.value = null;
          await nextTick(); redrawCanvas();
        }
      } catch (readError) { // Обработка ошибок чтения файла карты из файловой системы.
        await AppPreferences.remove({ key: MAP_IMAGE_URI_KEY }); // Удаляем невалидный URI.
        mapImageSrc.value = null; mapImageElement.value = null;
        await AppToast.show({ text: 'Ошибка загрузки сохраненной карты.', duration: 'short' });
        await nextTick(); redrawCanvas();
      }
    } else { // Если URI карты не найден, просто перерисовываем холст (будет плейсхолдер).
      await nextTick(); redrawCanvas();
    }
  } catch (error) { // Глобальная обработка ошибок загрузки данных.
    sections.value = []; products.value = [];
    mapImageSrc.value = null; mapImageElement.value = null;
    await AppToast.show({ text: 'Критическая ошибка загрузки данных!', duration: 'long'});
    await nextTick(); redrawCanvas();
  } finally {
    isLoadingData.value = false; // Скрываем индикатор загрузки.
  }
};

// Сохраняет все текущие данные оператора (карта, секции, товары) в постоянное хранилище.
// Карта сохраняется как файл, ее URI - в Preferences. Секции и товары - как JSON строки в Preferences.
const saveData = async () => {
  if (!mapImageSrc.value && sections.value.length === 0 && products.value.length === 0) {
    await AppToast.show({ text: 'Нет данных для сохранения.', duration: 'short'}); return;
  }
  try {
    if (mapImageSrc.value) { // Если есть изображение карты для сохранения.
      try {
        const writeResult = await AppFilesystem.writeFile({
            path: SAVED_MAP_FILENAME, data: mapImageSrc.value, directory: Directory.Data, encoding: Encoding.UTF8, recursive: true
        });
        await AppPreferences.set({ key: MAP_IMAGE_URI_KEY, value: writeResult.uri }); // Сохраняем URI файла.
      } catch (mapSaveError) {
        await AppToast.show({ text: 'Ошибка сохранения файла карты!', duration: 'long'});
      }
    } else { // Если изображения карты нет, удаляем сохраненный ранее URI.
      await AppPreferences.remove({ key: MAP_IMAGE_URI_KEY });
    }
    // Сохранение секций и товаров.
    await AppPreferences.set({ key: MAP_SECTIONS_KEY, value: JSON.stringify(sections.value) });
    await AppPreferences.set({ key: PRODUCTS_KEY, value: JSON.stringify(products.value) });
    await AppToast.show({ text: 'Все данные успешно сохранены!', duration: 'short' });
  } catch (error) {
    await AppToast.show({ text: 'Ошибка сохранения данных!', duration: 'long' });
  }
};
</script>

<style scoped>
/* Стили для контейнера редактора карты, обеспечивающие его корректное отображение и поведение. */
.map-editor-container {
  margin-top: 10px;
  touch-action: none; /* Отключает стандартные сенсорные действия браузера (например, скролл) на элементе. */
  overflow: auto; /* Добавляет прокрутку, если холст больше контейнера. */
  max-height: 55vh; /* Ограничивает максимальную высоту контейнера. */
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #f0f0f0;
  border: 1px dashed var(--ion-color-medium);
}
/* Стили для холста (canvas). */
canvas {
  cursor: crosshair; /* Устанавливает курсор в виде перекрестия для режима рисования. */
  display: block; /* Убирает лишние отступы под холстом. */
}
/* Стилизация заголовка списка в Ionic. */
ion-list-header {
  align-items: center;
  --min-height: 40px;
}
ion-list-header ion-label {
  margin: 0;
}
ion-list-header ion-button {
  margin: 0 0 0 5px;
  --padding-start: 5px;
  --padding-end: 5px;
  height: 30px;
}
/* Стилизация текста в элементах списка (товары). */
ion-item p {
  font-size: 0.8em;
  color: var(--ion-color-medium-shade);
  white-space: normal; /* Позволяет тексту переноситься на новую строку. */
}
/* Стили для списка определенных секций. */
ul {
  list-style-type: none; /* Убирает стандартные маркеры списка. */
  padding-left: 0;
  margin-top: 5px;
}
li {
  padding: 2px 0;
  font-size: 0.9em;
}
/* Стилизация горизонтального разделителя. */
hr {
  border: none;
  border-top: 1px solid var(--ion-color-step-200, #cccccc);
}
</style>